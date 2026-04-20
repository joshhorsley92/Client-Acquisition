const request = require('supertest');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// Mock the SDK wrapper so tests never hit the real Claude API.
jest.mock('../services/claude-api', () => ({
  isConfigured: jest.fn(() => true),
  runPrompt: jest.fn(() => Promise.resolve({
    output: '# Mocked proposal\n\nContent.',
    model: 'claude-sonnet-4-6',
    usage: { input_tokens: 100, output_tokens: 200 },
  })),
  DEFAULT_MODEL: 'claude-sonnet-4-6',
}));

const claudeApi = require('../services/claude-api');
const { createApp } = require('../index');

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
  db.prepare('INSERT INTO clients (name, website, owner_id) VALUES (?, ?, ?)')
    .run('Acme', 'https://acme.test', 1);
  db.prepare(
    `INSERT INTO engagements (client_id, status, estimated_value, owner_id)
     VALUES (1, 'working', 5000, 1)`
  ).run();
}

let db, app, agent;

beforeEach(async () => {
  db = setupTestDb();
  seed(db);
  app = createApp(db);
  agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'test@test.com', password: 'testpass123' });
  claudeApi.runPrompt.mockClear();
  claudeApi.isConfigured.mockReturnValue(true);
});

afterEach(() => { db.close(); });

describe('GET /api/automations/catalog', () => {
  test('returns the registry of runnable automations', async () => {
    const res = await agent.get('/api/automations/catalog');
    expect(res.status).toBe(200);
    expect(res.body.automations).toContainEqual(
      expect.objectContaining({ key: 'proposal', requiresEngagement: true, usesBrandProfile: true })
    );
  });
});

describe('POST /api/automations/run — validation', () => {
  test('rejects unknown automation', async () => {
    const res = await agent.post('/api/automations/run').send({ automation: 'nope', client_id: 1, engagement_id: 1 });
    expect(res.status).toBe(400);
  });
  test('rejects missing client_id', async () => {
    const res = await agent.post('/api/automations/run').send({ automation: 'proposal', engagement_id: 1 });
    expect(res.status).toBe(400);
  });
  test('requires engagement_id for proposal', async () => {
    const res = await agent.post('/api/automations/run').send({ automation: 'proposal', client_id: 1 });
    expect(res.status).toBe(400);
  });
  test('404 when client does not exist', async () => {
    const res = await agent.post('/api/automations/run').send({ automation: 'proposal', client_id: 999, engagement_id: 1 });
    expect(res.status).toBe(404);
  });
  test('400 when engagement belongs to a different client', async () => {
    db.prepare('INSERT INTO clients (name, owner_id) VALUES (?, ?)').run('Other', 1);
    db.prepare(
      `INSERT INTO engagements (client_id, status, owner_id) VALUES (2, 'new', 1)`
    ).run();
    const res = await agent.post('/api/automations/run').send({ automation: 'proposal', client_id: 1, engagement_id: 2 });
    expect(res.status).toBe(400);
  });
  test('503 when ANTHROPIC_API_KEY is not configured', async () => {
    claudeApi.isConfigured.mockReturnValue(false);
    const res = await agent.post('/api/automations/run').send({ automation: 'proposal', client_id: 1, engagement_id: 1 });
    expect(res.status).toBe(503);
  });
});

describe('POST /api/automations/run — happy path', () => {
  test('creates a running job and returns its id; completes asynchronously', async () => {
    const res = await agent.post('/api/automations/run').send({ automation: 'proposal', client_id: 1, engagement_id: 1 });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('running');
    expect(res.body.job_id).toBeTruthy();

    // Drain the pending promise (runPrompt resolved immediately via the mock).
    await new Promise((r) => setImmediate(r));

    const jobRow = db.prepare('SELECT * FROM generation_jobs WHERE id = ?').get(res.body.job_id);
    expect(jobRow.status).toBe('completed');
    expect(jobRow.output).toContain('# Mocked proposal');
    expect(claudeApi.runPrompt).toHaveBeenCalledTimes(1);
    const [prompt] = claudeApi.runPrompt.mock.calls[0];
    expect(prompt).toContain('Acme');
  });

  test('injects brand profile into the prompt when a call extraction exists', async () => {
    const extraction = {
      profile: {
        business_description: 'We sell espresso machines to coffee shops.',
        customer_avatar: { role: 'shop owner' },
        brand_voice: 'friendly-but-serious',
      },
      completion_percent: 80,
    };
    db.prepare(
      `INSERT INTO call_recordings (client_id, engagement_id, transcript, extracted_profile_json, review_status)
       VALUES (?, ?, ?, ?, 'approved')`
    ).run(1, 1, 't', JSON.stringify(extraction));

    const res = await agent.post('/api/automations/run').send({ automation: 'proposal', client_id: 1, engagement_id: 1 });
    expect(res.status).toBe(200);
    expect(res.body.brand_profile_source).toMatchObject({ review_status: 'approved' });

    await new Promise((r) => setImmediate(r));

    const [prompt] = claudeApi.runPrompt.mock.calls[0];
    expect(prompt).toContain('BRAND PROFILE');
    expect(prompt).toContain('espresso machines');
  });

  test('a failing model call flips the job to failed with an error message', async () => {
    claudeApi.runPrompt.mockRejectedValueOnce(new Error('API went boom'));

    const res = await agent.post('/api/automations/run').send({ automation: 'proposal', client_id: 1, engagement_id: 1 });
    expect(res.status).toBe(200);
    const jobId = res.body.job_id;

    await new Promise((r) => setImmediate(r));

    const jobRow = db.prepare('SELECT * FROM generation_jobs WHERE id = ?').get(jobId);
    expect(jobRow.status).toBe('failed');
    expect(jobRow.error).toContain('API went boom');
  });
});

describe('GET /api/automations/job/:id', () => {
  test('returns the job row', async () => {
    const start = await agent.post('/api/automations/run').send({ automation: 'proposal', client_id: 1, engagement_id: 1 });
    await new Promise((r) => setImmediate(r));

    const res = await agent.get(`/api/automations/job/${start.body.job_id}`);
    expect(res.status).toBe(200);
    expect(res.body.job.status).toBe('completed');
    expect(res.body.job.output).toContain('# Mocked proposal');
  });

  test('404 on unknown id', async () => {
    const res = await agent.get('/api/automations/job/999');
    expect(res.status).toBe(404);
  });
});
