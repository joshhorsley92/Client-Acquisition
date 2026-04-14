const request = require('supertest');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { createApp } = require('../index');
const { scoreDeal, parseRevenueFromText } = require('../services/fit-score');

function setupTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf-8');
  db.exec(schema);
  return db;
}

function seedUser(db) {
  const hash = bcrypt.hashSync('testpass123', 10);
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(
    'Test User', 'test@test.com', hash, 'admin'
  );
}

function insertCompany(db, fields) {
  const cols = Object.keys(fields);
  const placeholders = cols.map(() => '?').join(', ');
  const res = db.prepare(
    `INSERT INTO companies (${cols.join(', ')}) VALUES (${placeholders})`
  ).run(...cols.map(c => fields[c]));
  return res.lastInsertRowid;
}

function insertDeal(db, fields) {
  const base = { stage: 'lead', ...fields };
  const cols = Object.keys(base);
  const placeholders = cols.map(() => '?').join(', ');
  const res = db.prepare(
    `INSERT INTO deals (${cols.join(', ')}) VALUES (${placeholders})`
  ).run(...cols.map(c => base[c]));
  return res.lastInsertRowid;
}

function createSignalsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS acq_marketing_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT,
      lead_id INTEGER,
      has_website INTEGER,
      has_social_media INTEGER,
      has_seo INTEGER,
      has_paid_ads INTEGER,
      website_quality TEXT
    );
  `);
}

describe('parseRevenueFromText', () => {
  test('parses $M / million', () => {
    expect(parseRevenueFromText('$5M annual revenue')).toBe(5_000_000);
    expect(parseRevenueFromText('about 2.5 million')).toBe(2_500_000);
  });
  test('parses $K / thousand', () => {
    expect(parseRevenueFromText('$750k')).toBe(750_000);
  });
  test('parses plain dollars', () => {
    expect(parseRevenueFromText('$500,000')).toBe(500_000);
  });
  test('returns null when no figure', () => {
    expect(parseRevenueFromText('nothing here')).toBeNull();
    expect(parseRevenueFromText('')).toBeNull();
    expect(parseRevenueFromText(null)).toBeNull();
  });
});

describe('scoreDeal — ICP match', () => {
  let db;
  beforeEach(() => { db = setupTestDb(); seedUser(db); });
  afterEach(() => db.close());

  test('computes ICP match correctly for a strong Michigan retail fit', () => {
    const cid = insertCompany(db, {
      name: 'StrongCo',
      location: 'Detroit, MI',
      industry: 'retail',
      revenue_estimate: '$2M',
    });
    const did = insertDeal(db, { company_id: cid });
    const result = scoreDeal(db, did);
    // industry 15 + revenue 10 + geo 5 + green_flag (product_with_weak_marketing) 10 = 40
    expect(result.breakdown.icp_match.details.industry_match).toBe(15);
    expect(result.breakdown.icp_match.details.revenue_in_range).toBe(10);
    expect(result.breakdown.icp_match.details.geographic_fit).toBe(5);
    expect(result.breakdown.icp_match.score).toBeGreaterThanOrEqual(30);
    expect(result.breakdown.icp_match.max).toBe(40);
  });

  test('handles excluded industries — zero industry points and red flag', () => {
    const cid = insertCompany(db, {
      name: 'BigCorp',
      location: 'Detroit, MI',
      industry: 'large_corporation',
      revenue_estimate: '$2M',
    });
    const did = insertDeal(db, { company_id: cid });
    const result = scoreDeal(db, did);
    expect(result.breakdown.icp_match.details.industry_match).toBe(0);
    expect(result.flags.red).toContain('industry_excluded');
  });

  test('respects revenue range — within-range full, near-band half, outside zero', () => {
    const cidIn = insertCompany(db, { name: 'In', location: 'MI', industry: 'retail', revenue_estimate: '$2M' });
    const cidNear = insertCompany(db, { name: 'Near', location: 'MI', industry: 'retail', revenue_estimate: '$11M' });
    const cidOut = insertCompany(db, { name: 'Out', location: 'MI', industry: 'retail', revenue_estimate: '$100M' });

    const inDeal = insertDeal(db, { company_id: cidIn });
    const nearDeal = insertDeal(db, { company_id: cidNear });
    const outDeal = insertDeal(db, { company_id: cidOut });

    expect(scoreDeal(db, inDeal).breakdown.icp_match.details.revenue_in_range).toBe(10);
    expect(scoreDeal(db, nearDeal).breakdown.icp_match.details.revenue_in_range).toBe(5);
    expect(scoreDeal(db, outDeal).breakdown.icp_match.details.revenue_in_range).toBe(0);
  });

  test('geographic fit — MI full, other US partial, unknown zero', () => {
    const cidMi = insertCompany(db, { name: 'Mi', location: 'Ann Arbor, MI', industry: 'retail' });
    const cidNy = insertCompany(db, { name: 'Ny', location: 'New York, NY', industry: 'retail' });
    const cidIntl = insertCompany(db, { name: 'Intl', location: 'Toronto, Canada', industry: 'retail' });

    expect(scoreDeal(db, insertDeal(db, { company_id: cidMi })).breakdown.icp_match.details.geographic_fit).toBe(5);
    expect(scoreDeal(db, insertDeal(db, { company_id: cidNy })).breakdown.icp_match.details.geographic_fit).toBe(3);
    expect(scoreDeal(db, insertDeal(db, { company_id: cidIntl })).breakdown.icp_match.details.geographic_fit).toBe(0);
  });

  test('applies green flag bonus when product exists with weak marketing', () => {
    const cid = insertCompany(db, { name: 'Green', location: 'MI', industry: 'retail', revenue_estimate: '$2M' });
    const did = insertDeal(db, {
      company_id: cid,
      source_detail: 'They want to scale beyond our town',
    });
    const result = scoreDeal(db, did);
    expect(result.breakdown.icp_match.details.green_flag_bonus).toBeGreaterThan(0);
    expect(result.flags.green.length).toBeGreaterThan(0);
    expect(result.flags.green).toContain('scaling_beyond_local');
  });

  test('applies red flag penalty for "cheapest everything" language', () => {
    const cid = insertCompany(db, { name: 'RedCo', location: 'MI', industry: 'retail', revenue_estimate: '$2M' });
    const did = insertDeal(db, {
      company_id: cid,
      call_notes: 'They want everything at the cheapest possible price',
    });
    const result = scoreDeal(db, did);
    expect(result.breakdown.icp_match.details.red_flag_penalty).toBe(-15);
    expect(result.flags.red).toContain('unclear_everything_cheap');
  });
});

describe('scoreDeal — Readiness signals', () => {
  let db;
  beforeEach(() => { db = setupTestDb(); seedUser(db); });
  afterEach(() => db.close());

  test('uses neutral default (15/30) when no signals table present', () => {
    const cid = insertCompany(db, { name: 'Plain', location: 'MI', industry: 'retail' });
    const did = insertDeal(db, { company_id: cid });
    const result = scoreDeal(db, did);
    expect(result.breakdown.readiness_signals.score).toBe(15);
    expect(result.breakdown.readiness_signals.details.note).toMatch(/no marketing signals/);
  });

  test('reads from acq_marketing_signals when a matching row exists', () => {
    createSignalsTable(db);
    const cid = insertCompany(db, { name: 'SignalCo', location: 'MI', industry: 'retail' });
    db.prepare(`INSERT INTO acq_marketing_signals
      (company_name, has_website, has_social_media, has_seo, has_paid_ads, website_quality)
      VALUES (?, 0, 0, 0, 0, 'basic')`).run('SignalCo');
    const did = insertDeal(db, { company_id: cid });
    const result = scoreDeal(db, did);
    // 10 + 8 + 6 + 2 (no_seo requires has_website=1, so skipped) = 26 — capped at 30
    expect(result.breakdown.readiness_signals.score).toBe(26);
    expect(result.breakdown.readiness_signals.details.no_website).toBe(10);
    expect(result.breakdown.readiness_signals.details.no_social).toBe(8);
    expect(result.breakdown.readiness_signals.details.weak_quality).toBe(6);
  });
});

describe('scoreDeal — Engagement', () => {
  let db;
  beforeEach(() => { db = setupTestDb(); seedUser(db); });
  afterEach(() => db.close());

  test('buckets by activity count', () => {
    const cid = insertCompany(db, { name: 'ActCo', location: 'MI', industry: 'retail' });
    const did = insertDeal(db, { company_id: cid });

    // 0 activities — bucket 0-2, score 0
    let res = scoreDeal(db, did);
    expect(res.breakdown.engagement.score).toBe(0);
    expect(res.breakdown.engagement.details.bucket).toBe('0-2');

    // Add 4 activities — bucket 3-5, score ~10
    for (let i = 0; i < 4; i++) {
      db.prepare(`INSERT INTO activities (deal_id, type, content) VALUES (?, 'note', 'x')`).run(did);
    }
    res = scoreDeal(db, did);
    expect(res.breakdown.engagement.details.bucket).toBe('3-5');
    expect(res.breakdown.engagement.score).toBe(10);

    // Add 4 more (total 8) — bucket 6-10, score 20
    for (let i = 0; i < 4; i++) {
      db.prepare(`INSERT INTO activities (deal_id, type, content) VALUES (?, 'note', 'x')`).run(did);
    }
    res = scoreDeal(db, did);
    expect(res.breakdown.engagement.details.bucket).toBe('6-10');
    expect(res.breakdown.engagement.score).toBe(20);

    // Add 5 more (total 13) — bucket 11+, score 30
    for (let i = 0; i < 5; i++) {
      db.prepare(`INSERT INTO activities (deal_id, type, content) VALUES (?, 'note', 'x')`).run(did);
    }
    res = scoreDeal(db, did);
    expect(res.breakdown.engagement.details.bucket).toBe('11+');
    expect(res.breakdown.engagement.score).toBe(30);
  });
});

describe('scoreDeal — errors', () => {
  let db;
  beforeEach(() => { db = setupTestDb(); seedUser(db); });
  afterEach(() => db.close());

  test('throws when the deal does not exist', () => {
    expect(() => scoreDeal(db, 99999)).toThrow(/not found/);
  });
});

describe('Route integration — fit score', () => {
  let db, app, agent;
  beforeEach(async () => {
    db = setupTestDb();
    seedUser(db);
    app = createApp(db);
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'test@test.com', password: 'testpass123' });
    insertCompany(db, {
      name: 'Acme Retail',
      location: 'Detroit, MI',
      industry: 'retail',
      revenue_estimate: '$2M',
    });
  });
  afterEach(() => db.close());

  test('POST /api/deals includes fit_score on create', async () => {
    const res = await agent.post('/api/deals').send({ company_id: 1 });
    expect(res.status).toBe(201);
    expect(res.body.fit_score).toBeGreaterThan(0);
    expect(res.body.fit_score_breakdown).toBeDefined();
    expect(res.body.deal.fit_score).toBe(res.body.fit_score);
  });

  test('GET /api/deals/:id computes fit_score lazily if null, caches it', async () => {
    // Insert a deal directly bypassing the route (simulating Python crm_bridge.py)
    const did = insertDeal(db, { company_id: 1 });
    // Ensure fit_score is null
    const before = db.prepare('SELECT fit_score FROM deals WHERE id = ?').get(did);
    expect(before.fit_score).toBeNull();

    const res = await agent.get(`/api/deals/${did}`);
    expect(res.status).toBe(200);
    expect(res.body.deal.fit_score).not.toBeNull();
    expect(typeof res.body.deal.fit_score).toBe('number');

    // Verify it was persisted
    const after = db.prepare('SELECT fit_score FROM deals WHERE id = ?').get(did);
    expect(after.fit_score).toBe(res.body.deal.fit_score);
  });

  test('POST /api/deals/:id/fit-score/recompute overwrites the cached score', async () => {
    const create = await agent.post('/api/deals').send({ company_id: 1 });
    const did = create.body.deal.id;
    const original = create.body.fit_score;

    // Mutate the cached score to a sentinel so we can prove it was overwritten
    db.prepare('UPDATE deals SET fit_score = ? WHERE id = ?').run(1, did);

    const res = await agent.post(`/api/deals/${did}/fit-score/recompute`);
    expect(res.status).toBe(200);
    expect(res.body.score).toBe(original);
    expect(res.body.breakdown).toBeDefined();
    expect(res.body.flags).toBeDefined();

    const stored = db.prepare('SELECT fit_score FROM deals WHERE id = ?').get(did);
    expect(stored.fit_score).toBe(original);
  });

  test('POST /api/deals/:id/fit-score/recompute returns 404 for missing deal', async () => {
    const res = await agent.post('/api/deals/99999/fit-score/recompute');
    expect(res.status).toBe(404);
  });
});
