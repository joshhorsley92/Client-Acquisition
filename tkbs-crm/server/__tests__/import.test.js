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

function seedTestData(db) {
  const hash = bcrypt.hashSync('testpass123', 10);
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(
    'Test', 'test@test.com', hash, 'admin'
  );
}

let db, app, agent;

beforeEach(async () => {
  db = setupTestDb();
  seedTestData(db);
  app = createApp(db);
  agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'test@test.com', password: 'testpass123' });
});

afterEach(() => { db.close(); });

describe('POST /api/import/bulk', () => {
  test('imports multiple prospects', async () => {
    const res = await agent.post('/api/import/bulk').send({
      prospects: [
        { company_name: 'Acme Corp', contact_name: 'John', contact_email: 'john@acme.com', location: 'Detroit, MI', industry: 'Manufacturing' },
        { company_name: 'Beta LLC', contact_name: 'Jane', contact_email: 'jane@beta.com', industry: 'Retail' },
        { company_name: 'Gamma Inc', contact_name: 'Bob', location: 'Chicago, IL' },
      ],
      default_stage: 'prospect',
      default_source: 'cold',
    });
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(3);
    expect(res.body.skipped).toBe(0);

    const deals = db.prepare('SELECT * FROM deals').all();
    expect(deals).toHaveLength(3);
    expect(deals[0].stage).toBe('prospect');
  });

  test('skips duplicates with active deals', async () => {
    // First import
    await agent.post('/api/import/bulk').send({
      prospects: [{ company_name: 'Acme Corp', contact_name: 'John' }],
    });
    // Second import — same company should be skipped
    const res = await agent.post('/api/import/bulk').send({
      prospects: [{ company_name: 'Acme Corp', contact_name: 'John' }],
    });
    expect(res.body.skipped).toBe(1);
    expect(res.body.imported).toBe(0);
  });

  test('deduplicates contacts by email', async () => {
    db.prepare('INSERT INTO contacts (name, email) VALUES (?, ?)').run('John', 'john@test.com');
    const res = await agent.post('/api/import/bulk').send({
      prospects: [{ company_name: 'New Co', contact_name: 'John Smith', contact_email: 'john@test.com' }],
    });
    expect(res.body.imported).toBe(1);
    // Should reuse existing contact
    const contacts = db.prepare('SELECT * FROM contacts').all();
    expect(contacts).toHaveLength(1);
  });

  test('returns 400 for empty array', async () => {
    const res = await agent.post('/api/import/bulk').send({ prospects: [] });
    expect(res.status).toBe(400);
  });

  test('returns 400 for over 500 prospects', async () => {
    const prospects = Array.from({ length: 501 }, (_, i) => ({ company_name: `Co ${i}` }));
    const res = await agent.post('/api/import/bulk').send({ prospects });
    expect(res.status).toBe(400);
  });

  test('errors on prospects with no company or contact name', async () => {
    const res = await agent.post('/api/import/bulk').send({
      prospects: [{ contact_email: 'nobody@example.com' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(0);
    expect(res.body.errors).toHaveLength(1);
  });

  test('defaults to prospect stage when not specified', async () => {
    const res = await agent.post('/api/import/bulk').send({
      prospects: [{ company_name: 'Default Stage Co' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    const deal = db.prepare('SELECT * FROM deals').get();
    expect(deal.stage).toBe('prospect');
  });

  test('rejects non-admin users', async () => {
    const hash = bcrypt.hashSync('pass123', 10);
    db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(
      'Member', 'member@test.com', hash, 'member'
    );
    const memberAgent = request.agent(app);
    await memberAgent.post('/api/auth/login').send({ email: 'member@test.com', password: 'pass123' });
    const res = await memberAgent.post('/api/import/bulk').send({
      prospects: [{ company_name: 'Should Fail' }],
    });
    expect(res.status).toBe(403);
  });
});
