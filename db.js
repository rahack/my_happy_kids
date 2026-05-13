const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS kids (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    age INTEGER NOT NULL,
    gender TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kid_id INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_kid_date ON tasks(kid_id, date);

  CREATE TABLE IF NOT EXISTS rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kid_id INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    claimed INTEGER NOT NULL DEFAULT 0,
    claimed_at TEXT,
    UNIQUE(kid_id, date)
  );
`);

// Seed default admin
const adminRow = db.prepare('SELECT id FROM admin WHERE id = 1').get();
if (!adminRow) {
  const hash = bcrypt.hashSync('admin', 10);
  db.prepare('INSERT INTO admin (id, username, password_hash) VALUES (1, ?, ?)').run('admin', hash);
  console.log('[db] Default admin created (admin/admin)');
}

module.exports = db;
