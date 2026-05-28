require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const { startBot, getBotUsername } = require('./bot');
const { startTunnel } = require('./tunnel');

const app = express();
const PORT = process.env.PORT || 3000;

// Accept base64-encoded photos in the kid edit form
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => { res.set('Cache-Control', 'no-store, must-revalidate'); next(); });
app.use(session({
  secret: process.env.SESSION_SECRET || 'happy-kids-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// ---- Helpers ----
const today = () => new Date().toISOString().slice(0, 10);

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'unauthorized' });
  next();
}
// requireAdmin / requireValidator gate on the CURRENT CONTEXT, not the user's
// primary role. A TG user whose primary role is admin can switch into a
// validator membership of another family — while in that context they have
// validator permissions, not admin.
function requireAdmin(req, res, next) {
  if (req.session.contextRole !== 'admin') return res.status(403).json({ error: 'admin required' });
  next();
}
function requireValidator(req, res, next) {
  if (req.session.contextRole !== 'validator') return res.status(403).json({ error: 'validator required' });
  next();
}

// ownerOf(session): which user "owns" the data this session can see/edit
// in the CURRENT CONTEXT. Always the parent_id of the active context.
function ownerOf(req) {
  return req.session.contextParentId;
}

function loginSession(req, user) {
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role; // user's "primary" role (admin or legacy validator)
  req.session.parentId = user.parent_id || null;
  // Default context: own family.
  //   admin   → (parent_id = self.id, role = 'admin')
  //   validator (legacy login/password) → (parent_id = user.parent_id, role = 'validator')
  if (user.role === 'admin') {
    req.session.contextParentId = user.id;
    req.session.contextRole = 'admin';
  } else {
    req.session.contextParentId = user.parent_id;
    req.session.contextRole = 'validator';
  }
}

// Generate a URL-safe random token for invites.
function genToken(bytes = 18) {
  return crypto.randomBytes(bytes).toString('base64url');
}

// ---- Telegram initData verification ----
// Verifies the HMAC of the initData string from Telegram.WebApp.initData per
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
function verifyTelegramInitData(initData, botToken) {
  if (!initData || !botToken) return null;
  let params;
  try { params = new URLSearchParams(initData); }
  catch { return null; }
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (computed !== hash) return null;
  const userJson = params.get('user');
  if (!userJson) return null;
  try { return JSON.parse(userJson); } // { id, first_name, ... }
  catch { return null; }
}

function getKidProfile(kidId, ownerId) {
  const kid = db.prepare('SELECT * FROM kids WHERE id = ? AND owner_id = ?').get(kidId, ownerId);
  if (!kid) return null;

  const t = today();
  const todayTasks = db.prepare('SELECT * FROM tasks WHERE kid_id = ? AND date = ? ORDER BY id').all(kidId, t);
  const todayReward = db.prepare('SELECT * FROM rewards WHERE kid_id = ? AND date = ?').get(kidId, t);

  const historyRows = db.prepare(`
    SELECT date,
           SUM(completed) AS done,
           COUNT(*) AS total
    FROM tasks
    WHERE kid_id = ? AND date != ?
    GROUP BY date
    ORDER BY date DESC
    LIMIT 30
  `).all(kidId, t);

  const history = historyRows.map(row => {
    const reward = db.prepare('SELECT * FROM rewards WHERE kid_id = ? AND date = ?').get(kidId, row.date);
    const tasks = db.prepare('SELECT * FROM tasks WHERE kid_id = ? AND date = ? ORDER BY id').all(kidId, row.date);
    return { date: row.date, done: row.done, total: row.total, reward, tasks };
  });

  const stats = db.prepare(`
    SELECT
      COUNT(DISTINCT date) AS days_with_tasks,
      COUNT(*) AS total_tasks,
      SUM(completed) AS completed_tasks
    FROM tasks WHERE kid_id = ?
  `).get(kidId);

  const rewardsClaimed = db.prepare('SELECT COUNT(*) AS c FROM rewards WHERE kid_id = ? AND claimed = 1').get(kidId).c;

  const calendarRows = db.prepare(`
    SELECT date,
           SUM(completed) AS done,
           COUNT(*) AS total
    FROM tasks WHERE kid_id = ?
    GROUP BY date
  `).all(kidId);
  const rewardRows = db.prepare('SELECT date, claimed FROM rewards WHERE kid_id = ?').all(kidId);
  const calMap = new Map();
  for (const r of calendarRows) calMap.set(r.date, { date: r.date, total: r.total, done: r.done || 0, has_reward: false, claimed: false });
  for (const r of rewardRows) {
    const ex = calMap.get(r.date) || { date: r.date, total: 0, done: 0, has_reward: false, claimed: false };
    ex.has_reward = true;
    ex.claimed = !!r.claimed;
    calMap.set(r.date, ex);
  }
  const calendar = Array.from(calMap.values());

  return {
    kid,
    today: { date: t, tasks: todayTasks, reward: todayReward },
    history,
    calendar,
    stats: { ...stats, rewards_claimed: rewardsClaimed }
  };
}

// Check that a kid belongs to the session's owner. Returns the kid row or null.
function kidGuard(kidId, ownerId) {
  return db.prepare('SELECT * FROM kids WHERE id = ? AND owner_id = ?').get(kidId, ownerId);
}
// Same for tasks: returns row joined with kid ownership info.
function taskGuard(taskId, ownerId) {
  return db.prepare('SELECT * FROM tasks WHERE id = ? AND owner_id = ?').get(taskId, ownerId);
}
function rewardGuard(rewardId, ownerId) {
  return db.prepare('SELECT * FROM rewards WHERE id = ? AND owner_id = ?').get(rewardId, ownerId);
}

// ---- Auth ----
function findUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const user = findUserByUsername(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  loginSession(req, user);
  res.json({ ok: true, username: user.username, role: user.role });
});

// Telegram Mini App auto-login / binding.
// - If tg_user_id is already linked to a user → log them in.
// - If not linked but there's an active session → bind to current user.
// - Otherwise → 401 (client must use /api/login).
app.post('/api/tg-auth', (req, res) => {
  const { initData } = req.body || {};
  const token = process.env.TELEGRAM_TOKEN;
  if (!token) return res.status(503).json({ error: 'telegram not configured' });
  const tgUser = verifyTelegramInitData(initData, token);
  if (!tgUser || !tgUser.id) return res.status(401).json({ error: 'invalid initData' });

  const tgId = String(tgUser.id);
  const linked = db.prepare('SELECT * FROM users WHERE tg_user_id = ?').get(tgId);
  if (linked) {
    // If there's already an active session for a DIFFERENT user, don't
    // silently hijack it — the user explicitly logged in as someone else
    // and we must not switch them back. Just report the conflict.
    if (req.session.userId && req.session.userId !== linked.id) {
      return res.json({ ok: false, action: 'conflict', username: linked.username });
    }
    loginSession(req, linked);
    return res.json({ ok: true, action: 'login', username: linked.username, role: linked.role });
  }

  // Not linked yet. If there's an active session, bind this Telegram id to it.
  if (req.session.userId) {
    try {
      db.prepare('UPDATE users SET tg_user_id = ? WHERE id = ?').run(tgId, req.session.userId);
    } catch (e) {
      return res.status(409).json({ error: 'telegram already linked to another account' });
    }
    return res.json({ ok: true, action: 'bound', username: req.session.username, role: req.session.role });
  }

  // No session, no linked user — auto-register a fresh admin account for this
  // Telegram user. Each Telegram user gets their own tenant (own kids/tasks/
  // rewards/validators). Username is derived from the Telegram numeric id so
  // it's stable and globally unique; password is random (the user will never
  // need it since they always log in via Telegram).
  const username = `tg_${tgId}`;
  const randomPassword = crypto.randomBytes(24).toString('hex');
  const hash = bcrypt.hashSync(randomPassword, 10);
  let userId;
  try {
    const result = db.prepare(
      "INSERT INTO users (username, password_hash, role, parent_id, tg_user_id) VALUES (?, ?, 'admin', NULL, ?)"
    ).run(username, hash, tgId);
    userId = result.lastInsertRowid;
  } catch (e) {
    return res.status(500).json({ error: 'failed to create account' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  loginSession(req, user);
  return res.json({ ok: true, action: 'registered', username: user.username, role: user.role });
});

app.get('/api/has-kids', (req, res) => {
  const row = db.prepare('SELECT COUNT(*) AS c FROM kids').get();
  res.json({ has_kids: row.c > 0 });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ authenticated: false });
  const u = db.prepare('SELECT id, username, role, parent_id, tg_user_id, admin_pin_hash, family_name FROM users WHERE id = ?').get(req.session.userId);
  if (!u) {
    req.session.destroy(() => {});
    return res.json({ authenticated: false });
  }
  // Heal old sessions created before contextParentId/contextRole existed.
  if (!req.session.contextParentId) {
    if (u.role === 'admin') {
      req.session.contextParentId = u.id;
      req.session.contextRole = 'admin';
    } else {
      req.session.contextParentId = u.parent_id;
      req.session.contextRole = 'validator';
    }
  }
  // Context info: name of the family the user is currently acting in.
  const contextParent = db.prepare('SELECT id, username, family_name FROM users WHERE id = ?').get(req.session.contextParentId);
  // Does the user have ≥2 contexts (i.e. can they switch)? Only relevant for
  // admins — legacy validators always have exactly one context.
  let contextCount = 1;
  if (u.role === 'admin') {
    const m = db.prepare('SELECT COUNT(*) AS c FROM memberships WHERE user_id = ?').get(u.id);
    contextCount = 1 + (m.c || 0);
  }
  res.json({
    authenticated: true,
    username: u.username,
    role: u.role,
    tg_linked: !!u.tg_user_id,
    has_pin: !!u.admin_pin_hash,
    family_name: u.family_name || null,
    context: {
      parent_id: req.session.contextParentId,
      parent_username: contextParent ? contextParent.username : null,
      parent_family_name: contextParent ? (contextParent.family_name || null) : null,
      role: req.session.contextRole,
      is_self: req.session.contextParentId === u.id
    },
    can_switch_context: contextCount > 1
  });
});

// ---- Family name ----
// Uses requireAuth (not requireAdmin) so the user can set their own family
// name regardless of which context (own family vs. guest validator) they are
// currently acting in. Primary role must still be 'admin'.
app.post('/api/family-name', requireAuth, (req, res) => {
  const { name } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
  const u = db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId);
  if (!u || u.role !== 'admin') return res.status(403).json({ error: 'only admins can set family name' });
  db.prepare('UPDATE users SET family_name = ? WHERE id = ?').run(String(name).trim(), req.session.userId);
  res.json({ ok: true });
});

// ---- Admin PIN ----
// PIN gates the view → admin UI switch (and reward reveal). Independent of
// the account password — TG-registered admins never know their password,
// which is random.
app.post('/api/admin-pin', requireAdmin, (req, res) => {
  const { pin, oldPin } = req.body || {};
  if (!pin || String(pin).length < 4) return res.status(400).json({ error: 'PIN must be at least 4 digits' });
  const u = db.prepare('SELECT admin_pin_hash FROM users WHERE id = ?').get(req.session.userId);
  // If a PIN is already set, require the old one to change it.
  if (u && u.admin_pin_hash) {
    if (!oldPin || !bcrypt.compareSync(String(oldPin), u.admin_pin_hash)) {
      return res.status(401).json({ error: 'wrong old PIN' });
    }
  }
  const hash = bcrypt.hashSync(String(pin), 10);
  db.prepare('UPDATE users SET admin_pin_hash = ? WHERE id = ?').run(hash, req.session.userId);
  res.json({ ok: true });
});

app.delete('/api/admin-pin', requireAdmin, (req, res) => {
  const { pin } = req.body || {};
  const u = db.prepare('SELECT admin_pin_hash FROM users WHERE id = ?').get(req.session.userId);
  if (u && u.admin_pin_hash) {
    if (!pin || !bcrypt.compareSync(String(pin), u.admin_pin_hash)) {
      return res.status(401).json({ error: 'wrong PIN' });
    }
  }
  db.prepare('UPDATE users SET admin_pin_hash = NULL WHERE id = ?').run(req.session.userId);
  res.json({ ok: true });
});

// Verify the admin PIN of the CURRENT session. Used by the view→admin mode
// switch and the reward-reveal flow.
app.post('/api/verify-pin', requireAdmin, (req, res) => {
  const { pin } = req.body || {};
  const u = db.prepare('SELECT admin_pin_hash FROM users WHERE id = ?').get(req.session.userId);
  if (!u || !u.admin_pin_hash) return res.status(400).json({ error: 'PIN not set' });
  if (!pin || !bcrypt.compareSync(String(pin), u.admin_pin_hash)) {
    return res.status(401).json({ error: 'wrong PIN' });
  }
  res.json({ ok: true });
});

// Re-verify CURRENT user's password (used to unlock admin UI in view mode).
app.post('/api/verify-admin', requireAuth, (req, res) => {
  const { username, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!u || u.role !== 'admin') return res.status(403).json({ error: 'admin required' });
  if (u.username !== username || !bcrypt.compareSync(password || '', u.password_hash)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  res.json({ ok: true });
});

// Verify validator credentials within the current admin's family (or current
// validator's family). Used to switch into validator UI mode without changing
// the active session.
app.post('/api/verify-validator', requireAuth, (req, res) => {
  const { username, password } = req.body || {};
  const ownerId = ownerOf(req);
  if (!ownerId) return res.status(400).json({ error: 'no family context' });
  const v = db.prepare("SELECT * FROM users WHERE username = ? AND role = 'validator' AND parent_id = ?").get(username, ownerId);
  if (!v || !bcrypt.compareSync(password || '', v.password_hash)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  res.json({ ok: true });
});

// Change current user's password.
app.post('/api/change-password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 3) return res.status(400).json({ error: 'new password too short' });
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!u || !bcrypt.compareSync(oldPassword || '', u.password_hash)) {
    return res.status(401).json({ error: 'wrong old password' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, u.id);
  res.json({ ok: true });
});

// ---- Invites & memberships ----
// Admin creates a permanent invite token (multi-use). Any TG user who opens
// the resulting URL becomes a validator or admin in this admin's family.
// Invites can be revoked.
app.get('/api/invites', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT id, token, role, created_at FROM invites WHERE parent_id = ? ORDER BY id DESC').all(req.session.userId);
  res.json(rows.map(r => ({ ...r, url: buildInviteUrl(r.token) })));
});

app.post('/api/invites', requireAdmin, (req, res) => {
  const role = (req.body && req.body.role === 'admin') ? 'admin' : 'validator';
  const token = genToken();
  const result = db.prepare('INSERT INTO invites (token, parent_id, role) VALUES (?, ?, ?)').run(token, req.session.userId, role);
  res.json({ id: result.lastInsertRowid, token, role, url: buildInviteUrl(token) });
});

app.delete('/api/invites/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const result = db.prepare('DELETE FROM invites WHERE id = ? AND parent_id = ?').run(id, req.session.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// Redeem an invite. Requires an authenticated session — the caller becomes a
// validator in the invite's family. Idempotent: redeeming twice is a no-op.
// Only users with primary role='admin' can hold cross-family memberships;
// legacy password validators are intentionally locked to their one family.
app.post('/api/invites/redeem', requireAuth, (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token required' });
  const inv = db.prepare('SELECT * FROM invites WHERE token = ?').get(token);
  if (!inv) return res.status(404).json({ error: 'invite not found' });
  if (inv.parent_id === req.session.userId) return res.status(400).json({ error: 'cannot redeem your own invite' });
  const u = db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId);
  if (!u || u.role !== 'admin') return res.status(403).json({ error: 'only TG-registered users can join other families' });
  // Insert membership for this role. INSERT OR IGNORE so redeeming the same
  // invite twice is a no-op. Since UNIQUE is now (user_id, parent_id, role),
  // a user can hold both admin AND validator memberships in the same family.
  const invRole = inv.role || 'validator';
  db.prepare('INSERT OR IGNORE INTO memberships (user_id, parent_id, role) VALUES (?, ?, ?)').run(req.session.userId, inv.parent_id, invRole);
  const parent = db.prepare('SELECT username FROM users WHERE id = ?').get(inv.parent_id);
  res.json({ ok: true, parent_id: inv.parent_id, role: invRole, parent_username: parent ? parent.username : null });
});

function buildInviteUrl(token) {
  // t.me link → opens the bot in Telegram; bot's /start handler then sends a
  // WebApp button whose URL includes ?invite=<token>.
  const u = getBotUsername();
  return u ? `https://t.me/${u}?start=inv_${token}` : null;
}

// ---- Context (multi-family) ----
// Lists every family the current user can act in. For admins: own family
// plus each invited-into family. For legacy validators: just their one
// family (no switching possible).
app.get('/api/my-families', requireAuth, (req, res) => {
  const me = db.prepare('SELECT id, username, role, parent_id, family_name FROM users WHERE id = ?').get(req.session.userId);
  if (!me) return res.status(401).json({ error: 'unauthorized' });
  const contexts = [];
  if (me.role === 'admin') {
    contexts.push({ parent_id: me.id, parent_username: me.username, family_name: me.family_name || null, role: 'admin', is_self: true });
    const memberships = db.prepare(`
      SELECT m.parent_id, m.role AS member_role, u.username AS parent_username, u.family_name
      FROM memberships m JOIN users u ON u.id = m.parent_id
      WHERE m.user_id = ?
      ORDER BY u.username
    `).all(me.id);
    for (const m of memberships) {
      contexts.push({ parent_id: m.parent_id, parent_username: m.parent_username, family_name: m.family_name || null, role: m.member_role || 'validator', is_self: false });
    }
  } else {
    const p = db.prepare('SELECT id, username, family_name FROM users WHERE id = ?').get(me.parent_id);
    if (p) contexts.push({ parent_id: p.id, parent_username: p.username, family_name: p.family_name || null, role: 'validator', is_self: false });
  }
  res.json(contexts);
});

app.post('/api/switch-context', requireAuth, (req, res) => {
  const { parent_id, role: requestedRole } = req.body || {};
  const pid = parseInt(parent_id, 10);
  if (!pid) return res.status(400).json({ error: 'parent_id required' });
  const me = db.prepare('SELECT id, role, parent_id FROM users WHERE id = ?').get(req.session.userId);
  if (!me) return res.status(401).json({ error: 'unauthorized' });

  // Resolve which role this user has in the requested family.
  let role = null;
  if (me.role === 'admin' && pid === me.id) role = 'admin';
  else if (me.role === 'validator' && pid === me.parent_id) role = 'validator';
  else if (me.role === 'admin') {
    // If caller specified a role, look for that exact membership; otherwise pick first.
    const m = (requestedRole === 'admin' || requestedRole === 'validator')
      ? db.prepare('SELECT role FROM memberships WHERE user_id = ? AND parent_id = ? AND role = ?').get(me.id, pid, requestedRole)
      : db.prepare('SELECT role FROM memberships WHERE user_id = ? AND parent_id = ?').get(me.id, pid);
    if (m) role = m.role;
  }
  if (!role) return res.status(403).json({ error: 'no access to this family' });

  req.session.contextParentId = pid;
  req.session.contextRole = role;
  res.json({ ok: true, parent_id: pid, role });
});

// ---- Validators (admin manages the validators of their own family) ----
app.get('/api/validators', requireAdmin, (req, res) => {
  const rows = db.prepare(
    "SELECT id, username, tg_user_id, created_at FROM users WHERE role = 'validator' AND parent_id = ? ORDER BY username"
  ).all(req.session.userId);
  res.json(rows.map(r => ({ ...r, tg_linked: !!r.tg_user_id })));
});

app.post('/api/validators', requireAdmin, (req, res) => {
  const { username, password, role } = req.body || {};
  const targetRole = role === 'admin' ? 'admin' : 'validator';
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  if (password.length < 3) return res.status(400).json({ error: 'password too short' });
  if (findUserByUsername(username)) return res.status(409).json({ error: 'username already taken' });
  const hash = bcrypt.hashSync(password, 10);
  if (targetRole === 'validator') {
    const result = db.prepare(
      "INSERT INTO users (username, password_hash, role, parent_id) VALUES (?, ?, 'validator', ?)"
    ).run(username, hash, req.session.userId);
    res.json({ id: result.lastInsertRowid });
  } else {
    // Create a local admin user (their own empty family) + membership linking
    // them into the current admin's family with admin-level access.
    const result = db.prepare(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')"
    ).run(username, hash);
    const newUserId = result.lastInsertRowid;
    db.prepare("INSERT INTO memberships (user_id, parent_id, role) VALUES (?, ?, 'admin')").run(newUserId, req.session.userId);
    res.json({ id: newUserId });
  }
});

app.delete('/api/validators/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const result = db.prepare(
    "DELETE FROM users WHERE id = ? AND role = 'validator' AND parent_id = ?"
  ).run(id, req.session.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// Combined list of users for the admin's current family:
// local password-based validators (users.role='validator', parent_id=owner)
// + users that accepted an invite (memberships rows — both validator and admin role).
app.get('/api/members', requireAdmin, (req, res) => {
  const ownerId = ownerOf(req);
  const local = db.prepare(
    "SELECT id, username, tg_user_id, created_at, 'local' AS type, 'validator' AS member_role FROM users WHERE role = 'validator' AND parent_id = ? ORDER BY username"
  ).all(ownerId);
  const tgMembers = db.prepare(`
    SELECT u.id, u.username, u.tg_user_id, m.created_at, 'tg_member' AS type, m.role AS member_role
    FROM memberships m
    JOIN users u ON u.id = m.user_id
    WHERE m.parent_id = ?
    ORDER BY u.username
  `).all(ownerId);
  res.json([...local, ...tgMembers].map(r => ({ ...r, tg_linked: !!r.tg_user_id })));
});

// Revoke a TG-membership (removes the memberships row; the user account stays).
app.delete('/api/members/:id', requireAdmin, (req, res) => {
  const memberId = parseInt(req.params.id, 10);
  const ownerId = ownerOf(req);
  const result = db.prepare('DELETE FROM memberships WHERE user_id = ? AND parent_id = ?').run(memberId, ownerId);
  if (result.changes === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

app.post('/api/validators/:id/password', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { password } = req.body || {};
  if (!password || password.length < 3) return res.status(400).json({ error: 'password too short' });
  const ownerId = req.session.userId;
  // Allow for local validators (parent_id = owner) or local admin members
  // (has a membership in this family, no TG account = locally-created admin).
  const v = db.prepare(`
    SELECT u.id FROM users u
    WHERE u.id = ? AND u.tg_user_id IS NULL AND (
      (u.role = 'validator' AND u.parent_id = ?)
      OR EXISTS(SELECT 1 FROM memberships m WHERE m.user_id = u.id AND m.parent_id = ?)
    )
  `).get(id, ownerId, ownerId);
  if (!v) return res.status(404).json({ error: 'not found' });
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
  res.json({ ok: true });
});

// ---- Kids ----
app.get('/api/kids', requireAdmin, (req, res) => {
  const ownerId = ownerOf(req);
  const t = today();
  const kids = db.prepare('SELECT * FROM kids WHERE owner_id = ? ORDER BY name').all(ownerId);
  const enriched = kids.map(k => {
    const row = db.prepare('SELECT SUM(completed) AS done, COUNT(*) AS total FROM tasks WHERE kid_id = ? AND date = ?').get(k.id, t);
    const reward = db.prepare('SELECT * FROM rewards WHERE kid_id = ? AND date = ?').get(k.id, t);
    return { ...k, today_done: row.done || 0, today_total: row.total || 0, today_reward: reward };
  });
  res.json(enriched);
});

app.post('/api/kids', requireAdmin, (req, res) => {
  const ownerId = ownerOf(req);
  const { name, age, gender, photo } = req.body || {};
  if (!name || !age || !gender) return res.status(400).json({ error: 'name, age and gender are required' });
  const result = db.prepare(
    'INSERT INTO kids (owner_id, name, age, gender, photo) VALUES (?, ?, ?, ?, ?)'
  ).run(ownerId, name, parseInt(age, 10), gender, photo || null);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/kids/:id', requireAdmin, (req, res) => {
  const ownerId = ownerOf(req);
  const id = parseInt(req.params.id, 10);
  const { name, age, gender, photo } = req.body || {};
  if (!name || !age || !gender) return res.status(400).json({ error: 'name, age and gender are required' });
  if (!kidGuard(id, ownerId)) return res.status(404).json({ error: 'not found' });
  if (photo === undefined) {
    db.prepare('UPDATE kids SET name = ?, age = ?, gender = ? WHERE id = ?').run(name, parseInt(age, 10), gender, id);
  } else {
    db.prepare('UPDATE kids SET name = ?, age = ?, gender = ?, photo = ? WHERE id = ?').run(name, parseInt(age, 10), gender, photo || null, id);
  }
  res.json({ ok: true });
});

app.delete('/api/kids/:id', requireAdmin, (req, res) => {
  const ownerId = ownerOf(req);
  const id = parseInt(req.params.id, 10);
  if (!kidGuard(id, ownerId)) return res.status(404).json({ error: 'not found' });
  // FK ON DELETE CASCADE handles tasks/rewards.
  db.prepare('DELETE FROM kids WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.get('/api/kids/:id', requireAdmin, (req, res) => {
  const profile = getKidProfile(parseInt(req.params.id, 10), ownerOf(req));
  if (!profile) return res.status(404).json({ error: 'not found' });
  res.json(profile);
});

app.get('/api/kids/:id/day/:date', requireAdmin, (req, res) => {
  const ownerId = ownerOf(req);
  const kidId = parseInt(req.params.id, 10);
  const date = req.params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'bad date' });
  if (!kidGuard(kidId, ownerId)) return res.status(404).json({ error: 'not found' });
  const tasks = db.prepare('SELECT * FROM tasks WHERE kid_id = ? AND date = ? ORDER BY id').all(kidId, date);
  const reward = db.prepare('SELECT * FROM rewards WHERE kid_id = ? AND date = ?').get(kidId, date);
  res.json({ date, tasks, reward: reward || null });
});

// ---- Tasks ----
app.post('/api/kids/:id/tasks', requireAdmin, (req, res) => {
  const ownerId = ownerOf(req);
  const kidId = parseInt(req.params.id, 10);
  const { date, title } = req.body || {};
  const d = date || today();
  if (!title) return res.status(400).json({ error: 'title required' });
  if (!kidGuard(kidId, ownerId)) return res.status(404).json({ error: 'kid not found' });
  const result = db.prepare(
    'INSERT INTO tasks (owner_id, kid_id, date, title) VALUES (?, ?, ?, ?)'
  ).run(ownerId, kidId, d, title);
  res.json({ id: result.lastInsertRowid });
});

// State machine: open ↔ pending; approved → open. Approval (pending → completed)
// is a separate endpoint (validators/admins both can call it, but UI gates it
// behind a validator password challenge).
app.post('/api/tasks/:id/toggle', requireAuth, (req, res) => {
  const ownerId = ownerOf(req);
  const id = parseInt(req.params.id, 10);
  const task = taskGuard(id, ownerId);
  if (!task) return res.status(404).json({ error: 'not found' });

  let completed, pending, completedAt;
  if (task.completed) {
    completed = 0; pending = 0; completedAt = null;
  } else if (task.pending) {
    completed = 0; pending = 0; completedAt = null;
  } else {
    completed = 0; pending = 1; completedAt = null;
  }
  db.prepare('UPDATE tasks SET completed = ?, pending = ?, completed_at = ? WHERE id = ?')
    .run(completed, pending, completedAt, id);

  const row = db.prepare('SELECT SUM(completed) AS done, COUNT(*) AS total FROM tasks WHERE kid_id = ? AND date = ?').get(task.kid_id, task.date);
  if (row.total > 0 && row.done < row.total) {
    db.prepare('UPDATE rewards SET claimed = 0, claimed_at = NULL WHERE kid_id = ? AND date = ? AND claimed = 1').run(task.kid_id, task.date);
  }
  res.json({ ok: true, completed: !!completed, pending: !!pending });
});

app.post('/api/tasks/:id/approve', requireAuth, (req, res) => {
  const ownerId = ownerOf(req);
  const id = parseInt(req.params.id, 10);
  const task = taskGuard(id, ownerId);
  if (!task) return res.status(404).json({ error: 'not found' });
  if (!task.pending) return res.status(400).json({ error: 'task is not pending validation' });
  db.prepare('UPDATE tasks SET completed = 1, pending = 0, completed_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id);
  res.json({ ok: true });
});

app.post('/api/tasks/:id/reject', requireAuth, (req, res) => {
  const ownerId = ownerOf(req);
  const id = parseInt(req.params.id, 10);
  const task = taskGuard(id, ownerId);
  if (!task) return res.status(404).json({ error: 'not found' });
  if (!task.pending) return res.status(400).json({ error: 'task is not pending validation' });
  db.prepare('UPDATE tasks SET completed = 0, pending = 0, completed_at = NULL WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.get('/api/pending-tasks', requireAuth, (req, res) => {
  const ownerId = ownerOf(req);
  const rows = db.prepare(`
    SELECT t.id, t.title, t.date, t.kid_id,
           k.name AS kid_name, k.photo AS kid_photo, k.age AS kid_age, k.gender AS kid_gender
    FROM tasks t
    JOIN kids k ON k.id = t.kid_id
    WHERE t.pending = 1 AND t.owner_id = ?
    ORDER BY t.date DESC, k.name, t.id
  `).all(ownerId);
  res.json(rows);
});

app.delete('/api/tasks/:id', requireAdmin, (req, res) => {
  const ownerId = ownerOf(req);
  const id = parseInt(req.params.id, 10);
  const result = db.prepare('DELETE FROM tasks WHERE id = ? AND owner_id = ?').run(id, ownerId);
  if (result.changes === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// ---- Task Templates ----
app.get('/api/task-templates', requireAdmin, (req, res) => {
  const ownerId = ownerOf(req);
  const rows = db.prepare('SELECT * FROM task_templates WHERE owner_id = ? ORDER BY title').all(ownerId);
  res.json(rows);
});

app.post('/api/task-templates', requireAdmin, (req, res) => {
  const ownerId = ownerOf(req);
  const { title } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  const result = db.prepare('INSERT INTO task_templates (owner_id, title) VALUES (?, ?)').run(ownerId, title);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/task-templates/:id', requireAdmin, (req, res) => {
  const ownerId = ownerOf(req);
  const id = parseInt(req.params.id, 10);
  const { title } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  const result = db.prepare('UPDATE task_templates SET title = ? WHERE id = ? AND owner_id = ?').run(title, id, ownerId);
  if (result.changes === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

app.delete('/api/task-templates/:id', requireAdmin, (req, res) => {
  const ownerId = ownerOf(req);
  const id = parseInt(req.params.id, 10);
  const result = db.prepare('DELETE FROM task_templates WHERE id = ? AND owner_id = ?').run(id, ownerId);
  if (result.changes === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// ---- Reward Templates ----
app.get('/api/reward-templates', requireAdmin, (req, res) => {
  const ownerId = ownerOf(req);
  const rows = db.prepare('SELECT * FROM reward_templates WHERE owner_id = ? ORDER BY title').all(ownerId);
  res.json(rows);
});

app.post('/api/reward-templates', requireAdmin, (req, res) => {
  const ownerId = ownerOf(req);
  const { title } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  const result = db.prepare('INSERT INTO reward_templates (owner_id, title) VALUES (?, ?)').run(ownerId, title);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/reward-templates/:id', requireAdmin, (req, res) => {
  const ownerId = ownerOf(req);
  const id = parseInt(req.params.id, 10);
  const { title } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  const result = db.prepare('UPDATE reward_templates SET title = ? WHERE id = ? AND owner_id = ?').run(title, id, ownerId);
  if (result.changes === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

app.delete('/api/reward-templates/:id', requireAdmin, (req, res) => {
  const ownerId = ownerOf(req);
  const id = parseInt(req.params.id, 10);
  const result = db.prepare('DELETE FROM reward_templates WHERE id = ? AND owner_id = ?').run(id, ownerId);
  if (result.changes === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// ---- Rewards ----
app.post('/api/kids/:id/reward', requireAdmin, (req, res) => {
  const ownerId = ownerOf(req);
  const kidId = parseInt(req.params.id, 10);
  const { date, title, photo } = req.body || {};
  const d = date || today();
  if (!title) return res.status(400).json({ error: 'title required' });
  if (!kidGuard(kidId, ownerId)) return res.status(404).json({ error: 'kid not found' });
  const existing = db.prepare('SELECT id FROM rewards WHERE kid_id = ? AND date = ?').get(kidId, d);
  if (existing) {
    if (photo !== undefined) {
      db.prepare('UPDATE rewards SET title = ?, photo = ?, claimed = 0, claimed_at = NULL WHERE id = ?').run(title, photo || null, existing.id);
    } else {
      db.prepare('UPDATE rewards SET title = ?, claimed = 0, claimed_at = NULL WHERE id = ?').run(title, existing.id);
    }
    res.json({ id: existing.id, updated: true });
  } else {
    const result = db.prepare(
      'INSERT INTO rewards (owner_id, kid_id, date, title, photo) VALUES (?, ?, ?, ?, ?)'
    ).run(ownerId, kidId, d, title, photo || null);
    res.json({ id: result.lastInsertRowid });
  }
});

app.post('/api/rewards/:id/claim', requireAdmin, (req, res) => {
  const ownerId = ownerOf(req);
  const id = parseInt(req.params.id, 10);
  const reward = rewardGuard(id, ownerId);
  if (!reward) return res.status(404).json({ error: 'not found' });
  const row = db.prepare('SELECT SUM(completed) AS done, COUNT(*) AS total FROM tasks WHERE kid_id = ? AND date = ?').get(reward.kid_id, reward.date);
  if (!row.total || row.done < row.total) {
    return res.status(400).json({ error: 'not all tasks completed' });
  }
  db.prepare('UPDATE rewards SET claimed = 1, claimed_at = ? WHERE id = ?').run(new Date().toISOString(), id);
  res.json({ ok: true });
});

// ---- Clear database ----
// Wipes all data belonging to the current admin's family: kids (cascade →
// tasks/rewards), templates, validators, invites, memberships.
// Then resets family_name so the user lands on the setup-family screen again.
app.post('/api/clear-database', requireAdmin, (req, res) => {
  const userId = req.session.userId;
  const ownerId = ownerOf(req);

  // Use a transaction so the wipe is atomic.
  db.transaction(() => {
    // Kids → tasks/rewards cascade via FK ON DELETE CASCADE.
    db.prepare('DELETE FROM kids WHERE owner_id = ?').run(ownerId);
    db.prepare('DELETE FROM task_templates WHERE owner_id = ?').run(ownerId);
    db.prepare('DELETE FROM reward_templates WHERE owner_id = ?').run(ownerId);
    // Delete local (password-based) validators owned by this admin.
    db.prepare("DELETE FROM users WHERE role = 'validator' AND parent_id = ?").run(userId);
    // Delete invite links created by this admin.
    db.prepare('DELETE FROM invites WHERE parent_id = ?').run(userId);
    // Delete cross-family memberships (both directions).
    db.prepare('DELETE FROM memberships WHERE parent_id = ? OR user_id = ?').run(userId, userId);
    // Reset family name so the next boot redirects to the setup-family screen.
    db.prepare('UPDATE users SET family_name = NULL WHERE id = ?').run(userId);
  })();

  req.session.destroy(() => res.json({ ok: true }));
});

// ---- Landing: dynamic config ----
app.get('/landing/config.js', (req, res) => {
  const botUsername = getBotUsername();
  const botUrl = botUsername ? `https://t.me/${botUsername}` : null;
  res.set('Content-Type', 'application/javascript; charset=utf-8');
  res.set('Cache-Control', 'no-store');
  res.send(`window.BOT_URL = ${JSON.stringify(botUrl)};`);
});

// ---- Landing static files ----
app.use('/landing', express.static(path.join(__dirname, 'landing')));

// ---- App static ----
// Serve index.html dynamically so every server restart injects a fresh ?v=
// cache-buster into <script> and <link> URLs, defeating Telegram's WebView
// cache even when the resource paths haven't changed.
const APP_VERSION = Date.now();
app.get('/', (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  html = html.replace(/(src|href)="([^"]+\.(js|css))"/g, `$1="$2?v=${APP_VERSION}"`);
  res.set('Cache-Control', 'no-store');
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});
// Disable caching for JS/CSS so Telegram's WebView picks up updates immediately.
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    if (/\.(js|css)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }
}));

app.listen(PORT, async () => {
  console.log(`[server] running at http://localhost:${PORT}`);

  const tunnelDisabled = process.env.NO_TUNNEL === '1';
  if (!process.env.WEBAPP_URL && !tunnelDisabled) {
    try {
      const { urlPromise } = startTunnel(PORT);
      const url = await urlPromise;
      process.env.WEBAPP_URL = url;
      console.log(`[tunnel] public URL ready: ${url}`);
    } catch (err) {
      console.error('[tunnel] failed to start:', err.message);
      console.error('[tunnel] You can disable tunneling with NO_TUNNEL=1 or set WEBAPP_URL manually.');
    }
  } else if (process.env.WEBAPP_URL) {
    console.log(`[tunnel] using WEBAPP_URL from env: ${process.env.WEBAPP_URL}`);
  } else {
    console.log('[tunnel] disabled (NO_TUNNEL=1)');
  }

  const getInviteInfo = (token) => {
    const row = db.prepare(
      'SELECT u.family_name FROM invites i JOIN users u ON u.id = i.parent_id WHERE i.token = ?'
    ).get(token);
    return row || null;
  };
  startBot({ getInviteInfo }).catch(err => console.error('[bot] failed to start:', err.message));
});
