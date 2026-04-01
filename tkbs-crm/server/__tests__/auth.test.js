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

let db, app;

beforeEach(() => {
  db = setupTestDb();
  seedTestUser(db);
  app = createApp(db);
});

afterEach(() => {
  db.close();
});

describe('POST /api/auth/login', () => {
  test('returns user on valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@test.com', password: 'testpass123' });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('test@test.com');
    expect(res.body.user.name).toBe('Test User');
    expect(res.body.user.password_hash).toBeUndefined();
  });

  test('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@test.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  test('returns 401 on unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.com', password: 'testpass123' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  test('returns 401 when not logged in', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('returns user when logged in', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'test@test.com', password: 'testpass123' });
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('test@test.com');
  });
});

describe('POST /api/auth/logout', () => {
  test('clears session', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'test@test.com', password: 'testpass123' });
    const logoutRes = await agent.post('/api/auth/logout');
    expect(logoutRes.status).toBe(200);
    const meRes = await agent.get('/api/auth/me');
    expect(meRes.status).toBe(401);
  });
});
