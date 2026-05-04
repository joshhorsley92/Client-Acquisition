const request = require('supertest');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { createApp } = require('../index');

function setupTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf-8');
  db.exec(schema);
  return db;
}

function seedUser(db) {
  const hash = bcrypt.hashSync('testpass123', 10);
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run('Test', 'test@test.com', hash, 'admin');
}

let db, app, agent;

beforeEach(async () => {
  db = setupTestDb();
  seedUser(db);
  app = createApp(db);
  agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'test@test.com', password: 'testpass123' });
});

afterEach(() => { db.close(); });

// supertest's .attach() needs a file on disk. Build one fresh per test in
// the OS temp dir so we don't pollute the repo.
const os = require('os');
function csvFile(content) {
  const p = path.join(os.tmpdir(), `tkbs-import-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`);
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}

describe('POST /api/import-clients', () => {
  test('imports a clean 3-row CSV', async () => {
    const csv =
      'name,website,industry,location\n' +
      'Acme Retail,https://acme.example,retail/boutique,Wayne\n' +
      'Beta Trades,https://beta.example,contractor_services,Oakland\n' +
      'Gamma Co,,retail/boutique,Macomb\n';
    const file = csvFile(csv);
    try {
      const res = await agent.post('/api/import-clients').attach('file', file);
      expect(res.status).toBe(200);
      expect(res.body.imported).toBe(3);
      expect(res.body.skipped).toBe(0);
      expect(res.body.errors).toEqual([]);
      expect(res.body.clients.length).toBe(3);
    } finally {
      fs.unlinkSync(file);
    }
  });

  test('skips rows already in CRM by source_lead_id', async () => {
    db.prepare(
      `INSERT INTO clients (name, source_lead_id, source_platform) VALUES (?, ?, ?)`
    ).run('Existing Co', 'lead-99', 'csv');

    const csv =
      'name,source_lead_id,source_platform\n' +
      'Existing Co,lead-99,csv\n' +
      'New Co,lead-100,csv\n';
    const file = csvFile(csv);
    try {
      const res = await agent.post('/api/import-clients').attach('file', file);
      expect(res.status).toBe(200);
      expect(res.body.imported).toBe(1);
      expect(res.body.skipped).toBe(1);
      expect(res.body.skipped_details[0].reason).toMatch(/source_lead_id/);
    } finally {
      fs.unlinkSync(file);
    }
  });

  test('skips rows that match existing client by name+email (case-insensitive)', async () => {
    db.prepare(
      `INSERT INTO clients (name, email) VALUES (?, ?)`
    ).run('Acme Boutique', 'sarah@acme.example');

    const csv =
      'name,email\n' +
      'ACME BOUTIQUE,SARAH@ACME.EXAMPLE\n' +  // case-insensitive dup
      'Different Co,other@example.com\n';
    const file = csvFile(csv);
    try {
      const res = await agent.post('/api/import-clients').attach('file', file);
      expect(res.status).toBe(200);
      expect(res.body.imported).toBe(1);
      expect(res.body.skipped).toBe(1);
      expect(res.body.skipped_details[0].reason).toMatch(/name\+email/);
    } finally {
      fs.unlinkSync(file);
    }
  });

  test('rejects rows missing required name', async () => {
    const csv =
      'name,website\n' +
      ',https://noname.example\n' +
      'Has Name,https://hasname.example\n';
    const file = csvFile(csv);
    try {
      const res = await agent.post('/api/import-clients').attach('file', file);
      expect(res.status).toBe(200);
      expect(res.body.imported).toBe(1);
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.errors[0].reason).toMatch(/name/i);
      expect(res.body.errors[0].row).toBe(2);
    } finally {
      fs.unlinkSync(file);
    }
  });

  test('rejects invalid type and preferred_contact values', async () => {
    const csv =
      'name,type,preferred_contact\n' +
      'Bad Type Co,B2X,email\n' +
      'Bad Pref Co,B2B,carrier_pigeon\n' +
      'Good Co,B2C,email\n';
    const file = csvFile(csv);
    try {
      const res = await agent.post('/api/import-clients').attach('file', file);
      expect(res.status).toBe(200);
      expect(res.body.imported).toBe(1);
      expect(res.body.errors).toHaveLength(2);
    } finally {
      fs.unlinkSync(file);
    }
  });

  test('ignores unknown columns instead of failing', async () => {
    const csv =
      'name,website,random_extra,another_one\n' +
      'Acme,https://acme.example,ignored,also ignored\n';
    const file = csvFile(csv);
    try {
      const res = await agent.post('/api/import-clients').attach('file', file);
      expect(res.status).toBe(200);
      expect(res.body.imported).toBe(1);
      expect(res.body.errors).toEqual([]);
    } finally {
      fs.unlinkSync(file);
    }
  });

  test('populates source_imported_at when source_lead_id is provided', async () => {
    const csv =
      'name,source_lead_id,source_platform\n' +
      'Sourced Co,lead-42,manual_csv\n';
    const file = csvFile(csv);
    try {
      const res = await agent.post('/api/import-clients').attach('file', file);
      expect(res.status).toBe(200);
      expect(res.body.imported).toBe(1);
      const client = res.body.clients[0];
      expect(client.source_lead_id).toBe('lead-42');
      expect(client.source_platform).toBe('manual_csv');
      expect(client.source_imported_at).toMatch(/T/);
    } finally {
      fs.unlinkSync(file);
    }
  });

  test('400 on missing file', async () => {
    const res = await agent.post('/api/import-clients');
    expect(res.status).toBe(400);
  });

  test('400 on empty CSV', async () => {
    const file = csvFile('');
    try {
      const res = await agent.post('/api/import-clients').attach('file', file);
      expect(res.status).toBe(400);
    } finally {
      fs.unlinkSync(file);
    }
  });
});
