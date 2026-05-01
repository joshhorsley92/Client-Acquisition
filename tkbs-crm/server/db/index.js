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

function hasTable(database, name) {
  return !!database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?"
  ).get(name);
}

function hasColumn(database, table, column) {
  try {
    return !!database.prepare(
      "SELECT 1 FROM pragma_table_info(?) WHERE name = ?"
    ).get(table, column);
  } catch (e) { return false; }
}

// v1 → v2 was a clean-slate cut. Drop every v1 data table so schema.sql
// recreates the new shape. Only fires if a v1 table is still present.
const V1_TO_V2_WIPE_TABLES = [
  'companies', 'contacts', 'deals', 'tasks',
  'activities', 'documents', 'stage_actions', 'script_templates',
  'generation_jobs', 'email_messages', 'sms_messages', 'call_recordings',
];

function migrateV1ToV2(database) {
  if (!hasTable(database, 'companies') && !hasTable(database, 'contacts') &&
      !hasTable(database, 'deals') && !hasTable(database, 'tasks')) return false;
  database.pragma('foreign_keys = OFF');
  try {
    const tx = database.transaction(() => {
      for (const t of V1_TO_V2_WIPE_TABLES) {
        database.exec(`DROP TABLE IF EXISTS ${t}`);
      }
    });
    tx();
  } finally {
    database.pragma('foreign_keys = ON');
  }
  return true;
}

// Dashboard decoupling (2026-04-18): drop status_actions + the CRM→Dashboard
// columns on engagements and call_recordings. Surgical — preserves client
// data, engagement data, and calls.
const ENGAGEMENT_DASHBOARD_COLUMNS = [
  'dashboard_user_id', 'dashboard_org_id', 'launch_client_id', 'launch_activated_at',
];
const CALL_DASHBOARD_COLUMNS = [
  'pushed_to_dashboard_at', 'dashboard_user_id', 'dashboard_org_id',
];

function migrateDashboardDecoupling(database) {
  let changed = false;

  for (const t of ['stage_actions', 'status_actions']) {
    if (hasTable(database, t)) {
      database.exec(`DROP TABLE IF EXISTS ${t}`);
      changed = true;
    }
  }

  if (hasTable(database, 'engagements')) {
    for (const col of ENGAGEMENT_DASHBOARD_COLUMNS) {
      if (hasColumn(database, 'engagements', col)) {
        try { database.exec(`ALTER TABLE engagements DROP COLUMN ${col}`); changed = true; }
        catch (e) { console.warn(`Could not drop engagements.${col}:`, e.message); }
      }
    }
  }

  if (hasTable(database, 'call_recordings')) {
    for (const col of CALL_DASHBOARD_COLUMNS) {
      if (hasColumn(database, 'call_recordings', col)) {
        try { database.exec(`ALTER TABLE call_recordings DROP COLUMN ${col}`); changed = true; }
        catch (e) { console.warn(`Could not drop call_recordings.${col}:`, e.message); }
      }
    }
  }

  return changed;
}

// Brand Profile elevation (2026-04-20): clients now own a canonical brand
// profile independent of any call. Surgical add-column; existing rows default
// to empty JSON objects.
function migrateBrandProfileOnClients(database) {
  if (!hasTable(database, 'clients')) return false;
  let changed = false;
  if (!hasColumn(database, 'clients', 'brand_profile')) {
    database.exec("ALTER TABLE clients ADD COLUMN brand_profile TEXT NOT NULL DEFAULT '{}'");
    changed = true;
  }
  if (!hasColumn(database, 'clients', 'brand_profile_sources')) {
    database.exec("ALTER TABLE clients ADD COLUMN brand_profile_sources TEXT NOT NULL DEFAULT '{}'");
    changed = true;
  }
  return changed;
}

// Scraper bridge (2026-05-01): track upstream Python lead origin on clients
// so we can dedup pushes, badge the source on the UI, and link back to the
// original platform listing.
function migrateScraperSource(database) {
  if (!hasTable(database, 'clients')) return false;
  let changed = false;
  const cols = ['source_lead_id', 'source_platform', 'source_url', 'source_imported_at'];
  for (const col of cols) {
    if (!hasColumn(database, 'clients', col)) {
      database.exec(`ALTER TABLE clients ADD COLUMN ${col} TEXT`);
      changed = true;
    }
  }
  return changed;
}

// Whisper auto-transcription (2026-05-01): track async transcription state
// on call_recordings so the UI can poll and the API can surface failures.
function migrateWhisperTranscription(database) {
  if (!hasTable(database, 'call_recordings')) return false;
  let changed = false;
  if (!hasColumn(database, 'call_recordings', 'transcript_status')) {
    database.exec("ALTER TABLE call_recordings ADD COLUMN transcript_status TEXT");
    changed = true;
  }
  if (!hasColumn(database, 'call_recordings', 'transcript_error')) {
    database.exec("ALTER TABLE call_recordings ADD COLUMN transcript_error TEXT");
    changed = true;
  }
  return changed;
}

function initDb() {
  const database = getDb();

  const wiped = migrateV1ToV2(database);
  if (wiped) console.log('Migrated v1 CRM schema → v2 clients/engagements (data wiped).');

  const decoupled = migrateDashboardDecoupling(database);
  if (decoupled) console.log('Migrated Dashboard decoupling: dropped status_actions + dashboard columns.');

  const brandProfileAdded = migrateBrandProfileOnClients(database);
  if (brandProfileAdded) console.log('Added brand_profile + brand_profile_sources columns to clients.');

  const scraperSourceAdded = migrateScraperSource(database);
  if (scraperSourceAdded) console.log('Added source_lead_id + source_platform + source_url + source_imported_at columns to clients.');

  const whisperAdded = migrateWhisperTranscription(database);
  if (whisperAdded) console.log('Added transcript_status + transcript_error columns to call_recordings.');

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
