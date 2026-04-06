# TKBS CRM Phase 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working CRM with auth, pipeline board, deal/contact/company management, and activity logging.

**Architecture:** Express API server with SQLite (better-sqlite3) and a React frontend bundled by Vite. Monorepo structure with `server/` and `client/` directories. Session-based auth with bcrypt password hashing.

**Tech Stack:** Node.js, Express, better-sqlite3, bcryptjs, express-session, React, Vite, @hello-pangea/dnd (drag-and-drop)

**Testing:** Jest + supertest for API tests. Run with `npx jest`.

**Spec reference:** `docs/specs/2026-03-31-tkbs-crm-design.md`

---

## File Structure

```
tkbs-crm/
├── package.json                   # Root package.json (monorepo scripts)
├── jest.config.js                 # Jest config for server tests
├── .gitignore
├── server/
│   ├── index.js                   # Express app factory + server start
│   ├── db/
│   │   ├── index.js               # DB connection, init, helpers
│   │   ├── schema.sql             # All table definitions
│   │   └── seed.sql               # Default stage actions, admin user
│   ├── routes/
│   │   ├── auth.js                # POST login, POST logout, GET me
│   │   ├── companies.js           # CRUD
│   │   ├── contacts.js            # CRUD + list by company
│   │   ├── deals.js               # CRUD + stage change
│   │   └── activities.js          # Create + list by deal
│   ├── middleware/
│   │   └── auth.js                # requireAuth, requireAdmin
│   └── __tests__/
│       ├── auth.test.js
│       ├── companies.test.js
│       ├── contacts.test.js
│       ├── deals.test.js
│       └── activities.test.js
├── client/
│   ├── index.html                 # Vite entry HTML
│   ├── vite.config.js             # Vite config with API proxy
│   ├── src/
│   │   ├── main.jsx               # React root mount
│   │   ├── App.jsx                # Router + auth context
│   │   ├── lib/
│   │   │   └── api.js             # Fetch wrapper for API calls
│   │   ├── components/
│   │   │   ├── Layout.jsx         # Sidebar + main content area
│   │   │   ├── DealCard.jsx       # Pipeline card component
│   │   │   └── Modal.jsx          # Reusable modal dialog
│   │   └── pages/
│   │       ├── Login.jsx          # Login form
│   │       ├── Pipeline.jsx       # Kanban board
│   │       ├── DealDetail.jsx     # Deal view with sections
│   │       ├── Contacts.jsx       # Contact list + create/edit
│   │       └── Companies.jsx      # Company list + create/edit
│   └── public/
│       └── (empty for now)
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `tkbs-crm/package.json`
- Create: `tkbs-crm/.gitignore`
- Create: `tkbs-crm/jest.config.js`

- [ ] **Step 1: Create project directory and package.json**

```bash
mkdir tkbs-crm && cd tkbs-crm
```

Create `package.json`:

```json
{
  "name": "tkbs-crm",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev:server": "node --watch server/index.js",
    "dev:client": "cd client && npx vite",
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "test": "jest --forceExit --detectOpenHandles",
    "test:watch": "jest --watch --forceExit --detectOpenHandles",
    "build": "cd client && npx vite build",
    "start": "NODE_ENV=production node server/index.js"
  }
}
```

- [ ] **Step 2: Install server dependencies**

```bash
npm install express better-sqlite3 bcryptjs express-session connect-sqlite3 cors
```

- [ ] **Step 3: Install dev dependencies**

```bash
npm install -D jest supertest concurrently
```

- [ ] **Step 4: Create client directory with Vite + React**

```bash
mkdir -p client/src client/public
cd client
npm init -y
npm install react react-dom react-router-dom @hello-pangea/dnd
npm install -D vite @vitejs/plugin-react
cd ..
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
client/node_modules/
client/dist/
*.db
.env
```

- [ ] **Step 6: Create jest.config.js**

```js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/server/__tests__/**/*.test.js'],
};
```

- [ ] **Step 7: Create directory structure**

```bash
mkdir -p server/db server/routes server/middleware server/__tests__
mkdir -p client/src/pages client/src/components client/src/lib
```

- [ ] **Step 8: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold tkbs-crm project with dependencies"
```

---

### Task 2: Database Schema

**Files:**
- Create: `server/db/schema.sql`
- Create: `server/db/seed.sql`

- [ ] **Step 1: Write schema.sql**

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin', 'member')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  location TEXT,
  industry TEXT,
  type TEXT CHECK(type IN ('B2B', 'B2C')),
  website TEXT,
  social_links TEXT DEFAULT '{}',
  employee_count TEXT,
  revenue_estimate TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT,
  preferred_contact TEXT CHECK(preferred_contact IN ('email', 'phone', 'text', 'linkedin')),
  notes TEXT,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  stage TEXT NOT NULL DEFAULT 'lead',
  source TEXT CHECK(source IN ('referral', 'cold', 'web', 'content', 'paid_ads')),
  source_detail TEXT,
  estimated_value REAL DEFAULT 0,
  package_type TEXT CHECK(package_type IN ('boost', 'launch', 'both', 'undecided')),
  services_discussed TEXT DEFAULT '[]',
  pricing_notes TEXT,
  call_notes TEXT,
  research_findings TEXT,
  objections_noted TEXT,
  lost_reason TEXT,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  stage_entered_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK(type IN ('email', 'call', 'meeting', 'note', 'stage_change', 'system')),
  content TEXT,
  metadata TEXT DEFAULT '{}',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'done', 'overdue')),
  auto_generated INTEGER NOT NULL DEFAULT 0,
  template_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('analysis_deck', 'proposal', 'other')),
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  generated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stage_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stage TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK(action_type IN ('create_tasks', 'start_cadence', 'trigger_skill', 'record')),
  config TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS script_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stage TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('email', 'call_script', 'objection', 'checklist', 'follow_up')),
  format TEXT NOT NULL DEFAULT 'markdown' CHECK(format IN ('markdown', 'structured')),
  content TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS generation_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('analysis_deck', 'proposal', 'ai_content')),
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed')),
  output TEXT,
  error TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
```

- [ ] **Step 2: Write seed.sql**

```sql
-- Default admin user (password: "changeme" — bcrypt hash)
-- Hash generated with: bcryptjs.hashSync('changeme', 10)
INSERT OR IGNORE INTO users (name, email, password_hash, role)
VALUES ('Josh Horsley', 'josh@tkbsmarketing.com', '$2a$10$placeholder_will_be_set_by_setup', 'admin');

-- Default pipeline stages are not stored in a table — they're defined in stage_actions.
-- The deal.stage field is free-text, and the UI reads distinct stages from stage_actions.

-- Default stage actions
INSERT INTO stage_actions (stage, action_type, config, sort_order) VALUES
  ('lead', 'create_tasks', '{"tasks":[{"description":"Research prospect","due_offset_days":0},{"description":"Send first outreach","due_offset_days":1}]}', 0),
  ('outreach', 'start_cadence', '{"reminders":[{"day":3,"template":"cold_email_2"},{"day":7,"template":"cold_email_3"},{"day":14,"template":"cold_email_4"}],"stale_after_days":21}', 0),
  ('discovery_call', 'trigger_skill', '{"skill":"tkbs-initial-analysis","prompt_template":"Build a presentation for {company}, {contact}, located in {location}, {industry} business, {type}. Additional context: {source_detail}, {notes}"}', 0),
  ('discovery_call', 'create_tasks', '{"tasks":[{"description":"Prep for discovery call","due_offset_days":-1},{"description":"Log call notes","due_offset_days":0}]}', 1),
  ('proposal', 'trigger_skill', '{"skill":"tkbs-proposals","prompt_template":"Build a proposal for {company}, {contact}. Package: {package_type}. Services: {services_discussed}. Pricing notes: {pricing_notes}. Call notes: {call_notes}"}', 0),
  ('proposal', 'create_tasks', '{"tasks":[{"description":"Send proposal","due_offset_days":1}]}', 1),
  ('follow_up', 'start_cadence', '{"reminders":[{"day":1,"template":"followup_thankyou"},{"day":4,"template":"followup_checkin"},{"day":10,"template":"followup_valueadd"},{"day":21,"template":"followup_breakup"}]}', 0),
  ('closed_won', 'create_tasks', '{"tasks":[{"description":"Send welcome email","due_offset_days":0},{"description":"Schedule kickoff meeting","due_offset_days":1},{"description":"Send onboarding checklist","due_offset_days":2}]}', 0),
  ('closed_lost', 'record', '{"require_lost_reason":true,"cancel_pending_tasks":true}', 0);
```

- [ ] **Step 3: Commit**

```bash
git add server/db/schema.sql server/db/seed.sql
git commit -m "feat: add database schema and seed data"
```

---

### Task 3: Database Connection Module

**Files:**
- Create: `server/db/index.js`

- [ ] **Step 1: Write the database connection module**

```js
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

let db;

function getDb() {
  if (db) return db;

  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'tkbs-crm.db');
  db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  return db;
}

function initDb() {
  const database = getDb();

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  database.exec(schema);

  return database;
}

function seedDb() {
  const database = getDb();

  const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf-8');
  database.exec(seed);

  return database;
}

function closeDb() {
  if (db) {
    db.close();
    db = undefined;
  }
}

module.exports = { getDb, initDb, seedDb, closeDb };
```

- [ ] **Step 2: Commit**

```bash
git add server/db/index.js
git commit -m "feat: add database connection module"
```

---

### Task 4: Express App Setup

**Files:**
- Create: `server/index.js`

- [ ] **Step 1: Write the Express app factory and server entry**

```js
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db');

function createApp(testDb) {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());

  const SQLiteStore = require('connect-sqlite3')(session);

  app.use(session({
    store: testDb ? undefined : new SQLiteStore({ db: 'sessions.db', dir: path.join(__dirname, '..') }),
    secret: process.env.SESSION_SECRET || 'tkbs-dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }));

  // Make db accessible to routes
  if (testDb) {
    app.use((req, res, next) => { req.db = testDb; next(); });
  } else {
    const db = initDb();
    app.use((req, res, next) => { req.db = db; next(); });
  }

  // Routes
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/companies', require('./routes/companies'));
  app.use('/api/contacts', require('./routes/contacts'));
  app.use('/api/deals', require('./routes/deals'));
  app.use('/api/activities', require('./routes/activities'));

  // Serve client build in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
    });
  }

  return app;
}

// Start server if run directly
if (require.main === module) {
  const app = createApp();
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`TKBS CRM server running on http://localhost:${PORT}`);
  });
}

module.exports = { createApp };
```

- [ ] **Step 2: Create placeholder route files so the app can start**

Create `server/routes/auth.js`:
```js
const router = require('express').Router();
module.exports = router;
```

Create `server/routes/companies.js`:
```js
const router = require('express').Router();
module.exports = router;
```

Create `server/routes/contacts.js`:
```js
const router = require('express').Router();
module.exports = router;
```

Create `server/routes/deals.js`:
```js
const router = require('express').Router();
module.exports = router;
```

Create `server/routes/activities.js`:
```js
const router = require('express').Router();
module.exports = router;
```

- [ ] **Step 3: Verify server starts**

```bash
node server/index.js
```

Expected: `TKBS CRM server running on http://localhost:3001` — then Ctrl+C to stop.

- [ ] **Step 4: Commit**

```bash
git add server/index.js server/routes/
git commit -m "feat: add Express app factory with session and route mounting"
```

---

### Task 5: Auth Middleware

**Files:**
- Create: `server/middleware/auth.js`

- [ ] **Step 1: Write auth middleware**

```js
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const user = req.db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(req.session.userId);
  if (!user) {
    req.session.destroy();
    return res.status(401).json({ error: 'User not found' });
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

module.exports = { requireAuth, requireAdmin };
```

- [ ] **Step 2: Commit**

```bash
git add server/middleware/auth.js
git commit -m "feat: add requireAuth and requireAdmin middleware"
```

---

### Task 6: Auth Routes + Tests

**Files:**
- Modify: `server/routes/auth.js`
- Create: `server/__tests__/auth.test.js`

- [ ] **Step 1: Write the auth test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest server/__tests__/auth.test.js --verbose
```

Expected: FAIL — routes return 404 since auth routes are empty.

- [ ] **Step 3: Implement auth routes**

Replace `server/routes/auth.js`:

```js
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { requireAuth } = require('../middleware/auth');

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const user = req.db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.userId = user.id;
  const { password_hash, ...safeUser } = user;
  res.json({ user: safeUser });
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ ok: true });
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest server/__tests__/auth.test.js --verbose
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/auth.js server/__tests__/auth.test.js
git commit -m "feat: add auth routes with login, logout, and session check"
```

---

### Task 7: Company Routes + Tests

**Files:**
- Modify: `server/routes/companies.js`
- Create: `server/__tests__/companies.test.js`

- [ ] **Step 1: Write the companies test**

```js
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

describe('POST /api/companies', () => {
  test('creates a company', async () => {
    const res = await agent.post('/api/companies').send({
      name: 'Acme Manufacturing',
      location: 'Detroit, MI',
      industry: 'Manufacturing',
      type: 'B2B',
    });
    expect(res.status).toBe(201);
    expect(res.body.company.name).toBe('Acme Manufacturing');
    expect(res.body.company.id).toBeDefined();
  });

  test('returns 400 without name', async () => {
    const res = await agent.post('/api/companies').send({ location: 'Detroit' });
    expect(res.status).toBe(400);
  });

  test('returns 401 when not logged in', async () => {
    const res = await request(app).post('/api/companies').send({ name: 'Test' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/companies', () => {
  test('lists companies', async () => {
    await agent.post('/api/companies').send({ name: 'Company A' });
    await agent.post('/api/companies').send({ name: 'Company B' });
    const res = await agent.get('/api/companies');
    expect(res.status).toBe(200);
    expect(res.body.companies).toHaveLength(2);
  });
});

describe('GET /api/companies/:id', () => {
  test('returns a single company', async () => {
    const create = await agent.post('/api/companies').send({ name: 'Acme', industry: 'Tech' });
    const res = await agent.get(`/api/companies/${create.body.company.id}`);
    expect(res.status).toBe(200);
    expect(res.body.company.name).toBe('Acme');
  });

  test('returns 404 for missing company', async () => {
    const res = await agent.get('/api/companies/999');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/companies/:id', () => {
  test('updates a company', async () => {
    const create = await agent.post('/api/companies').send({ name: 'Old Name' });
    const res = await agent.patch(`/api/companies/${create.body.company.id}`).send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.company.name).toBe('New Name');
  });
});

describe('DELETE /api/companies/:id', () => {
  test('deletes a company', async () => {
    const create = await agent.post('/api/companies').send({ name: 'ToDelete' });
    const res = await agent.delete(`/api/companies/${create.body.company.id}`);
    expect(res.status).toBe(200);
    const get = await agent.get(`/api/companies/${create.body.company.id}`);
    expect(get.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest server/__tests__/companies.test.js --verbose
```

Expected: FAIL — company routes not implemented.

- [ ] **Step 3: Implement company routes**

Replace `server/routes/companies.js`:

```js
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', (req, res) => {
  const companies = req.db.prepare('SELECT * FROM companies ORDER BY created_at DESC').all();
  res.json({ companies });
});

router.get('/:id', (req, res) => {
  const company = req.db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!company) return res.status(404).json({ error: 'Company not found' });
  res.json({ company });
});

router.post('/', (req, res) => {
  const { name, location, industry, type, website, social_links, employee_count, revenue_estimate, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const result = req.db.prepare(
    `INSERT INTO companies (name, location, industry, type, website, social_links, employee_count, revenue_estimate, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(name, location || null, industry || null, type || null, website || null,
    JSON.stringify(social_links || {}), employee_count || null, revenue_estimate || null, notes || null);

  const company = req.db.prepare('SELECT * FROM companies WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ company });
});

router.patch('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Company not found' });

  const fields = ['name', 'location', 'industry', 'type', 'website', 'employee_count', 'revenue_estimate', 'notes'];
  const updates = [];
  const values = [];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[field]);
    }
  }

  if (req.body.social_links !== undefined) {
    updates.push('social_links = ?');
    values.push(JSON.stringify(req.body.social_links));
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(req.params.id);
    req.db.prepare(`UPDATE companies SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const company = req.db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  res.json({ company });
});

router.delete('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Company not found' });

  req.db.prepare('DELETE FROM companies WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest server/__tests__/companies.test.js --verbose
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/companies.js server/__tests__/companies.test.js
git commit -m "feat: add company CRUD routes with tests"
```

---

### Task 8: Contact Routes + Tests

**Files:**
- Modify: `server/routes/contacts.js`
- Create: `server/__tests__/contacts.test.js`

- [ ] **Step 1: Write the contacts test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest server/__tests__/contacts.test.js --verbose
```

Expected: FAIL — contact routes not implemented.

- [ ] **Step 3: Implement contact routes**

Replace `server/routes/contacts.js`:

```js
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', (req, res) => {
  let query = 'SELECT * FROM contacts';
  const params = [];

  if (req.query.company_id) {
    query += ' WHERE company_id = ?';
    params.push(req.query.company_id);
  }

  query += ' ORDER BY created_at DESC';
  const contacts = req.db.prepare(query).all(...params);
  res.json({ contacts });
});

router.get('/:id', (req, res) => {
  const contact = req.db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  res.json({ contact });
});

router.post('/', (req, res) => {
  const { name, email, phone, role, preferred_contact, notes, company_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const result = req.db.prepare(
    `INSERT INTO contacts (name, email, phone, role, preferred_contact, notes, company_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(name, email || null, phone || null, role || null, preferred_contact || null, notes || null, company_id || null);

  const contact = req.db.prepare('SELECT * FROM contacts WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ contact });
});

router.patch('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Contact not found' });

  const fields = ['name', 'email', 'phone', 'role', 'preferred_contact', 'notes', 'company_id'];
  const updates = [];
  const values = [];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[field]);
    }
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(req.params.id);
    req.db.prepare(`UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const contact = req.db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  res.json({ contact });
});

router.delete('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Contact not found' });

  req.db.prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest server/__tests__/contacts.test.js --verbose
```

Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/contacts.js server/__tests__/contacts.test.js
git commit -m "feat: add contact CRUD routes with tests"
```

---

### Task 9: Deal Routes + Tests

**Files:**
- Modify: `server/routes/deals.js`
- Create: `server/__tests__/deals.test.js`

- [ ] **Step 1: Write the deals test**

```js
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
    'Test User', 'test@test.com', hash, 'admin'
  );
  db.prepare('INSERT INTO companies (name, location, industry, type) VALUES (?, ?, ?, ?)').run(
    'Acme Mfg', 'Detroit, MI', 'Manufacturing', 'B2B'
  );
  db.prepare('INSERT INTO contacts (name, email, company_id) VALUES (?, ?, ?)').run(
    'Sarah Chen', 'sarah@acme.com', 1
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

describe('POST /api/deals', () => {
  test('creates a deal', async () => {
    const res = await agent.post('/api/deals').send({
      contact_id: 1,
      company_id: 1,
      source: 'referral',
      source_detail: 'Referral from Dave',
      estimated_value: 2500,
      package_type: 'boost',
    });
    expect(res.status).toBe(201);
    expect(res.body.deal.stage).toBe('lead');
    expect(res.body.deal.source).toBe('referral');
    expect(res.body.deal.owner_id).toBe(1); // auto-assigned to current user
  });

  test('returns 400 without contact_id or company_id', async () => {
    const res = await agent.post('/api/deals').send({ source: 'cold' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/deals', () => {
  test('lists deals', async () => {
    await agent.post('/api/deals').send({ company_id: 1, contact_id: 1 });
    await agent.post('/api/deals').send({ company_id: 1, contact_id: 1 });
    const res = await agent.get('/api/deals');
    expect(res.body.deals).toHaveLength(2);
  });

  test('filters by stage', async () => {
    await agent.post('/api/deals').send({ company_id: 1, contact_id: 1 });
    const res = await agent.get('/api/deals?stage=lead');
    expect(res.body.deals).toHaveLength(1);
    const res2 = await agent.get('/api/deals?stage=outreach');
    expect(res2.body.deals).toHaveLength(0);
  });
});

describe('GET /api/deals/:id', () => {
  test('returns deal with company and contact', async () => {
    const create = await agent.post('/api/deals').send({ company_id: 1, contact_id: 1 });
    const res = await agent.get(`/api/deals/${create.body.deal.id}`);
    expect(res.status).toBe(200);
    expect(res.body.deal.id).toBeDefined();
    expect(res.body.company.name).toBe('Acme Mfg');
    expect(res.body.contact.name).toBe('Sarah Chen');
  });

  test('returns 404 for missing deal', async () => {
    const res = await agent.get('/api/deals/999');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/deals/:id', () => {
  test('updates deal fields', async () => {
    const create = await agent.post('/api/deals').send({ company_id: 1, contact_id: 1 });
    const res = await agent.patch(`/api/deals/${create.body.deal.id}`).send({
      estimated_value: 5000,
      package_type: 'launch',
    });
    expect(res.status).toBe(200);
    expect(res.body.deal.estimated_value).toBe(5000);
    expect(res.body.deal.package_type).toBe('launch');
  });

  test('updates stage and records stage_entered_at', async () => {
    const create = await agent.post('/api/deals').send({ company_id: 1, contact_id: 1 });
    const res = await agent.patch(`/api/deals/${create.body.deal.id}`).send({ stage: 'outreach' });
    expect(res.body.deal.stage).toBe('outreach');
    expect(res.body.deal.stage_entered_at).not.toBe(create.body.deal.stage_entered_at);
  });

  test('logs stage change as activity', async () => {
    const create = await agent.post('/api/deals').send({ company_id: 1, contact_id: 1 });
    await agent.patch(`/api/deals/${create.body.deal.id}`).send({ stage: 'outreach' });
    const activities = await agent.get(`/api/activities?deal_id=${create.body.deal.id}`);
    const stageChange = activities.body.activities.find(a => a.type === 'stage_change');
    expect(stageChange).toBeDefined();
    expect(stageChange.content).toContain('outreach');
  });

  test('sets closed_at when moving to closed_won', async () => {
    const create = await agent.post('/api/deals').send({ company_id: 1, contact_id: 1 });
    const res = await agent.patch(`/api/deals/${create.body.deal.id}`).send({ stage: 'closed_won' });
    expect(res.body.deal.closed_at).toBeDefined();
  });

  test('requires lost_reason when moving to closed_lost', async () => {
    const create = await agent.post('/api/deals').send({ company_id: 1, contact_id: 1 });
    const res = await agent.patch(`/api/deals/${create.body.deal.id}`).send({ stage: 'closed_lost' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('lost_reason');
  });

  test('accepts closed_lost with lost_reason', async () => {
    const create = await agent.post('/api/deals').send({ company_id: 1, contact_id: 1 });
    const res = await agent.patch(`/api/deals/${create.body.deal.id}`).send({
      stage: 'closed_lost',
      lost_reason: 'price',
    });
    expect(res.status).toBe(200);
    expect(res.body.deal.stage).toBe('closed_lost');
    expect(res.body.deal.lost_reason).toBe('price');
  });
});

describe('DELETE /api/deals/:id', () => {
  test('soft-deletes a deal by moving to closed_lost', async () => {
    const create = await agent.post('/api/deals').send({ company_id: 1, contact_id: 1 });
    const res = await agent.delete(`/api/deals/${create.body.deal.id}`);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest server/__tests__/deals.test.js --verbose
```

Expected: FAIL — deal routes not implemented.

- [ ] **Step 3: Implement deal routes**

Replace `server/routes/deals.js`:

```js
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', (req, res) => {
  let query = 'SELECT d.*, c.name as company_name, ct.name as contact_name FROM deals d LEFT JOIN companies c ON d.company_id = c.id LEFT JOIN contacts ct ON d.contact_id = ct.id';
  const conditions = [];
  const params = [];

  if (req.query.stage) {
    conditions.push('d.stage = ?');
    params.push(req.query.stage);
  }
  if (req.query.owner_id) {
    conditions.push('d.owner_id = ?');
    params.push(req.query.owner_id);
  }
  if (req.query.source) {
    conditions.push('d.source = ?');
    params.push(req.query.source);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY d.created_at DESC';
  const deals = req.db.prepare(query).all(...params);
  res.json({ deals });
});

router.get('/:id', (req, res) => {
  const deal = req.db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
  if (!deal) return res.status(404).json({ error: 'Deal not found' });

  const company = deal.company_id
    ? req.db.prepare('SELECT * FROM companies WHERE id = ?').get(deal.company_id)
    : null;
  const contact = deal.contact_id
    ? req.db.prepare('SELECT * FROM contacts WHERE id = ?').get(deal.contact_id)
    : null;
  const tasks = req.db.prepare('SELECT * FROM tasks WHERE deal_id = ? ORDER BY due_at ASC').all(deal.id);
  const documents = req.db.prepare('SELECT * FROM documents WHERE deal_id = ? ORDER BY created_at DESC').all(deal.id);

  res.json({ deal, company, contact, tasks, documents });
});

router.post('/', (req, res) => {
  const { contact_id, company_id, source, source_detail, estimated_value, package_type, services_discussed } = req.body;
  if (!contact_id && !company_id) {
    return res.status(400).json({ error: 'contact_id or company_id is required' });
  }

  const result = req.db.prepare(
    `INSERT INTO deals (contact_id, company_id, stage, source, source_detail, estimated_value, package_type, services_discussed, owner_id)
     VALUES (?, ?, 'lead', ?, ?, ?, ?, ?, ?)`
  ).run(
    contact_id || null, company_id || null, source || null, source_detail || null,
    estimated_value || 0, package_type || null, JSON.stringify(services_discussed || []),
    req.user.id
  );

  const deal = req.db.prepare('SELECT * FROM deals WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ deal });
});

router.patch('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Deal not found' });

  const isStageChange = req.body.stage && req.body.stage !== existing.stage;

  // Require lost_reason for closed_lost
  if (isStageChange && req.body.stage === 'closed_lost' && !req.body.lost_reason) {
    return res.status(400).json({ error: 'lost_reason is required when closing a deal as lost' });
  }

  const fields = [
    'contact_id', 'company_id', 'stage', 'source', 'source_detail',
    'estimated_value', 'package_type', 'pricing_notes', 'call_notes',
    'research_findings', 'objections_noted', 'lost_reason', 'owner_id',
  ];
  const updates = [];
  const values = [];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[field]);
    }
  }

  if (req.body.services_discussed !== undefined) {
    updates.push('services_discussed = ?');
    values.push(JSON.stringify(req.body.services_discussed));
  }

  if (isStageChange) {
    updates.push("stage_entered_at = datetime('now')");

    if (req.body.stage === 'closed_won' || req.body.stage === 'closed_lost') {
      updates.push("closed_at = datetime('now')");
    }
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(req.params.id);
    req.db.prepare(`UPDATE deals SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  // Log stage change as activity
  if (isStageChange) {
    req.db.prepare(
      `INSERT INTO activities (deal_id, contact_id, type, content, created_by)
       VALUES (?, ?, 'stage_change', ?, ?)`
    ).run(
      req.params.id,
      existing.contact_id,
      `Stage changed from ${existing.stage} to ${req.body.stage}`,
      req.user.id
    );
  }

  const deal = req.db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
  res.json({ deal });
});

router.delete('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Deal not found' });

  req.db.prepare('DELETE FROM deals WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest server/__tests__/deals.test.js --verbose
```

Expected: All 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/deals.js server/__tests__/deals.test.js
git commit -m "feat: add deal CRUD routes with stage change logic and tests"
```

---

### Task 10: Activity Routes + Tests

**Files:**
- Modify: `server/routes/activities.js`
- Create: `server/__tests__/activities.test.js`

- [ ] **Step 1: Write the activities test**

```js
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
    'Test User', 'test@test.com', hash, 'admin'
  );
  db.prepare('INSERT INTO companies (name) VALUES (?)').run('Acme');
  db.prepare('INSERT INTO contacts (name, company_id) VALUES (?, ?)').run('Sarah', 1);
  db.prepare('INSERT INTO deals (company_id, contact_id, stage, owner_id) VALUES (?, ?, ?, ?)').run(1, 1, 'lead', 1);
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

describe('POST /api/activities', () => {
  test('logs an activity on a deal', async () => {
    const res = await agent.post('/api/activities').send({
      deal_id: 1,
      type: 'email',
      content: 'Sent cold email #1',
    });
    expect(res.status).toBe(201);
    expect(res.body.activity.type).toBe('email');
    expect(res.body.activity.created_by).toBe(1);
  });

  test('returns 400 without deal_id', async () => {
    const res = await agent.post('/api/activities').send({ type: 'note', content: 'test' });
    expect(res.status).toBe(400);
  });

  test('returns 400 without type', async () => {
    const res = await agent.post('/api/activities').send({ deal_id: 1, content: 'test' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/activities', () => {
  test('lists activities for a deal', async () => {
    await agent.post('/api/activities').send({ deal_id: 1, type: 'email', content: 'Email 1' });
    await agent.post('/api/activities').send({ deal_id: 1, type: 'call', content: 'Call 1' });
    const res = await agent.get('/api/activities?deal_id=1');
    expect(res.status).toBe(200);
    expect(res.body.activities).toHaveLength(2);
  });

  test('returns empty array for deal with no activities', async () => {
    const res = await agent.get('/api/activities?deal_id=1');
    expect(res.body.activities).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest server/__tests__/activities.test.js --verbose
```

Expected: FAIL — activity routes not implemented.

- [ ] **Step 3: Implement activity routes**

Replace `server/routes/activities.js`:

```js
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', (req, res) => {
  const { deal_id } = req.query;
  let query = 'SELECT * FROM activities';
  const params = [];

  if (deal_id) {
    query += ' WHERE deal_id = ?';
    params.push(deal_id);
  }

  query += ' ORDER BY created_at DESC';
  const activities = req.db.prepare(query).all(...params);
  res.json({ activities });
});

router.post('/', (req, res) => {
  const { deal_id, contact_id, type, content, metadata } = req.body;
  if (!deal_id) return res.status(400).json({ error: 'deal_id is required' });
  if (!type) return res.status(400).json({ error: 'type is required' });

  const deal = req.db.prepare('SELECT * FROM deals WHERE id = ?').get(deal_id);
  if (!deal) return res.status(404).json({ error: 'Deal not found' });

  const result = req.db.prepare(
    `INSERT INTO activities (deal_id, contact_id, type, content, metadata, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    deal_id,
    contact_id || deal.contact_id || null,
    type,
    content || null,
    JSON.stringify(metadata || {}),
    req.user.id
  );

  const activity = req.db.prepare('SELECT * FROM activities WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ activity });
});

module.exports = router;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest server/__tests__/activities.test.js --verbose
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
npx jest --verbose
```

Expected: All tests across all files PASS.

- [ ] **Step 6: Commit**

```bash
git add server/routes/activities.js server/__tests__/activities.test.js
git commit -m "feat: add activity logging routes with tests"
```

---

### Task 11: React App Shell + Vite Config

**Files:**
- Create: `client/index.html`
- Create: `client/vite.config.js`
- Create: `client/src/main.jsx`
- Create: `client/src/App.jsx`
- Create: `client/src/lib/api.js`

- [ ] **Step 1: Create client/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TKBS CRM</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #F7F8FA; color: #1B2838; }
    a { color: inherit; text-decoration: none; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
```

- [ ] **Step 2: Create client/vite.config.js**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 3: Create client/src/lib/api.js**

```js
const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }

  return data;
}

export const api = {
  // Auth
  login: (body) => request('/auth/login', { method: 'POST', body }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),

  // Companies
  getCompanies: () => request('/companies'),
  getCompany: (id) => request(`/companies/${id}`),
  createCompany: (body) => request('/companies', { method: 'POST', body }),
  updateCompany: (id, body) => request(`/companies/${id}`, { method: 'PATCH', body }),
  deleteCompany: (id) => request(`/companies/${id}`, { method: 'DELETE' }),

  // Contacts
  getContacts: (params) => request(`/contacts${params ? '?' + new URLSearchParams(params) : ''}`),
  getContact: (id) => request(`/contacts/${id}`),
  createContact: (body) => request('/contacts', { method: 'POST', body }),
  updateContact: (id, body) => request(`/contacts/${id}`, { method: 'PATCH', body }),
  deleteContact: (id) => request(`/contacts/${id}`, { method: 'DELETE' }),

  // Deals
  getDeals: (params) => request(`/deals${params ? '?' + new URLSearchParams(params) : ''}`),
  getDeal: (id) => request(`/deals/${id}`),
  createDeal: (body) => request('/deals', { method: 'POST', body }),
  updateDeal: (id, body) => request(`/deals/${id}`, { method: 'PATCH', body }),
  deleteDeal: (id) => request(`/deals/${id}`, { method: 'DELETE' }),

  // Activities
  getActivities: (params) => request(`/activities${params ? '?' + new URLSearchParams(params) : ''}`),
  createActivity: (body) => request('/activities', { method: 'POST', body }),
};
```

- [ ] **Step 4: Create client/src/main.jsx**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 5: Create client/src/App.jsx**

```jsx
import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { api } from './lib/api';
import Layout from './components/Layout';
import Login from './pages/Login';
import Pipeline from './pages/Pipeline';
import DealDetail from './pages/DealDetail';
import Contacts from './pages/Contacts';
import Companies from './pages/Companies';

export const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  return children;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.me()
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const data = await api.login({ email, password });
    setUser(data.user);
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Pipeline />} />
            <Route path="deals/:id" element={<DealDetail />} />
            <Route path="contacts" element={<Contacts />} />
            <Route path="companies" element={<Companies />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add client/
git commit -m "feat: add React app shell with routing, auth context, and API client"
```

---

### Task 12: Layout Component

**Files:**
- Create: `client/src/components/Layout.jsx`

- [ ] **Step 1: Create the Layout with sidebar navigation**

```jsx
import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../App';

const navItems = [
  { to: '/', label: 'Pipeline', icon: '◫' },
  { to: '/contacts', label: 'Contacts', icon: '☻' },
  { to: '/companies', label: 'Companies', icon: '⌂' },
];

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <nav style={{
        width: 220,
        background: '#1B2838',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 0',
        flexShrink: 0,
      }}>
        <div style={{ padding: '0 20px 24px', borderBottom: '1px solid #2A3A4E' }}>
          <span style={{ fontWeight: 'bold', fontSize: 18 }}>
            <span style={{ color: '#fff' }}>TURN</span>
            <span style={{ color: '#00D4AA' }}>KEY</span>
          </span>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>CRM</div>
        </div>

        <div style={{ flex: 1, padding: '12px 0' }}>
          {navItems.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 20px',
                color: isActive ? '#00D4AA' : '#94a3b8',
                background: isActive ? '#2A3A4E' : 'transparent',
                borderLeft: isActive ? '3px solid #00D4AA' : '3px solid transparent',
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
              })}
            >
              <span style={{ fontSize: 16 }}>{icon}</span>
              {label}
            </NavLink>
          ))}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid #2A3A4E' }}>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>{user?.name}</div>
          <button
            onClick={logout}
            style={{
              background: 'none', border: 'none', color: '#64748B',
              fontSize: 12, cursor: 'pointer', padding: '4px 0', marginTop: 4,
            }}
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* Main content */}
      <main style={{ flex: 1, padding: 24, overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/Layout.jsx
git commit -m "feat: add Layout component with TKBS-branded sidebar navigation"
```

---

### Task 13: Login Page

**Files:**
- Create: `client/src/pages/Login.jsx`

- [ ] **Step 1: Create the Login page**

```jsx
import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../App';

export default function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#1B2838',
    }}>
      <form onSubmit={handleSubmit} style={{
        background: '#fff', borderRadius: 8, padding: 40, width: 360,
        boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <span style={{ fontWeight: 'bold', fontSize: 24 }}>
            <span style={{ color: '#1B2838' }}>TURN</span>
            <span style={{ color: '#00D4AA' }}>KEY</span>
          </span>
          <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>Client Acquisition CRM</div>
        </div>

        {error && (
          <div style={{
            background: '#FFF3E0', color: '#E6A817', padding: '8px 12px',
            borderRadius: 4, fontSize: 13, marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Email</label>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            required autoFocus
            style={{
              width: '100%', padding: '10px 12px', border: '1px solid #E2E6EB',
              borderRadius: 4, fontSize: 14, outline: 'none',
            }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Password</label>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              width: '100%', padding: '10px 12px', border: '1px solid #E2E6EB',
              borderRadius: 4, fontSize: 14, outline: 'none',
            }}
          />
        </div>

        <button
          type="submit" disabled={loading}
          style={{
            width: '100%', padding: '10px 0', background: '#00D4AA', color: '#1B2838',
            border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/Login.jsx
git commit -m "feat: add Login page with TKBS branding"
```

---

### Task 14: Pipeline Board (Kanban)

**Files:**
- Create: `client/src/pages/Pipeline.jsx`
- Create: `client/src/components/DealCard.jsx`
- Create: `client/src/components/Modal.jsx`

- [ ] **Step 1: Create Modal component**

```jsx
import React from 'react';

export default function Modal({ open, onClose, title, children }) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 8, padding: 24, width: 480,
          maxHeight: '80vh', overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748B' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create DealCard component**

```jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function DealCard({ deal, provided }) {
  const navigate = useNavigate();
  const daysInStage = Math.floor((Date.now() - new Date(deal.stage_entered_at).getTime()) / 86400000);
  const isStale = daysInStage > 21;

  return (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      {...provided.dragHandleProps}
      onClick={() => navigate(`/deals/${deal.id}`)}
      style={{
        background: '#fff',
        border: `1px solid ${isStale ? '#E6A817' : '#E2E6EB'}`,
        borderRadius: 6,
        padding: 12,
        marginBottom: 8,
        cursor: 'pointer',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        ...provided.draggableProps.style,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
        {deal.company_name || 'No Company'}
      </div>
      <div style={{ fontSize: 12, color: '#64748B', marginBottom: 6 }}>
        {deal.contact_name || 'No Contact'}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontSize: 11, color: '#fff', background: '#00D4AA', borderRadius: 10,
          padding: '2px 8px', fontWeight: 600,
        }}>
          {deal.estimated_value ? `$${Number(deal.estimated_value).toLocaleString()}/mo` : '—'}
        </span>
        <span style={{
          fontSize: 11,
          color: isStale ? '#E6A817' : '#64748B',
          fontWeight: isStale ? 600 : 400,
        }}>
          {daysInStage}d
        </span>
      </div>
      {deal.source && (
        <div style={{
          fontSize: 10, color: '#64748B', marginTop: 6,
          background: '#F7F8FA', borderRadius: 3, padding: '2px 6px', display: 'inline-block',
        }}>
          {deal.source}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create Pipeline page with drag-and-drop**

```jsx
import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { api } from '../lib/api';
import DealCard from '../components/DealCard';
import Modal from '../components/Modal';

const STAGES = [
  { id: 'lead', label: 'Lead' },
  { id: 'outreach', label: 'Outreach' },
  { id: 'discovery_call', label: 'Discovery Call' },
  { id: 'proposal', label: 'Proposal' },
  { id: 'follow_up', label: 'Follow-Up' },
  { id: 'closed_won', label: 'Closed Won' },
];

export default function Pipeline() {
  const [deals, setDeals] = useState([]);
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [newDeal, setNewDeal] = useState({ company_name: '', contact_name: '', source: 'referral', estimated_value: '' });
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadDeals = async () => {
    try {
      const data = await api.getDeals();
      setDeals(data.deals);
    } catch (err) {
      console.error('Failed to load deals:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDeals(); }, []);

  const dealsByStage = (stageId) => deals.filter((d) => d.stage === stageId);

  const onDragEnd = async (result) => {
    if (!result.destination) return;
    const dealId = parseInt(result.draggableId);
    const newStage = result.destination.droppableId;
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage === newStage) return;

    if (newStage === 'closed_lost') {
      const reason = prompt('Lost reason (price, timing, competitor, ghosted, other):');
      if (!reason) return;
      await api.updateDeal(dealId, { stage: newStage, lost_reason: reason });
    } else {
      await api.updateDeal(dealId, { stage: newStage });
    }
    loadDeals();
  };

  const handleCreateDeal = async (e) => {
    e.preventDefault();
    try {
      // Create company if needed
      let companyId = null;
      if (newDeal.company_name) {
        const compData = await api.createCompany({ name: newDeal.company_name });
        companyId = compData.company.id;
      }
      // Create contact if needed
      let contactId = null;
      if (newDeal.contact_name) {
        const ctData = await api.createContact({ name: newDeal.contact_name, company_id: companyId });
        contactId = ctData.contact.id;
      }
      // Create deal
      await api.createDeal({
        company_id: companyId,
        contact_id: contactId,
        source: newDeal.source,
        estimated_value: parseFloat(newDeal.estimated_value) || 0,
      });
      setShowNewDeal(false);
      setNewDeal({ company_name: '', contact_name: '', source: 'referral', estimated_value: '' });
      loadDeals();
    } catch (err) {
      alert('Failed to create deal: ' + err.message);
    }
  };

  if (loading) return <div style={{ padding: 40 }}>Loading pipeline...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Pipeline</h1>
        <button
          onClick={() => setShowNewDeal(true)}
          style={{
            background: '#00D4AA', color: '#1B2838', border: 'none', borderRadius: 6,
            padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}
        >
          + New Deal
        </button>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12 }}>
          {STAGES.map((stage) => (
            <Droppable droppableId={stage.id} key={stage.id}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  style={{
                    minWidth: 240, width: 240, background: snapshot.isDraggingOver ? '#E6FAF5' : '#F7F8FA',
                    borderRadius: 8, padding: 12, flexShrink: 0,
                  }}
                >
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: 12, paddingBottom: 8, borderBottom: '2px solid #00D4AA',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1B2838' }}>{stage.label}</span>
                    <span style={{
                      fontSize: 11, color: '#64748B', background: '#E2E6EB',
                      borderRadius: 10, padding: '2px 8px',
                    }}>
                      {dealsByStage(stage.id).length}
                    </span>
                  </div>

                  {dealsByStage(stage.id).map((deal, index) => (
                    <Draggable draggableId={String(deal.id)} index={index} key={deal.id}>
                      {(provided) => <DealCard deal={deal} provided={provided} />}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>

      <Modal open={showNewDeal} onClose={() => setShowNewDeal(false)} title="New Deal">
        <form onSubmit={handleCreateDeal}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Company Name</label>
            <input
              value={newDeal.company_name} onChange={(e) => setNewDeal({ ...newDeal, company_name: e.target.value })}
              required style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Contact Name</label>
            <input
              value={newDeal.contact_name} onChange={(e) => setNewDeal({ ...newDeal, contact_name: e.target.value })}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Source</label>
              <select
                value={newDeal.source} onChange={(e) => setNewDeal({ ...newDeal, source: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }}
              >
                <option value="referral">Referral</option>
                <option value="cold">Cold</option>
                <option value="web">Web</option>
                <option value="content">Content</option>
                <option value="paid_ads">Paid Ads</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Est. Value ($/mo)</label>
              <input
                type="number" value={newDeal.estimated_value}
                onChange={(e) => setNewDeal({ ...newDeal, estimated_value: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }}
              />
            </div>
          </div>
          <button
            type="submit"
            style={{
              width: '100%', padding: '10px 0', background: '#00D4AA', color: '#1B2838',
              border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Create Deal
          </button>
        </form>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/Pipeline.jsx client/src/components/DealCard.jsx client/src/components/Modal.jsx
git commit -m "feat: add Pipeline board with drag-and-drop and new deal modal"
```

---

### Task 15: Deal Detail Page

**Files:**
- Create: `client/src/pages/DealDetail.jsx`

- [ ] **Step 1: Create the deal detail page**

```jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export default function DealDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [deal, setDeal] = useState(null);
  const [company, setCompany] = useState(null);
  const [contact, setContact] = useState(null);
  const [activities, setActivities] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(true);

  const loadDeal = async () => {
    try {
      const data = await api.getDeal(id);
      setDeal(data.deal);
      setCompany(data.company);
      setContact(data.contact);
      setTasks(data.tasks || []);
      const actData = await api.getActivities({ deal_id: id });
      setActivities(actData.activities);
    } catch (err) {
      console.error('Failed to load deal:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDeal(); }, [id]);

  const addNote = async (e) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    await api.createActivity({ deal_id: parseInt(id), type: 'note', content: newNote });
    setNewNote('');
    loadDeal();
  };

  const updateField = async (field, value) => {
    await api.updateDeal(id, { [field]: value });
    loadDeal();
  };

  if (loading) return <div style={{ padding: 40 }}>Loading deal...</div>;
  if (!deal) return <div style={{ padding: 40 }}>Deal not found.</div>;

  const tabs = ['overview', 'activity', 'tasks'];
  const tabStyle = (t) => ({
    padding: '8px 16px', fontSize: 13, fontWeight: activeTab === t ? 600 : 400,
    color: activeTab === t ? '#00D4AA' : '#64748B', background: 'none', border: 'none',
    borderBottom: activeTab === t ? '2px solid #00D4AA' : '2px solid transparent',
    cursor: 'pointer',
  });

  return (
    <div>
      <button onClick={() => navigate('/')} style={{
        background: 'none', border: 'none', color: '#64748B', fontSize: 13,
        cursor: 'pointer', marginBottom: 16,
      }}>
        ← Back to Pipeline
      </button>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{company?.name || 'No Company'}</h1>
          <div style={{ fontSize: 14, color: '#64748B' }}>
            {contact?.name || 'No Contact'} {contact?.email && `· ${contact.email}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{
            background: '#00D4AA', color: '#1B2838', padding: '4px 12px',
            borderRadius: 12, fontSize: 12, fontWeight: 700,
          }}>
            {deal.stage.replace('_', ' ').toUpperCase()}
          </span>
          {deal.package_type && (
            <span style={{
              background: '#E2E6EB', padding: '4px 12px',
              borderRadius: 12, fontSize: 12, color: '#64748B',
            }}>
              {deal.package_type}
            </span>
          )}
          {deal.estimated_value > 0 && (
            <span style={{
              background: '#E2E6EB', padding: '4px 12px',
              borderRadius: 12, fontSize: 12, color: '#64748B',
            }}>
              ${Number(deal.estimated_value).toLocaleString()}/mo
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid #E2E6EB', marginBottom: 20 }}>
        {tabs.map((t) => (
          <button key={t} onClick={() => setActiveTab(t)} style={tabStyle(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#1B2838' }}>Deal Info</h3>
            <div style={{ fontSize: 13, color: '#64748B', lineHeight: 2 }}>
              <div><strong>Source:</strong> {deal.source || '—'} {deal.source_detail && `(${deal.source_detail})`}</div>
              <div><strong>Package:</strong> {deal.package_type || 'Undecided'}</div>
              <div><strong>Value:</strong> ${Number(deal.estimated_value || 0).toLocaleString()}/mo</div>
              <div><strong>Stage since:</strong> {new Date(deal.stage_entered_at).toLocaleDateString()}</div>
              <div><strong>Created:</strong> {new Date(deal.created_at).toLocaleDateString()}</div>
            </div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#1B2838' }}>Company</h3>
            {company ? (
              <div style={{ fontSize: 13, color: '#64748B', lineHeight: 2 }}>
                <div><strong>Name:</strong> {company.name}</div>
                <div><strong>Location:</strong> {company.location || '—'}</div>
                <div><strong>Industry:</strong> {company.industry || '—'}</div>
                <div><strong>Type:</strong> {company.type || '—'}</div>
                <div><strong>Website:</strong> {company.website || '—'}</div>
              </div>
            ) : <div style={{ fontSize: 13, color: '#64748B' }}>No company linked</div>}
          </div>
          <div style={{ gridColumn: '1 / -1', background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: '#1B2838' }}>Call Notes</h3>
            <textarea
              value={deal.call_notes || ''}
              onChange={(e) => updateField('call_notes', e.target.value)}
              placeholder="Add call notes..."
              style={{
                width: '100%', minHeight: 80, padding: 10, border: '1px solid #E2E6EB',
                borderRadius: 4, fontSize: 13, resize: 'vertical', fontFamily: 'inherit',
              }}
            />
          </div>
        </div>
      )}

      {/* Activity Tab */}
      {activeTab === 'activity' && (
        <div>
          <form onSubmit={addNote} style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <input
              value={newNote} onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add a note..."
              style={{
                flex: 1, padding: '8px 12px', border: '1px solid #E2E6EB',
                borderRadius: 4, fontSize: 13,
              }}
            />
            <button type="submit" style={{
              background: '#00D4AA', color: '#1B2838', border: 'none',
              borderRadius: 4, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              Add Note
            </button>
          </form>

          <div>
            {activities.length === 0 && <div style={{ fontSize: 13, color: '#64748B' }}>No activity yet.</div>}
            {activities.map((a) => (
              <div key={a.id} style={{
                padding: '10px 0', borderBottom: '1px solid #F7F8FA',
                display: 'flex', gap: 12, alignItems: 'flex-start',
              }}>
                <span style={{
                  fontSize: 11, color: '#fff', background: '#1B2838',
                  borderRadius: 4, padding: '2px 6px', minWidth: 50, textAlign: 'center',
                }}>
                  {a.type}
                </span>
                <div>
                  <div style={{ fontSize: 13 }}>{a.content || '—'}</div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                    {new Date(a.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tasks Tab */}
      {activeTab === 'tasks' && (
        <div>
          {tasks.length === 0 && <div style={{ fontSize: 13, color: '#64748B' }}>No tasks yet.</div>}
          {tasks.map((t) => (
            <div key={t.id} style={{
              padding: '10px 12px', background: '#fff', border: '1px solid #E2E6EB',
              borderRadius: 6, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>{t.status === 'done' ? '✅' : '⬜'}</span>
                <span style={{ fontSize: 13, textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>
                  {t.description}
                </span>
              </div>
              {t.due_at && (
                <span style={{ fontSize: 11, color: '#64748B' }}>
                  {new Date(t.due_at).toLocaleDateString()}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/DealDetail.jsx
git commit -m "feat: add deal detail page with overview, activity, and tasks tabs"
```

---

### Task 16: Contacts Page

**Files:**
- Create: `client/src/pages/Contacts.jsx`

- [ ] **Step 1: Create the Contacts list page**

```jsx
import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import Modal from '../components/Modal';

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: '' });
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const data = await api.getContacts();
    setContacts(data.contacts);
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editing) {
      await api.updateContact(editing, form);
    } else {
      await api.createContact(form);
    }
    setShowForm(false);
    setForm({ name: '', email: '', phone: '', role: '' });
    setEditing(null);
    load();
  };

  const startEdit = (c) => {
    setForm({ name: c.name, email: c.email || '', phone: c.phone || '', role: c.role || '' });
    setEditing(c.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this contact?')) return;
    await api.deleteContact(id);
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Contacts</h1>
        <button
          onClick={() => { setEditing(null); setForm({ name: '', email: '', phone: '', role: '' }); setShowForm(true); }}
          style={{
            background: '#00D4AA', color: '#1B2838', border: 'none', borderRadius: 6,
            padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}
        >
          + New Contact
        </button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#1B2838', color: '#fff' }}>
              <th style={{ padding: '10px 16px', textAlign: 'left' }}>Name</th>
              <th style={{ padding: '10px 16px', textAlign: 'left' }}>Email</th>
              <th style={{ padding: '10px 16px', textAlign: 'left' }}>Phone</th>
              <th style={{ padding: '10px 16px', textAlign: 'left' }}>Role</th>
              <th style={{ padding: '10px 16px', width: 100 }}></th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#64748B' }}>No contacts yet.</td></tr>
            )}
            {contacts.map((c, i) => (
              <tr key={c.id} style={{ background: i % 2 === 0 ? '#fff' : '#F7F8FA' }}>
                <td style={{ padding: '10px 16px', fontWeight: 600 }}>{c.name}</td>
                <td style={{ padding: '10px 16px', color: '#64748B' }}>{c.email || '—'}</td>
                <td style={{ padding: '10px 16px', color: '#64748B' }}>{c.phone || '—'}</td>
                <td style={{ padding: '10px 16px', color: '#64748B' }}>{c.role || '—'}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                  <button onClick={() => startEdit(c)} style={{ background: 'none', border: 'none', color: '#00D4AA', cursor: 'pointer', fontSize: 12, marginRight: 8 }}>Edit</button>
                  <button onClick={() => handleDelete(c.id)} style={{ background: 'none', border: 'none', color: '#E6A817', cursor: 'pointer', fontSize: 12 }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Contact' : 'New Contact'}>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Phone</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Role</label>
            <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }} />
          </div>
          <button type="submit" style={{
            width: '100%', padding: '10px 0', background: '#00D4AA', color: '#1B2838',
            border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>
            {editing ? 'Save Changes' : 'Create Contact'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/Contacts.jsx
git commit -m "feat: add Contacts list page with create/edit/delete"
```

---

### Task 17: Companies Page

**Files:**
- Create: `client/src/pages/Companies.jsx`

- [ ] **Step 1: Create the Companies list page**

```jsx
import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import Modal from '../components/Modal';

export default function Companies() {
  const [companies, setCompanies] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', location: '', industry: '', type: '', website: '' });
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const data = await api.getCompanies();
    setCompanies(data.companies);
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editing) {
      await api.updateCompany(editing, form);
    } else {
      await api.createCompany(form);
    }
    setShowForm(false);
    setForm({ name: '', location: '', industry: '', type: '', website: '' });
    setEditing(null);
    load();
  };

  const startEdit = (c) => {
    setForm({ name: c.name, location: c.location || '', industry: c.industry || '', type: c.type || '', website: c.website || '' });
    setEditing(c.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this company?')) return;
    await api.deleteCompany(id);
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Companies</h1>
        <button
          onClick={() => { setEditing(null); setForm({ name: '', location: '', industry: '', type: '', website: '' }); setShowForm(true); }}
          style={{
            background: '#00D4AA', color: '#1B2838', border: 'none', borderRadius: 6,
            padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}
        >
          + New Company
        </button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#1B2838', color: '#fff' }}>
              <th style={{ padding: '10px 16px', textAlign: 'left' }}>Name</th>
              <th style={{ padding: '10px 16px', textAlign: 'left' }}>Location</th>
              <th style={{ padding: '10px 16px', textAlign: 'left' }}>Industry</th>
              <th style={{ padding: '10px 16px', textAlign: 'left' }}>Type</th>
              <th style={{ padding: '10px 16px', width: 100 }}></th>
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#64748B' }}>No companies yet.</td></tr>
            )}
            {companies.map((c, i) => (
              <tr key={c.id} style={{ background: i % 2 === 0 ? '#fff' : '#F7F8FA' }}>
                <td style={{ padding: '10px 16px', fontWeight: 600 }}>{c.name}</td>
                <td style={{ padding: '10px 16px', color: '#64748B' }}>{c.location || '—'}</td>
                <td style={{ padding: '10px 16px', color: '#64748B' }}>{c.industry || '—'}</td>
                <td style={{ padding: '10px 16px', color: '#64748B' }}>{c.type || '—'}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                  <button onClick={() => startEdit(c)} style={{ background: 'none', border: 'none', color: '#00D4AA', cursor: 'pointer', fontSize: 12, marginRight: 8 }}>Edit</button>
                  <button onClick={() => handleDelete(c.id)} style={{ background: 'none', border: 'none', color: '#E6A817', cursor: 'pointer', fontSize: 12 }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Company' : 'New Company'}>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }} />
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Location</label>
              <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Industry</label>
              <input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }}>
                <option value="">—</option>
                <option value="B2B">B2B</option>
                <option value="B2C">B2C</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Website</label>
              <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }} />
            </div>
          </div>
          <button type="submit" style={{
            width: '100%', padding: '10px 0', background: '#00D4AA', color: '#1B2838',
            border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>
            {editing ? 'Save Changes' : 'Create Company'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/Companies.jsx
git commit -m "feat: add Companies list page with create/edit/delete"
```

---

### Task 18: Setup Script + End-to-End Verification

**Files:**
- Create: `scripts/setup.sh`
- Modify: `server/db/seed.sql` (generate real bcrypt hash)

- [ ] **Step 1: Create setup script**

```bash
#!/bin/bash
set -e

echo "=== TKBS CRM Setup ==="

# Install server deps
echo "Installing server dependencies..."
npm install

# Install client deps
echo "Installing client dependencies..."
cd client && npm install && cd ..

# Generate admin password hash
echo ""
echo "Setting up admin user..."
HASH=$(node -e "console.log(require('bcryptjs').hashSync('changeme', 10))")

# Init database
echo "Initializing database..."
node -e "
const { initDb, getDb } = require('./server/db');
const bcrypt = require('bcryptjs');
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
  const fs = require('fs');
  const path = require('path');
  const seed = fs.readFileSync(path.join(__dirname, 'server', 'db', 'seed.sql'), 'utf-8');
  // Remove the INSERT for users since we handled it above
  const filtered = seed.split('\n').filter(l => !l.includes('INSERT OR IGNORE INTO users')).join('\n');
  db.exec(filtered);
  console.log('Seed data loaded.');
} else {
  console.log('Seed data already exists.');
}

db.close();
"

echo ""
echo "=== Setup Complete ==="
echo "Run 'npm run dev' to start the dev server"
echo "Login: josh@tkbsmarketing.com / changeme"
```

- [ ] **Step 2: Make setup script executable**

```bash
chmod +x scripts/setup.sh
```

- [ ] **Step 3: Run the setup script**

```bash
bash scripts/setup.sh
```

Expected: Dependencies installed, database initialized, admin user created.

- [ ] **Step 4: Run full test suite**

```bash
npx jest --verbose
```

Expected: All tests pass across all test files.

- [ ] **Step 5: Start dev servers and verify manually**

```bash
npm run dev
```

Open `http://localhost:5173`. Expected:
1. Login page appears with TKBS branding
2. Login with `josh@tkbsmarketing.com` / `changeme`
3. Pipeline board loads with empty columns
4. Click "+ New Deal" → form appears, create a deal
5. Deal card appears in Lead column
6. Drag deal to Outreach column → stage updates
7. Click deal card → deal detail page loads
8. Navigate to Contacts, Companies — list pages work
9. Create contacts and companies from those pages

- [ ] **Step 6: Commit**

```bash
git add scripts/setup.sh
git commit -m "feat: add setup script for database init and admin user creation"
```

- [ ] **Step 7: Final commit for Phase 1**

```bash
git add -A
git commit -m "chore: Phase 1 complete — foundation with auth, pipeline, deals, contacts, companies"
```
