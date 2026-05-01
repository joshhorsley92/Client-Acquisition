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

describe('POST /api/calls/:id/transcribe', () => {
  test('404 when call does not exist', async () => {
    const res = await agent.post('/api/calls/999/transcribe');
    expect(res.status).toBe(404);
  });

  test('400 when call has no audio', async () => {
    const r = db.prepare(
      `INSERT INTO call_recordings (client_id, transcript) VALUES (1, 'pasted')`
    ).run();
    const res = await agent.post(`/api/calls/${r.lastInsertRowid}/transcribe`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no audio/i);
  });

  test('409 when transcription already in progress', async () => {
    const r = db.prepare(
      `INSERT INTO call_recordings (client_id, audio_path, transcript_status)
       VALUES (1, 'uploads/fake.mp3', 'processing')`
    ).run();
    const res = await agent.post(`/api/calls/${r.lastInsertRowid}/transcribe`);
    expect(res.status).toBe(409);
  });

  test('202 + flips status to pending when retry is permitted', async () => {
    // Point at a missing file — kickoff still flips to pending synchronously,
    // then the background task will mark it failed because the file does not
    // exist on disk. We assert only the synchronous part here.
    const r = db.prepare(
      `INSERT INTO call_recordings (client_id, audio_path, transcript_status, transcript_error)
       VALUES (1, 'uploads/missing.mp3', 'failed', 'old error')`
    ).run();
    const res = await agent.post(`/api/calls/${r.lastInsertRowid}/transcribe`);
    expect(res.status).toBe(202);
    expect(res.body.call.transcript_status).toBe('pending');
    expect(res.body.call.transcript_error).toBeNull();
  });
});

describe('PATCH /api/calls/:id — transcript edits clear stale Whisper state', () => {
  test('pasting a transcript flips status to done and clears error', async () => {
    const r = db.prepare(
      `INSERT INTO call_recordings (client_id, transcript_status, transcript_error)
       VALUES (1, 'failed', 'whisper crashed')`
    ).run();
    const res = await agent.patch(`/api/calls/${r.lastInsertRowid}`)
      .send({ transcript: 'manually pasted' });
    expect(res.status).toBe(200);
    expect(res.body.call.transcript).toBe('manually pasted');
    expect(res.body.call.transcript_source).toBe('pasted');
    expect(res.body.call.transcript_status).toBe('done');
    expect(res.body.call.transcript_error).toBeNull();
  });

  test('clearing the transcript resets status to null', async () => {
    const r = db.prepare(
      `INSERT INTO call_recordings (client_id, transcript, transcript_status)
       VALUES (1, 'old', 'done')`
    ).run();
    const res = await agent.patch(`/api/calls/${r.lastInsertRowid}`)
      .send({ transcript: '' });
    expect(res.status).toBe(200);
    expect(res.body.call.transcript_status).toBeNull();
  });
});
