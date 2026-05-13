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

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'happy-kids-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// ---- Helpers ----
const today = () => new Date().toISOString().slice(0, 10);

function requireAuth(req, res, next) {
  if (!req.session.adminId) return res.status(401).json({ error: 'unauthorized' });
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

  return {
    kid,
    today: { date: t, tasks: todayTasks, reward: todayReward },
    history,
    stats: { ...stats, rewards_claimed: rewardsClaimed }
  };
}

// ---- Auth ----
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const admin = db.prepare('SELECT * FROM admin WHERE id = 1').get();
  if (!admin || admin.username !== username || !bcrypt.compareSync(password || '', admin.password_hash)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  req.session.adminId = admin.id;
  res.json({ ok: true, username: admin.username });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session.adminId) return res.json({ authenticated: false });
  const admin = db.prepare('SELECT id, username FROM admin WHERE id = 1').get();
  res.json({ authenticated: true, username: admin.username });
});

// Re-verify admin credentials without changing session. Used to unlock
// sensitive UI (e.g. reveal reward) when the kid is sitting at the device.
app.post('/api/verify-admin', requireAuth, (req, res) => {
  const { username, password } = req.body || {};
  const admin = db.prepare('SELECT * FROM admin WHERE id = 1').get();
  if (!admin || admin.username !== username || !bcrypt.compareSync(password || '', admin.password_hash)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  res.json({ ok: true });
});

app.post('/api/change-password', requireAuth, (req, res) => {
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
app.get('/api/kids', requireAuth, (req, res) => {
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

app.post('/api/kids', requireAuth, (req, res) => {
  const { name, age, gender } = req.body || {};
  if (!name || !age || !gender) return res.status(400).json({ error: 'name, age and gender are required' });
  const result = db.prepare('INSERT INTO kids (name, age, gender) VALUES (?, ?, ?)').run(name, parseInt(age, 10), gender);
  res.json({ id: result.lastInsertRowid });
});

app.delete('/api/kids/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM kids WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/kids/:id', requireAuth, (req, res) => {
  const profile = getKidProfile(parseInt(req.params.id, 10));
  if (!profile) return res.status(404).json({ error: 'not found' });
  res.json(profile);
});

// ---- Tasks ----
app.post('/api/kids/:id/tasks', requireAuth, (req, res) => {
  const kidId = parseInt(req.params.id, 10);
  const { date, title } = req.body || {};
  const d = date || today();
  if (!title) return res.status(400).json({ error: 'title required' });
  const result = db.prepare('INSERT INTO tasks (kid_id, date, title) VALUES (?, ?, ?)').run(kidId, d, title);
  res.json({ id: result.lastInsertRowid });
});

app.post('/api/tasks/:id/toggle', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) return res.status(404).json({ error: 'not found' });
  const newVal = task.completed ? 0 : 1;
  db.prepare('UPDATE tasks SET completed = ?, completed_at = ? WHERE id = ?').run(
    newVal,
    newVal ? new Date().toISOString() : null,
    id
  );
  res.json({ ok: true, completed: !!newVal });
});

app.delete('/api/tasks/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- Rewards ----
app.post('/api/kids/:id/reward', requireAuth, (req, res) => {
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

app.post('/api/rewards/:id/claim', requireAuth, (req, res) => {
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
