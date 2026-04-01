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

function seedTestUser(db) {
  const hash = bcrypt.hashSync('testpass123', 10);
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(
    'Test User', 'test@test.com', hash, 'admin'
  );
}

let db, app, agent;

beforeEach(async () => {
  db = setupTestDb();
  seedTestUser(db);
  app = createApp(db);
  agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'test@test.com', password: 'testpass123' });
});

afterEach(() => { db.close(); });

describe('POST /api/contacts', () => {
  test('creates a contact', async () => {
    const res = await agent.post('/api/contacts').send({
      name: 'Sarah Chen',
      email: 'sarah@acme.com',
      phone: '555-1234',
    });
    expect(res.status).toBe(201);
    expect(res.body.contact.name).toBe('Sarah Chen');
  });

  test('creates a contact linked to a company', async () => {
    const company = await agent.post('/api/companies').send({ name: 'Acme' });
    const res = await agent.post('/api/contacts').send({
      name: 'Sarah Chen',
      company_id: company.body.company.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.contact.company_id).toBe(company.body.company.id);
  });

  test('returns 400 without name', async () => {
    const res = await agent.post('/api/contacts').send({ email: 'test@test.com' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/contacts', () => {
  test('lists all contacts', async () => {
    await agent.post('/api/contacts').send({ name: 'Person A' });
    await agent.post('/api/contacts').send({ name: 'Person B' });
    const res = await agent.get('/api/contacts');
    expect(res.status).toBe(200);
    expect(res.body.contacts).toHaveLength(2);
  });

  test('filters contacts by company_id', async () => {
    const c1 = await agent.post('/api/companies').send({ name: 'Company 1' });
    const c2 = await agent.post('/api/companies').send({ name: 'Company 2' });
    await agent.post('/api/contacts').send({ name: 'A', company_id: c1.body.company.id });
    await agent.post('/api/contacts').send({ name: 'B', company_id: c2.body.company.id });
    const res = await agent.get(`/api/contacts?company_id=${c1.body.company.id}`);
    expect(res.body.contacts).toHaveLength(1);
    expect(res.body.contacts[0].name).toBe('A');
  });
});

describe('GET /api/contacts/:id', () => {
  test('returns a single contact', async () => {
    const create = await agent.post('/api/contacts').send({ name: 'Sarah' });
    const res = await agent.get(`/api/contacts/${create.body.contact.id}`);
    expect(res.status).toBe(200);
    expect(res.body.contact.name).toBe('Sarah');
  });

  test('returns 404 for missing contact', async () => {
    const res = await agent.get('/api/contacts/999');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/contacts/:id', () => {
  test('updates a contact', async () => {
    const create = await agent.post('/api/contacts').send({ name: 'Old Name' });
    const res = await agent.patch(`/api/contacts/${create.body.contact.id}`).send({ name: 'New Name', phone: '555-9999' });
    expect(res.status).toBe(200);
    expect(res.body.contact.name).toBe('New Name');
    expect(res.body.contact.phone).toBe('555-9999');
  });
});

describe('DELETE /api/contacts/:id', () => {
  test('deletes a contact', async () => {
    const create = await agent.post('/api/contacts').send({ name: 'ToDelete' });
    const res = await agent.delete(`/api/contacts/${create.body.contact.id}`);
    expect(res.status).toBe(200);
    const get = await agent.get(`/api/contacts/${create.body.contact.id}`);
    expect(get.status).toBe(404);
  });
});
