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

// v2 clean-slate: on first boot after the crm-v2 cutover, drop every v1 data
// table and anything whose columns reference the removed deals table. Users,
// audit_log, outbound_webhooks, and integration_settings survive. The new
// schema.sql recreates everything else with the clients+engagements model.
const V1_TABLES_TO_DROP = [
  'companies',
  'contacts',
  'deals',
  'tasks',
  'activities',
  'documents',
  'stage_actions',
  'script_templates',
  'generation_jobs',
  'email_messages',
  'sms_messages',
  'call_recordings',
];

function wipeV1IfPresent(database) {
  const hasV1 = database
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('companies','contacts','deals','tasks')")
    .all().length > 0;
  if (!hasV1) return;

  database.pragma('foreign_keys = OFF');
  try {
    const tx = database.transaction(() => {
      for (const table of V1_TABLES_TO_DROP) {
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

  wipeV1IfPresent(database);

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
