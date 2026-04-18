const request = require('supertest');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { createApp } = require('../index');
const {
  kickoffEnrichment,
  promoteScalars,
  resetStaleRunning,
} = require('../services/enrichment-runner');

function setupTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf-8');
  db.exec(schema);
  return db;
}

function seed(db) {
  const hash = bcrypt.hashSync('testpass123', 10);
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run('Test', 'test@test.com', hash, 'admin');
  db.prepare('INSERT INTO clients (name, owner_id) VALUES (?, ?)').run('Acme', 1);
}

let db, app, agent;

beforeEach(async () => {
  db = setupTestDb();
  seed(db);
  app = createApp(db);
  agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'test@test.com', password: 'testpass123' });
});

afterEach(() => { db.close(); });

describe('POST /api/enrichment/run', () => {
  test('rejects missing client_id', async () => {
    const res = await agent.post('/api/enrichment/run').send({});
    expect(res.status).toBe(400);
  });

  test('404 on unknown client', async () => {
    const res = await agent.post('/api/enrichment/run').send({ client_id: 999 });
    expect(res.status).toBe(404);
  });

  test('flips status to running and returns the updated client', async () => {
    const res = await agent.post('/api/enrichment/run').send({ client_id: 1 });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('running');
    expect(res.body.client.enrichment_status).toBe('running');
  });

  test('refuses to double-run when already running', async () => {
    db.prepare("UPDATE clients SET enrichment_status = 'running' WHERE id = 1").run();
    const res = await agent.post('/api/enrichment/run').send({ client_id: 1 });
    expect(res.status).toBe(409);
  });
});

describe('GET /api/enrichment/:clientId', () => {
  test('returns current status and parsed data', async () => {
    db.prepare(
      "UPDATE clients SET enrichment_data = ?, enrichment_status = 'succeeded' WHERE id = 1"
    ).run(JSON.stringify({ sources: ['website'], confidence: 0.8 }));

    const res = await agent.get('/api/enrichment/1');
    expect(res.body.status).toBe('succeeded');
    expect(res.body.enrichment_data.sources).toEqual(['website']);
  });
});

describe('kickoffEnrichment (service)', () => {
  test('stores enrichment_data and flips status to succeeded on resolve', async () => {
    db.prepare("UPDATE clients SET website = 'https://acme.test' WHERE id = 1").run();
    const fakeRunner = async () => ({
      website_url: 'https://acme.test',
      emails: ['hi@acme.test'],
      social_links: { instagram: 'https://instagram.com/acme' },
      website_quality: 'decent',
      confidence: 0.6,
    });

    await kickoffEnrichment(db, 1, { runner: fakeRunner });

    const row = db.prepare('SELECT * FROM clients WHERE id = 1').get();
    expect(row.enrichment_status).toBe('succeeded');
    const parsed = JSON.parse(row.enrichment_data);
    expect(parsed.emails).toEqual(['hi@acme.test']);
  });

  test('promotes first email into client.email when empty', async () => {
    db.prepare("UPDATE clients SET website = 'https://acme.test' WHERE id = 1").run();
    const fakeRunner = async () => ({
      website_url: 'https://acme.test',
      emails: ['hi@acme.test', 'info@acme.test'],
      social_links: {},
    });

    await kickoffEnrichment(db, 1, { runner: fakeRunner });

    const row = db.prepare('SELECT email FROM clients WHERE id = 1').get();
    expect(row.email).toBe('hi@acme.test');
  });

  test('does not clobber existing client.email', async () => {
    db.prepare(
      "UPDATE clients SET website = 'https://acme.test', email = 'manual@acme.test' WHERE id = 1"
    ).run();
    const fakeRunner = async () => ({
      website_url: 'https://acme.test',
      emails: ['hi@acme.test'],
      social_links: {},
    });

    await kickoffEnrichment(db, 1, { runner: fakeRunner });

    const row = db.prepare('SELECT email FROM clients WHERE id = 1').get();
    expect(row.email).toBe('manual@acme.test');
  });

  test('merges social_links on top of existing ones', async () => {
    db.prepare(
      `UPDATE clients SET website = 'https://acme.test', social_links = ? WHERE id = 1`
    ).run(JSON.stringify({ linkedin: 'https://linkedin.com/company/acme' }));

    const fakeRunner = async () => ({
      website_url: 'https://acme.test',
      emails: [],
      social_links: { instagram: 'https://instagram.com/acme' },
    });

    await kickoffEnrichment(db, 1, { runner: fakeRunner });

    const row = db.prepare('SELECT social_links FROM clients WHERE id = 1').get();
    const parsed = JSON.parse(row.social_links);
    expect(parsed.linkedin).toBeDefined();
    expect(parsed.instagram).toBeDefined();
  });

  test('flips status to failed when the runner rejects', async () => {
    const fakeRunner = async () => { throw new Error('boom'); };

    await kickoffEnrichment(db, 1, { runner: fakeRunner });

    const row = db.prepare('SELECT * FROM clients WHERE id = 1').get();
    expect(row.enrichment_status).toBe('failed');
    const parsed = JSON.parse(row.enrichment_data);
    expect(parsed.error).toBe('boom');
  });
});

describe('promoteScalars', () => {
  test('fills empty website + email + social_links', () => {
    const client = { website: null, email: null, social_links: '{}' };
    const data = {
      website_url: 'https://acme.test',
      emails: ['hi@acme.test'],
      social_links: { instagram: 'https://instagram.com/acme' },
    };
    promoteScalars(db, 1, client, data);
    const row = db.prepare('SELECT website, email, social_links FROM clients WHERE id = 1').get();
    expect(row.website).toBe('https://acme.test');
    expect(row.email).toBe('hi@acme.test');
    expect(JSON.parse(row.social_links).instagram).toBeTruthy();
  });

  test('no-op when data has nothing to promote', () => {
    const client = { website: 'existing', email: 'a@b', social_links: '{}' };
    const data = { website_url: null, emails: [], social_links: {} };
    expect(() => promoteScalars(db, 1, client, data)).not.toThrow();
  });
});

describe('resetStaleRunning', () => {
  test('flips rows stuck in running past the age window', () => {
    db.prepare(
      `UPDATE clients SET enrichment_status = 'running', updated_at = datetime('now', '-10 minutes') WHERE id = 1`
    ).run();

    const changed = resetStaleRunning(db, 5);
    expect(changed).toBe(1);

    const row = db.prepare('SELECT * FROM clients WHERE id = 1').get();
    expect(row.enrichment_status).toBe('failed');
    expect(JSON.parse(row.enrichment_data).error).toBe('stale_running_reset_on_boot');
  });

  test('leaves fresh running rows alone', () => {
    db.prepare(
      `UPDATE clients SET enrichment_status = 'running', updated_at = datetime('now') WHERE id = 1`
    ).run();

    const changed = resetStaleRunning(db, 5);
    expect(changed).toBe(0);
  });
});
