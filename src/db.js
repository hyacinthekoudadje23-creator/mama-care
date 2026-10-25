import Database from "better-sqlite3";

const db = new Database(process.env.DB_PATH || "./mamacare.db");
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, phone TEXT UNIQUE NOT NULL, name TEXT,
  role TEXT NOT NULL DEFAULT 'mama', sms_optin INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS otps(
  phone TEXT PRIMARY KEY, hash TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS profiles(
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS threads(
  id INTEGER PRIMARY KEY, mama_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_text TEXT, last_at INTEGER, last_from TEXT);
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY, thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id), from_role TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS msg_thread ON messages(thread_id, id);
CREATE TABLE IF NOT EXISTS reminders(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, due_at INTEGER NOT NULL, text TEXT NOT NULL, sent_at INTEGER,
  UNIQUE(user_id, kind, due_at));
CREATE INDEX IF NOT EXISTS rem_due ON reminders(sent_at, due_at);
`);

const userCols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
for (const [n, t] of [["email", "TEXT"], ["consent_version", "TEXT"], ["consent_at", "INTEGER"]])
  if (!userCols.includes(n)) db.exec(`ALTER TABLE users ADD COLUMN ${n} ${t}`);
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email) WHERE email IS NOT NULL");

export default db;
