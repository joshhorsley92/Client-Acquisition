const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

let db;

function getDb() {
  if (db) return db;

  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'tkbs-crm.db');
  db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  return db;
}

function initDb() {
  const database = getDb();

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  database.exec(schema);

  // Migrations - add columns if they don't exist
  try { database.exec('ALTER TABLE tasks ADD COLUMN notes TEXT'); } catch(e) { /* already exists */ }
  try { database.exec('ALTER TABLE users ADD COLUMN totp_secret TEXT'); } catch(e) { /* already exists */ }
  try { database.exec('ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0'); } catch(e) { /* already exists */ }

  // Add prospect stage action if missing (running DB migration)
  try {
    const prospectAction = database.prepare("SELECT id FROM stage_actions WHERE stage = 'prospect'").get();
    if (!prospectAction) {
      database.prepare("INSERT INTO stage_actions (stage, action_type, config, sort_order) VALUES (?, ?, ?, ?)").run(
        'prospect', 'create_tasks',
        JSON.stringify({ tasks: [
          { description: 'Research prospect digital presence', due_offset_days: 0 },
          { description: 'Qualify — worth reaching out?', due_offset_days: 1 },
        ] }),
        0
      );
    }
  } catch(e) {}

  return database;
}

function seedDb() {
  const database = getDb();

  const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf-8');
  database.exec(seed);

  return database;
}

function closeDb() {
  if (db) {
    db.close();
    db = undefined;
  }
}

module.exports = { getDb, initDb, seedDb, closeDb };
