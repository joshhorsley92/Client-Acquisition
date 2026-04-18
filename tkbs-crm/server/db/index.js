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

// Data tables the clean-slate migrations wipe. users, audit_log,
// outbound_webhooks, and integration_settings survive across schema shifts.
const V2_DATA_TABLES = [
  'companies',
  'contacts',
  'deals',
  'tasks',
  'activities',
  'documents',
  'stage_actions',
  'status_actions',
  'script_templates',
  'generation_jobs',
  'email_messages',
  'sms_messages',
  'call_recordings',
];

function hasColumn(database, table, column) {
  try {
    const row = database.prepare(
      "SELECT 1 FROM pragma_table_info(?) WHERE name = ?"
    ).get(table, column);
    return !!row;
  } catch (e) { return false; }
}

function hasTable(database, name) {
  const row = database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?"
  ).get(name);
  return !!row;
}

// Returns true when the on-disk schema is behind the current source.
// Triggers: any v1 table present; any dashboard column still present;
// the status_actions table present (removed when we cut Dashboard).
function isSchemaOutOfDate(database) {
  if (hasTable(database, 'companies') || hasTable(database, 'contacts') ||
      hasTable(database, 'deals') || hasTable(database, 'tasks')) return true;
  if (hasTable(database, 'stage_actions') || hasTable(database, 'status_actions')) return true;
  if (hasColumn(database, 'engagements', 'dashboard_user_id')) return true;
  if (hasColumn(database, 'call_recordings', 'dashboard_user_id')) return true;
  return false;
}

function wipeOutOfDateTables(database) {
  if (!isSchemaOutOfDate(database)) return;

  database.pragma('foreign_keys = OFF');
  try {
    const tx = database.transaction(() => {
      for (const table of V2_DATA_TABLES) {
        database.exec(`DROP TABLE IF EXISTS ${table}`);
      }
    });
    tx();
  } finally {
    database.pragma('foreign_keys = ON');
  }
}

function initDb() {
  const database = getDb();

  wipeOutOfDateTables(database);

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  database.exec(schema);

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
