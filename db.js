const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, process.env.DB_FILE || 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---- Schema ----
// users: replaces the old single-row `admin` table. Holds both admins and
// validators. Validators belong to a specific admin via parent_id; admins
// have parent_id = NULL. tg_user_id is the Telegram numeric id (as string),
// set on first login from Telegram Mini App.
//
// Data tables (kids/tasks/rewards) carry owner_id = the admin user that owns
// the data. Validators read/write their parent's data (server resolves this
// from session.parent_id).
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin','validator')),
    parent_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    tg_user_id TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS kids (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    age INTEGER NOT NULL,
    gender TEXT NOT NULL,
    photo TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_kids_owner ON kids(owner_id);

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kid_id INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    pending INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_kid_date ON tasks(kid_id, date);
  CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks(owner_id);

  CREATE TABLE IF NOT EXISTS rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kid_id INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    claimed INTEGER NOT NULL DEFAULT 0,
    claimed_at TEXT,
    UNIQUE(kid_id, date)
  );

  CREATE INDEX IF NOT EXISTS idx_rewards_owner ON rewards(owner_id);

  -- Permanent, multi-use invite tokens. Admin creates one and shares the URL;
  -- any Telegram user who opens it joins as a validator of that admin.
  CREATE TABLE IF NOT EXISTS invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Extra validator-memberships. A user can be admin of their own tenant
  -- (implicit, encoded in users.role='admin' + own id) AND validator in N
  -- other admins' families via rows in this table.
  CREATE TABLE IF NOT EXISTS memberships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role = 'validator'),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, parent_id)
  );
  CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
  CREATE INDEX IF NOT EXISTS idx_memberships_parent ON memberships(parent_id);

  -- Predefined task templates per admin (used as suggestions when adding tasks to a kid).
  CREATE TABLE IF NOT EXISTS task_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_task_templates_owner ON task_templates(owner_id);

  -- Predefined reward templates per admin (used as suggestions when adding a reward to a kid).
  CREATE TABLE IF NOT EXISTS reward_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_reward_templates_owner ON reward_templates(owner_id);
`);

// Lightweight migrations: add nullable columns to existing tables without
// dropping data. For breaking changes — recreate data.db manually.
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
// Admin-only PIN that gates the view → admin UI mode switch. Independent of
// the account password (which TG-registered admins never know — it's random).
ensureColumn('users', 'admin_pin_hash', 'TEXT');
ensureColumn('users', 'family_name', 'TEXT');

// Invite role: 'validator' (default) or 'admin'.
ensureColumn('invites', 'role', "TEXT NOT NULL DEFAULT 'validator'");

// Migrate memberships CHECK constraint to allow admin-role memberships.
// SQLite can't ALTER a CHECK constraint, so we recreate the table if needed.
{
  const tbl = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='memberships'").get();
  if (tbl && !tbl.sql.includes("'admin'")) {
    db.exec(`
      ALTER TABLE memberships RENAME TO memberships_old;
      CREATE TABLE memberships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('admin','validator')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(user_id, parent_id)
      );
      CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
      CREATE INDEX IF NOT EXISTS idx_memberships_parent ON memberships(parent_id);
      INSERT INTO memberships (id, user_id, parent_id, role, created_at)
        SELECT id, user_id, parent_id, role, created_at FROM memberships_old;
      DROP TABLE memberships_old;
    `);
  }
}

// No default seed. Admin accounts are auto-created by /api/tg-auth on first
// Telegram login (each TG user = own tenant). Validators are created inside
// each admin's settings.

module.exports = db;
