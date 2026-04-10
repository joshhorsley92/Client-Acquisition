#!/bin/bash
set -e

echo "=== TKBS CRM Setup ==="

echo "Installing server dependencies..."
npm install

echo "Installing client dependencies..."
cd client && npm install && cd ..

echo ""
echo "Initializing database..."
node -e "
const { initDb, getDb } = require('./server/db');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

initDb();
const db = getDb();

const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('josh@tkbsmarketing.com');
if (!existing) {
  const hash = bcrypt.hashSync('changeme', 10);
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(
    'Josh Horsley', 'josh@tkbsmarketing.com', hash, 'admin'
  );
  console.log('Admin user created: josh@tkbsmarketing.com / changeme');
} else {
  console.log('Admin user already exists.');
}

const actionCount = db.prepare('SELECT COUNT(*) as c FROM stage_actions').get().c;
if (actionCount === 0) {
  const seed = fs.readFileSync(path.join(__dirname, 'server', 'db', 'seed.sql'), 'utf-8');
  const filtered = seed.split('\n').filter(l => !l.includes('INSERT OR IGNORE INTO users')).join('\n');
  db.exec(filtered);
  console.log('Seed data loaded.');
} else {
  console.log('Seed data already exists.');
}

// Seed script templates
const { seedScriptTemplates, seedMissingScriptTemplates } = require('./server/db/seed-scripts');
const scriptResult = seedScriptTemplates(db);
console.log(scriptResult.seeded ? 'Script templates seeded: ' + scriptResult.count : 'Script templates already exist.');

// Seed any missing script templates (new additions)
const missingResult = seedMissingScriptTemplates(db);
console.log(missingResult.added > 0 ? 'Added ' + missingResult.added + ' new script templates.' : 'All script templates already exist.');

db.close();
"

echo ""
echo "=== Setup Complete ==="
echo "Run 'npm run dev' to start the dev server"
echo "Login: josh@tkbsmarketing.com / changeme"
