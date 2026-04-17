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
  try { database.exec('ALTER TABLE deals ADD COLUMN fit_score INTEGER'); } catch(e) { /* already exists */ }
  try { database.exec('ALTER TABLE deals ADD COLUMN fit_score_breakdown TEXT'); } catch(e) { /* already exists */ }
  try { database.exec('ALTER TABLE deals ADD COLUMN dashboard_user_id TEXT'); } catch(e) { /* already exists */ }
  try { database.exec('ALTER TABLE deals ADD COLUMN dashboard_org_id TEXT'); } catch(e) { /* already exists */ }
  try { database.exec('ALTER TABLE deals ADD COLUMN launch_client_id TEXT'); } catch(e) { /* already exists */ }
  try { database.exec('ALTER TABLE deals ADD COLUMN launch_activated_at TEXT'); } catch(e) { /* already exists */ }
  try { database.exec('ALTER TABLE call_recordings ADD COLUMN dashboard_org_id TEXT'); } catch(e) { /* already exists */ }

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

  // Stage 5 migration: add 'activate_launch_on_dashboard' to the stage_actions
  // CHECK constraint (SQLite requires table recreation) + seed the row.
  try {
    const activateAction = database.prepare(
      "SELECT id FROM stage_actions WHERE stage = 'closed_won' AND action_type = 'activate_launch_on_dashboard'"
    ).get();
    if (!activateAction) {
      try {
        database.prepare("INSERT INTO stage_actions (stage, action_type, config, sort_order) VALUES (?, ?, ?, ?)").run(
          'closed_won', 'activate_launch_on_dashboard', '{}', 1
        );
      } catch (constraintErr) {
        // CHECK constraint doesn't include the new type — recreate the table
        if (String(constraintErr).includes('CHECK')) {
          database.pragma('foreign_keys = OFF');
          database.exec(`
            BEGIN;
            CREATE TABLE stage_actions_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              stage TEXT NOT NULL,
              action_type TEXT NOT NULL CHECK(action_type IN ('create_tasks', 'start_cadence', 'trigger_skill', 'record', 'activate_launch_on_dashboard')),
              config TEXT NOT NULL DEFAULT '{}',
              enabled INTEGER NOT NULL DEFAULT 1,
              sort_order INTEGER NOT NULL DEFAULT 0
            );
            INSERT INTO stage_actions_new SELECT * FROM stage_actions;
            DROP TABLE stage_actions;
            ALTER TABLE stage_actions_new RENAME TO stage_actions;
            COMMIT;
          `);
          database.pragma('foreign_keys = ON');
          database.prepare("INSERT INTO stage_actions (stage, action_type, config, sort_order) VALUES (?, ?, ?, ?)").run(
            'closed_won', 'activate_launch_on_dashboard', '{}', 1
          );
        }
      }
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
