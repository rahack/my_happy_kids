require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db');
const { startBot } = require('./bot');
const { startTunnel } = require('./tunnel');

const app = express();
const PORT = process.env.PORT || 3000;

// Accept base64-encoded photos in the kid edit form
app.use(express.json({ limit: '2mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'happy-kids-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// ---- Helpers ----
const today = () => new Date().toISOString().slice(0, 10);

// Hardcoded validator credentials. Validators only approve task check-marks;
// they cannot manage kids/tasks/rewards.
const VALIDATOR_USER = 'validator';
const VALIDATOR_PASS = '12345';

function requireAuth(req, res, next) {
  if (!req.session.role) return res.status(401).json({ error: 'unauthorized' });
  next();
}
function requireAdmin(req, res, next) {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'admin required' });
  next();
}
function requireValidator(req, res, next) {
  if (req.session.role !== 'validator') return res.status(403).json({ error: 'validator required' });
  next();
}

function getKidProfile(kidId) {
  const kid = db.prepare('SELECT * FROM kids WHERE id = ?').get(kidId);
  if (!kid) return null;

  const t = today();
  const todayTasks = db.prepare('SELECT * FROM tasks WHERE kid_id = ? AND date = ? ORDER BY id').all(kidId, t);
  const todayReward = db.prepare('SELECT * FROM rewards WHERE kid_id = ? AND date = ?').get(kidId, t);

  // History: group by date excluding today
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

  // Stats: total days with activity, total tasks, total completed
  const stats = db.prepare(`
    SELECT
      COUNT(DISTINCT date) AS days_with_tasks,
      COUNT(*) AS total_tasks,
      SUM(completed) AS completed_tasks
    FROM tasks WHERE kid_id = ?
  `).get(kidId);

  const rewardsClaimed = db.prepare('SELECT COUNT(*) AS c FROM rewards WHERE kid_id = ? AND claimed = 1').get(kidId).c;

  // Calendar markers: any date (past or future) that has tasks or a reward.
  // Used by the date strip to highlight days with activity.
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

// ---- Auth ----
function tryAdmin(username, password) {
  const admin = db.prepare('SELECT * FROM admin WHERE id = 1').get();
  if (!admin || admin.username !== username || !bcrypt.compareSync(password || '', admin.password_hash)) return null;
  return admin;
}
function isValidator(username, password) {
  return username === VALIDATOR_USER && password === VALIDATOR_PASS;
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const admin = tryAdmin(username, password);
  if (admin) {
    req.session.role = 'admin';
    req.session.username = admin.username;
    return res.json({ ok: true, username: admin.username, role: 'admin' });
  }
  if (isValidator(username, password)) {
    req.session.role = 'validator';
    req.session.username = VALIDATOR_USER;
    return res.json({ ok: true, username: VALIDATOR_USER, role: 'validator' });
  }
  res.status(401).json({ error: 'invalid credentials' });
});

// Public probe used by the login screen: when the database has no kids yet,
// the UI skips the "who are you" chooser and goes straight to admin login.
app.get('/api/has-kids', (req, res) => {
  const row = db.prepare('SELECT COUNT(*) AS c FROM kids').get();
  res.json({ has_kids: row.c > 0 });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session.role) return res.json({ authenticated: false });
  res.json({ authenticated: true, username: req.session.username, role: req.session.role });
});

// Re-verify admin credentials without changing session. Used to unlock
// sensitive UI (e.g. reveal reward) when the kid is sitting at the device.
app.post('/api/verify-admin', requireAuth, (req, res) => {
  const { username, password } = req.body || {};
  if (!tryAdmin(username, password)) return res.status(401).json({ error: 'invalid credentials' });
  res.json({ ok: true });
});

// Re-verify validator credentials. Used by the mode toggle to switch into
// validator mode without changing the active session.
app.post('/api/verify-validator', requireAuth, (req, res) => {
  const { username, password } = req.body || {};
  if (!isValidator(username, password)) return res.status(401).json({ error: 'invalid credentials' });
  res.json({ ok: true });
});

app.post('/api/change-password', requireAdmin, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 3) return res.status(400).json({ error: 'new password too short' });
  const admin = db.prepare('SELECT * FROM admin WHERE id = 1').get();
  if (!bcrypt.compareSync(oldPassword || '', admin.password_hash)) {
    return res.status(401).json({ error: 'wrong old password' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE admin SET password_hash = ? WHERE id = 1').run(hash);
  res.json({ ok: true });
});

// ---- Kids ----
app.get('/api/kids', requireAdmin, (req, res) => {
  const t = today();
  const kids = db.prepare('SELECT * FROM kids ORDER BY name').all();
  // Attach today's progress to each kid
  const enriched = kids.map(k => {
    const row = db.prepare('SELECT SUM(completed) AS done, COUNT(*) AS total FROM tasks WHERE kid_id = ? AND date = ?').get(k.id, t);
    const reward = db.prepare('SELECT * FROM rewards WHERE kid_id = ? AND date = ?').get(k.id, t);
    return { ...k, today_done: row.done || 0, today_total: row.total || 0, today_reward: reward };
  });
  res.json(enriched);
});

app.post('/api/kids', requireAdmin, (req, res) => {
  const { name, age, gender, photo } = req.body || {};
  if (!name || !age || !gender) return res.status(400).json({ error: 'name, age and gender are required' });
  const result = db.prepare('INSERT INTO kids (name, age, gender, photo) VALUES (?, ?, ?, ?)').run(name, parseInt(age, 10), gender, photo || null);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/kids/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name, age, gender, photo } = req.body || {};
  if (!name || !age || !gender) return res.status(400).json({ error: 'name, age and gender are required' });
  // photo: undefined → don't touch; null/'' → clear; string → set
  if (photo === undefined) {
    const result = db.prepare('UPDATE kids SET name = ?, age = ?, gender = ? WHERE id = ?').run(name, parseInt(age, 10), gender, id);
    if (result.changes === 0) return res.status(404).json({ error: 'not found' });
  } else {
    const result = db.prepare('UPDATE kids SET name = ?, age = ?, gender = ?, photo = ? WHERE id = ?').run(name, parseInt(age, 10), gender, photo || null, id);
    if (result.changes === 0) return res.status(404).json({ error: 'not found' });
  }
  res.json({ ok: true });
});

app.delete('/api/kids/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  // Clean up dependent rows (no FK cascade configured in schema)
  db.prepare('DELETE FROM tasks WHERE kid_id = ?').run(id);
  db.prepare('DELETE FROM rewards WHERE kid_id = ?').run(id);
  db.prepare('DELETE FROM kids WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.get('/api/kids/:id', requireAdmin, (req, res) => {
  const profile = getKidProfile(parseInt(req.params.id, 10));
  if (!profile) return res.status(404).json({ error: 'not found' });
  res.json(profile);
});

// Day view: tasks + reward for a specific date. Used by the calendar strip
// to render past / future days without reloading the whole profile.
app.get('/api/kids/:id/day/:date', requireAdmin, (req, res) => {
  const kidId = parseInt(req.params.id, 10);
  const date = req.params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'bad date' });
  const tasks = db.prepare('SELECT * FROM tasks WHERE kid_id = ? AND date = ? ORDER BY id').all(kidId, date);
  const reward = db.prepare('SELECT * FROM rewards WHERE kid_id = ? AND date = ?').get(kidId, date);
  res.json({ date, tasks, reward: reward || null });
});

// ---- Tasks ----
app.post('/api/kids/:id/tasks', requireAdmin, (req, res) => {
  const kidId = parseInt(req.params.id, 10);
  const { date, title } = req.body || {};
  const d = date || today();
  if (!title) return res.status(400).json({ error: 'title required' });
  const result = db.prepare('INSERT INTO tasks (kid_id, date, title) VALUES (?, ?, ?)').run(kidId, d, title);
  res.json({ id: result.lastInsertRowid });
});

// Toggle a task's check-mark. State machine:
//   open     (completed=0, pending=0)  → pending  (completed=0, pending=1)
//   pending  (completed=0, pending=1)  → open    (uncheck before validation)
//   approved (completed=1, pending=0)  → open    (admin/kid unchecked an approved task)
// Approval (pending → completed) is a separate endpoint reserved for validators.
app.post('/api/tasks/:id/toggle', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
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

  // Auto-reset claimed reward if tasks are no longer 100% approved.
  const row = db.prepare('SELECT SUM(completed) AS done, COUNT(*) AS total FROM tasks WHERE kid_id = ? AND date = ?').get(task.kid_id, task.date);
  if (row.total > 0 && row.done < row.total) {
    db.prepare('UPDATE rewards SET claimed = 0, claimed_at = NULL WHERE kid_id = ? AND date = ? AND claimed = 1').run(task.kid_id, task.date);
  }
  res.json({ ok: true, completed: !!completed, pending: !!pending });
});

// Validator approves a pending check-mark. Either an admin session or a
// validator session can call this — the validator-mode UI is gated by a
// separate password challenge (POST /api/verify-validator).
app.post('/api/tasks/:id/approve', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) return res.status(404).json({ error: 'not found' });
  if (!task.pending) return res.status(400).json({ error: 'task is not pending validation' });
  db.prepare('UPDATE tasks SET completed = 1, pending = 0, completed_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id);
  res.json({ ok: true });
});

// Validator rejects a pending check-mark — sends task back to "open".
app.post('/api/tasks/:id/reject', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) return res.status(404).json({ error: 'not found' });
  if (!task.pending) return res.status(400).json({ error: 'task is not pending validation' });
  db.prepare('UPDATE tasks SET completed = 0, pending = 0, completed_at = NULL WHERE id = ?').run(id);
  res.json({ ok: true });
});

// List of all tasks awaiting validator approval, with kid info.
app.get('/api/pending-tasks', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT t.id, t.title, t.date, t.kid_id, k.name AS kid_name, k.photo AS kid_photo
    FROM tasks t
    JOIN kids k ON k.id = t.kid_id
    WHERE t.pending = 1
    ORDER BY t.date DESC, k.name, t.id
  `).all();
  res.json(rows);
});

app.delete('/api/tasks/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- Rewards ----
app.post('/api/kids/:id/reward', requireAdmin, (req, res) => {
  const kidId = parseInt(req.params.id, 10);
  const { date, title } = req.body || {};
  const d = date || today();
  if (!title) return res.status(400).json({ error: 'title required' });
  // upsert. Changing a reward's title resets its "claimed" status —
  // a renamed reward is effectively a new reward, so it must be earned again.
  const existing = db.prepare('SELECT id FROM rewards WHERE kid_id = ? AND date = ?').get(kidId, d);
  if (existing) {
    db.prepare('UPDATE rewards SET title = ?, claimed = 0, claimed_at = NULL WHERE id = ?').run(title, existing.id);
    res.json({ id: existing.id, updated: true });
  } else {
    const result = db.prepare('INSERT INTO rewards (kid_id, date, title) VALUES (?, ?, ?)').run(kidId, d, title);
    res.json({ id: result.lastInsertRowid });
  }
});

app.post('/api/rewards/:id/claim', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const reward = db.prepare('SELECT * FROM rewards WHERE id = ?').get(id);
  if (!reward) return res.status(404).json({ error: 'not found' });
  // verify all today's tasks for this kid+date are done
  const row = db.prepare('SELECT SUM(completed) AS done, COUNT(*) AS total FROM tasks WHERE kid_id = ? AND date = ?').get(reward.kid_id, reward.date);
  if (!row.total || row.done < row.total) {
    return res.status(400).json({ error: 'not all tasks completed' });
  }
  db.prepare('UPDATE rewards SET claimed = 1, claimed_at = ? WHERE id = ?').run(new Date().toISOString(), id);
  res.json({ ok: true });
});

// ---- Static ----
// Disable caching for the Mini App assets so Telegram doesn't serve stale
// HTML/JS/CSS after a server restart (Telegram WebApp clients are aggressive
// about caching).
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, must-revalidate');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, async () => {
  console.log(`[server] running at http://localhost:${PORT}`);

  // If WEBAPP_URL not provided and tunnel not disabled, start cloudflared.
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

  // Start bot AFTER tunnel so the WebApp button is available immediately.
  startBot().catch(err => console.error('[bot] failed to start:', err.message));
});
