const { initDb, getDb } = require('../server/db');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

initDb();
const db = getDb();

// Check if admin exists
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

// Seed stage actions
const actionCount = db.prepare('SELECT COUNT(*) as c FROM stage_actions').get().c;
if (actionCount === 0) {
  const seed = fs.readFileSync(path.join(__dirname, '..', 'server', 'db', 'seed.sql'), 'utf-8');
  const filtered = seed.split('\n').filter(l => !l.includes('INSERT OR IGNORE INTO users')).join('\n');
  db.exec(filtered);
  console.log('Seed data loaded.');
} else {
  console.log('Seed data already exists.');
}

db.close();
console.log('Database initialization complete.');
