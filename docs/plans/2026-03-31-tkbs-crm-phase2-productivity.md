# TKBS CRM Phase 2: Productivity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add task management, script templates with merge fields, call script stepper viewer, manual follow-up scheduling, and stage-triggered actions (task creation + cadences).

**Architecture:** Builds on Phase 1 foundation. Adds task routes, script template routes, a stage action service that fires when deals change stage, and a cadence scheduler. Frontend adds Task Dashboard page, ScriptViewer component with stepper mode, and FollowUpScheduler component.

**Tech Stack:** Same as Phase 1 + `chrono-node` (natural language date parsing)

**Prerequisite:** Phase 1 complete and working.

**Spec reference:** `docs/specs/2026-03-31-tkbs-crm-design.md`

---

## File Structure (New/Modified)

```
tkbs-crm/
├── server/
│   ├── routes/
│   │   ├── tasks.js              # NEW — CRUD + mark done
│   │   ├── scripts.js            # NEW — template CRUD
│   │   ├── deals.js              # MODIFY — wire up stage actions
│   │   └── settings.js           # NEW — stage action config
│   ├── services/
│   │   ├── stage-actions.js      # NEW — execute actions on stage change
│   │   ├── template-engine.js    # NEW — merge field replacement
│   │   └── task-scheduler.js     # NEW — cadence management, overdue detection
│   └── __tests__/
│       ├── tasks.test.js         # NEW
│       ├── scripts.test.js       # NEW
│       └── stage-actions.test.js # NEW
├── client/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Tasks.jsx         # NEW — task dashboard
│   │   │   ├── Scripts.jsx       # NEW — template editor
│   │   │   ├── Pipeline.jsx      # MODIFY — stage action confirmation
│   │   │   └── DealDetail.jsx    # MODIFY — add scripts tab, follow-up scheduler
│   │   ├── components/
│   │   │   ├── ScriptViewer.jsx  # NEW — template render + stepper for call scripts
│   │   │   ├── FollowUpScheduler.jsx # NEW — natural language + date picker
│   │   │   ├── StageActionConfirm.jsx # NEW — confirmation dialog for stage actions
│   │   │   └── Layout.jsx        # MODIFY — add Tasks + Scripts nav items
```

---

### Task 1: Install chrono-node

- [ ] **Step 1: Install dependency**

```bash
cd tkbs-crm && npm install chrono-node
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add chrono-node for natural language date parsing"
```

---

### Task 2: Task Routes + Tests

**Files:**
- Create: `server/routes/tasks.js`
- Create: `server/__tests__/tasks.test.js`
- Modify: `server/index.js` (add route mounting)

- [ ] **Step 1: Write the tasks test**

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
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Test User', 'test@test.com', hash, 'admin');
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

describe('POST /api/tasks', () => {
  test('creates a task for a deal', async () => {
    const res = await agent.post('/api/tasks').send({
      deal_id: 1,
      description: 'Send follow-up email',
      due_at: '2026-04-02T08:00:00',
    });
    expect(res.status).toBe(201);
    expect(res.body.task.description).toBe('Send follow-up email');
    expect(res.body.task.status).toBe('pending');
  });

  test('creates a task with natural language date', async () => {
    const res = await agent.post('/api/tasks').send({
      deal_id: 1,
      description: 'Call back',
      due_at_natural: 'next Tuesday at 8AM',
    });
    expect(res.status).toBe(201);
    expect(res.body.task.due_at).toBeDefined();
  });

  test('returns 400 without deal_id', async () => {
    const res = await agent.post('/api/tasks').send({ description: 'Test' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/tasks', () => {
  test('lists tasks grouped by status', async () => {
    await agent.post('/api/tasks').send({ deal_id: 1, description: 'Task 1', due_at: '2026-04-01T08:00:00' });
    await agent.post('/api/tasks').send({ deal_id: 1, description: 'Task 2', due_at: '2026-04-02T08:00:00' });
    const res = await agent.get('/api/tasks');
    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(2);
  });

  test('filters by deal_id', async () => {
    await agent.post('/api/tasks').send({ deal_id: 1, description: 'Task 1' });
    const res = await agent.get('/api/tasks?deal_id=1');
    expect(res.body.tasks).toHaveLength(1);
  });

  test('filters by status', async () => {
    await agent.post('/api/tasks').send({ deal_id: 1, description: 'Task 1' });
    const res = await agent.get('/api/tasks?status=pending');
    expect(res.body.tasks).toHaveLength(1);
    const res2 = await agent.get('/api/tasks?status=done');
    expect(res2.body.tasks).toHaveLength(0);
  });
});

describe('PATCH /api/tasks/:id', () => {
  test('marks a task as done', async () => {
    const create = await agent.post('/api/tasks').send({ deal_id: 1, description: 'Task 1' });
    const res = await agent.patch(`/api/tasks/${create.body.task.id}`).send({ status: 'done' });
    expect(res.status).toBe(200);
    expect(res.body.task.status).toBe('done');
    expect(res.body.task.completed_at).toBeDefined();
  });

  test('reschedules a task', async () => {
    const create = await agent.post('/api/tasks').send({ deal_id: 1, description: 'Task 1', due_at: '2026-04-01T08:00:00' });
    const res = await agent.patch(`/api/tasks/${create.body.task.id}`).send({ due_at: '2026-04-05T10:00:00' });
    expect(res.body.task.due_at).toBe('2026-04-05T10:00:00');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest server/__tests__/tasks.test.js --verbose
```

Expected: FAIL — routes not found.

- [ ] **Step 3: Implement task routes**

Create `server/routes/tasks.js`:

```js
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');

let chrono;
try { chrono = require('chrono-node'); } catch (e) { chrono = null; }

router.use(requireAuth);

router.get('/', (req, res) => {
  let query = 'SELECT t.*, d.company_id, c.name as company_name, ct.name as contact_name FROM tasks t LEFT JOIN deals d ON t.deal_id = d.id LEFT JOIN companies c ON d.company_id = c.id LEFT JOIN contacts ct ON d.contact_id = ct.id';
  const conditions = [];
  const params = [];

  if (req.query.deal_id) {
    conditions.push('t.deal_id = ?');
    params.push(req.query.deal_id);
  }
  if (req.query.status) {
    conditions.push('t.status = ?');
    params.push(req.query.status);
  }

  if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY t.due_at ASC NULLS LAST, t.created_at ASC';

  const tasks = req.db.prepare(query).all(...params);
  res.json({ tasks });
});

router.post('/', (req, res) => {
  const { deal_id, description, due_at, due_at_natural, auto_generated, template_key } = req.body;
  if (!deal_id) return res.status(400).json({ error: 'deal_id is required' });
  if (!description) return res.status(400).json({ error: 'description is required' });

  let resolvedDueAt = due_at || null;
  if (!resolvedDueAt && due_at_natural && chrono) {
    const parsed = chrono.parseDate(due_at_natural);
    if (parsed) resolvedDueAt = parsed.toISOString().replace('Z', '').split('.')[0];
  }

  const result = req.db.prepare(
    `INSERT INTO tasks (deal_id, description, due_at, auto_generated, template_key)
     VALUES (?, ?, ?, ?, ?)`
  ).run(deal_id, description, resolvedDueAt, auto_generated ? 1 : 0, template_key || null);

  const task = req.db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ task });
});

router.patch('/:id', (req, res) => {
  const task = req.db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const updates = [];
  const values = [];

  if (req.body.description !== undefined) { updates.push('description = ?'); values.push(req.body.description); }
  if (req.body.due_at !== undefined) { updates.push('due_at = ?'); values.push(req.body.due_at); }
  if (req.body.status !== undefined) {
    updates.push('status = ?');
    values.push(req.body.status);
    if (req.body.status === 'done') {
      updates.push("completed_at = datetime('now')");
    }
  }

  if (updates.length > 0) {
    values.push(req.params.id);
    req.db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const updated = req.db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  res.json({ task: updated });
});

router.delete('/:id', (req, res) => {
  const task = req.db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  req.db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Step 4: Add route mounting to server/index.js**

Add after the activities route in `server/index.js`:

```js
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/scripts', require('./routes/scripts'));
app.use('/api/settings', require('./routes/settings'));
```

Create placeholder `server/routes/scripts.js`:
```js
const router = require('express').Router();
module.exports = router;
```

Create placeholder `server/routes/settings.js`:
```js
const router = require('express').Router();
module.exports = router;
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx jest server/__tests__/tasks.test.js --verbose
```

Expected: All 7 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add server/routes/tasks.js server/routes/scripts.js server/routes/settings.js server/__tests__/tasks.test.js server/index.js
git commit -m "feat: add task CRUD routes with natural language date parsing"
```

---

### Task 3: Script Template Routes + Tests

**Files:**
- Modify: `server/routes/scripts.js`
- Create: `server/__tests__/scripts.test.js`

- [ ] **Step 1: Write the scripts test**

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
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Test User', 'test@test.com', hash, 'admin');
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

describe('POST /api/scripts', () => {
  test('creates a script template', async () => {
    const res = await agent.post('/api/scripts').send({
      stage: 'outreach',
      name: 'Cold Email #1',
      type: 'email',
      content: 'Hey {contact},\n\nI noticed {company} in {location}...',
    });
    expect(res.status).toBe(201);
    expect(res.body.script.name).toBe('Cold Email #1');
    expect(res.body.script.format).toBe('markdown');
  });
});

describe('GET /api/scripts', () => {
  test('lists scripts filtered by stage', async () => {
    await agent.post('/api/scripts').send({ stage: 'outreach', name: 'Email 1', type: 'email', content: 'test' });
    await agent.post('/api/scripts').send({ stage: 'outreach', name: 'Email 2', type: 'email', content: 'test' });
    await agent.post('/api/scripts').send({ stage: 'follow_up', name: 'Follow Up', type: 'email', content: 'test' });

    const res = await agent.get('/api/scripts?stage=outreach');
    expect(res.body.scripts).toHaveLength(2);
  });

  test('returns all scripts without filter', async () => {
    await agent.post('/api/scripts').send({ stage: 'outreach', name: 'E1', type: 'email', content: 'test' });
    await agent.post('/api/scripts').send({ stage: 'follow_up', name: 'E2', type: 'email', content: 'test' });
    const res = await agent.get('/api/scripts');
    expect(res.body.scripts).toHaveLength(2);
  });
});

describe('PATCH /api/scripts/:id', () => {
  test('updates a script', async () => {
    const create = await agent.post('/api/scripts').send({ stage: 'outreach', name: 'Old', type: 'email', content: 'old' });
    const res = await agent.patch(`/api/scripts/${create.body.script.id}`).send({ name: 'New', content: 'updated' });
    expect(res.body.script.name).toBe('New');
    expect(res.body.script.content).toBe('updated');
  });
});

describe('DELETE /api/scripts/:id', () => {
  test('deletes a script', async () => {
    const create = await agent.post('/api/scripts').send({ stage: 'outreach', name: 'Del', type: 'email', content: 'x' });
    const res = await agent.delete(`/api/scripts/${create.body.script.id}`);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest server/__tests__/scripts.test.js --verbose
```

Expected: FAIL.

- [ ] **Step 3: Implement script routes**

Replace `server/routes/scripts.js`:

```js
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', (req, res) => {
  let query = 'SELECT * FROM script_templates';
  const params = [];

  if (req.query.stage) {
    query += ' WHERE stage = ?';
    params.push(req.query.stage);
  }

  query += ' ORDER BY sort_order ASC, created_at ASC';
  const scripts = req.db.prepare(query).all(...params);
  res.json({ scripts });
});

router.get('/:id', (req, res) => {
  const script = req.db.prepare('SELECT * FROM script_templates WHERE id = ?').get(req.params.id);
  if (!script) return res.status(404).json({ error: 'Script not found' });
  res.json({ script });
});

router.post('/', (req, res) => {
  const { stage, name, type, format, content, sort_order } = req.body;
  if (!stage || !name || !type || !content) {
    return res.status(400).json({ error: 'stage, name, type, and content are required' });
  }

  const result = req.db.prepare(
    `INSERT INTO script_templates (stage, name, type, format, content, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(stage, name, type, format || 'markdown', content, sort_order || 0);

  const script = req.db.prepare('SELECT * FROM script_templates WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ script });
});

router.patch('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM script_templates WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Script not found' });

  const fields = ['stage', 'name', 'type', 'format', 'content', 'sort_order'];
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
    req.db.prepare(`UPDATE script_templates SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const script = req.db.prepare('SELECT * FROM script_templates WHERE id = ?').get(req.params.id);
  res.json({ script });
});

router.delete('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM script_templates WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Script not found' });
  req.db.prepare('DELETE FROM script_templates WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest server/__tests__/scripts.test.js --verbose
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/scripts.js server/__tests__/scripts.test.js
git commit -m "feat: add script template CRUD routes with tests"
```

---

### Task 4: Template Engine Service

**Files:**
- Create: `server/services/template-engine.js`

- [ ] **Step 1: Write the template engine**

```js
/**
 * Replaces merge fields in a template string with deal/contact/company data.
 * Merge fields use {field_name} syntax.
 */
function renderTemplate(template, context) {
  return template.replace(/\{(\w+)\}/g, (match, field) => {
    if (context[field] !== undefined && context[field] !== null) {
      return String(context[field]);
    }
    return match; // Leave unresolved fields as-is
  });
}

/**
 * Builds a merge context from deal, contact, and company objects.
 */
function buildContext(deal, contact, company) {
  return {
    company: company?.name || '',
    contact: contact?.name || '',
    email: contact?.email || '',
    phone: contact?.phone || '',
    industry: company?.industry || '',
    location: company?.location || '',
    type: company?.type || '',
    website: company?.website || '',
    source: deal?.source || '',
    source_detail: deal?.source_detail || '',
    referrer: deal?.source_detail || '',
    services: deal?.services_discussed || '[]',
    package_type: deal?.package_type || '',
    estimated_value: deal?.estimated_value || '',
    call_notes: deal?.call_notes || '',
    research_findings: deal?.research_findings || '',
    objections_noted: deal?.objections_noted || '',
    notes: deal?.call_notes || '',
  };
}

module.exports = { renderTemplate, buildContext };
```

- [ ] **Step 2: Commit**

```bash
git add server/services/template-engine.js
git commit -m "feat: add template engine for merge field replacement"
```

---

### Task 5: Stage Actions Service + Tests

**Files:**
- Create: `server/services/stage-actions.js`
- Create: `server/__tests__/stage-actions.test.js`

- [ ] **Step 1: Write the stage actions test**

```js
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { executeStageActions } = require('../services/stage-actions');

function setupTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf-8');
  db.exec(schema);
  return db;
}

function seedTestData(db) {
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Test', 'test@test.com', 'hash', 'admin');
  db.prepare('INSERT INTO companies (name) VALUES (?)').run('Acme');
  db.prepare('INSERT INTO contacts (name, company_id) VALUES (?, ?)').run('Sarah', 1);
  db.prepare('INSERT INTO deals (company_id, contact_id, stage, owner_id) VALUES (?, ?, ?, ?)').run(1, 1, 'lead', 1);

  // Add stage actions for lead stage
  db.prepare(`INSERT INTO stage_actions (stage, action_type, config, sort_order) VALUES (?, ?, ?, ?)`).run(
    'lead', 'create_tasks',
    JSON.stringify({ tasks: [
      { description: 'Research prospect', due_offset_days: 0 },
      { description: 'Send first outreach', due_offset_days: 1 },
    ]}),
    0
  );
}

let db;

beforeEach(() => {
  db = setupTestDb();
  seedTestData(db);
});

afterEach(() => { db.close(); });

describe('executeStageActions', () => {
  test('creates tasks when deal enters a stage with create_tasks action', () => {
    const result = executeStageActions(db, 1, 'lead', 1);
    expect(result.tasksCreated).toBe(2);

    const tasks = db.prepare('SELECT * FROM tasks WHERE deal_id = 1 ORDER BY id').all();
    expect(tasks).toHaveLength(2);
    expect(tasks[0].description).toBe('Research prospect');
    expect(tasks[0].auto_generated).toBe(1);
    expect(tasks[1].description).toBe('Send first outreach');
  });

  test('returns empty result when no actions configured', () => {
    const result = executeStageActions(db, 1, 'nonexistent_stage', 1);
    expect(result.tasksCreated).toBe(0);
    expect(result.actions).toHaveLength(0);
  });

  test('skips disabled actions', () => {
    db.prepare('UPDATE stage_actions SET enabled = 0 WHERE stage = ?').run('lead');
    const result = executeStageActions(db, 1, 'lead', 1);
    expect(result.tasksCreated).toBe(0);
  });
});

describe('closed_lost cancels pending tasks', () => {
  test('cancels all pending tasks when entering closed_lost', () => {
    // Create some pending tasks
    db.prepare('INSERT INTO tasks (deal_id, description, status) VALUES (?, ?, ?)').run(1, 'Task 1', 'pending');
    db.prepare('INSERT INTO tasks (deal_id, description, status) VALUES (?, ?, ?)').run(1, 'Task 2', 'pending');
    db.prepare('INSERT INTO tasks (deal_id, description, status) VALUES (?, ?, ?)').run(1, 'Task 3', 'done');

    // Add closed_lost action
    db.prepare(`INSERT INTO stage_actions (stage, action_type, config, sort_order) VALUES (?, ?, ?, ?)`).run(
      'closed_lost', 'record',
      JSON.stringify({ require_lost_reason: true, cancel_pending_tasks: true }),
      0
    );

    executeStageActions(db, 1, 'closed_lost', 1);

    const pending = db.prepare("SELECT * FROM tasks WHERE deal_id = 1 AND status = 'pending'").all();
    const done = db.prepare("SELECT * FROM tasks WHERE deal_id = 1 AND status = 'done'").all();
    expect(pending).toHaveLength(0);
    expect(done).toHaveLength(1); // The already-done task is untouched
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest server/__tests__/stage-actions.test.js --verbose
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement stage actions service**

Create `server/services/stage-actions.js`:

```js
/**
 * Executes configured actions when a deal enters a new stage.
 * Returns a summary of what was done.
 */
function executeStageActions(db, dealId, newStage, userId) {
  const actions = db.prepare(
    'SELECT * FROM stage_actions WHERE stage = ? AND enabled = 1 ORDER BY sort_order ASC'
  ).all(newStage);

  const result = { actions: [], tasksCreated: 0, skillsTriggered: [] };

  for (const action of actions) {
    const config = JSON.parse(action.config || '{}');

    switch (action.action_type) {
      case 'create_tasks':
        result.tasksCreated += createTasks(db, dealId, config);
        result.actions.push({ type: 'create_tasks', count: config.tasks?.length || 0 });
        break;

      case 'start_cadence':
        result.tasksCreated += startCadence(db, dealId, config);
        result.actions.push({ type: 'start_cadence', reminders: config.reminders?.length || 0 });
        break;

      case 'trigger_skill':
        // Phase 3 will implement CLI invocation. For now, log intent.
        result.skillsTriggered.push(config.skill);
        result.actions.push({ type: 'trigger_skill', skill: config.skill });
        break;

      case 'record':
        handleRecord(db, dealId, config);
        result.actions.push({ type: 'record' });
        break;
    }
  }

  return result;
}

function createTasks(db, dealId, config) {
  const tasks = config.tasks || [];
  const now = new Date();
  let count = 0;

  for (const task of tasks) {
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + (task.due_offset_days || 0));
    const dueAt = dueDate.toISOString().replace('Z', '').split('.')[0];

    db.prepare(
      `INSERT INTO tasks (deal_id, description, due_at, auto_generated, template_key)
       VALUES (?, ?, ?, 1, ?)`
    ).run(dealId, task.description, dueAt, task.template || null);
    count++;
  }

  return count;
}

function startCadence(db, dealId, config) {
  const reminders = config.reminders || [];
  const now = new Date();
  let count = 0;

  for (const reminder of reminders) {
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + (reminder.day || 0));
    const dueAt = dueDate.toISOString().replace('Z', '').split('.')[0];

    const description = reminder.description || `Follow-up reminder (day ${reminder.day})`;

    db.prepare(
      `INSERT INTO tasks (deal_id, description, due_at, auto_generated, template_key)
       VALUES (?, ?, ?, 1, ?)`
    ).run(dealId, description, dueAt, reminder.template || null);
    count++;
  }

  return count;
}

function handleRecord(db, dealId, config) {
  if (config.cancel_pending_tasks) {
    db.prepare("UPDATE tasks SET status = 'done', completed_at = datetime('now') WHERE deal_id = ? AND status = 'pending'").run(dealId);
  }
}

module.exports = { executeStageActions };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest server/__tests__/stage-actions.test.js --verbose
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Wire stage actions into deal routes**

In `server/routes/deals.js`, add after the activity log for stage changes (inside the `if (isStageChange)` block):

```js
const { executeStageActions } = require('../services/stage-actions');
```

Add at the top of the file, then inside the `if (isStageChange)` block after the activity INSERT:

```js
    // Execute stage actions
    const actionResult = executeStageActions(req.db, parseInt(req.params.id), req.body.stage, req.user.id);
```

- [ ] **Step 6: Commit**

```bash
git add server/services/stage-actions.js server/__tests__/stage-actions.test.js server/routes/deals.js
git commit -m "feat: add stage actions service — auto-creates tasks and cadences on stage change"
```

---

### Task 6: Update Layout Navigation

**Files:**
- Modify: `client/src/components/Layout.jsx`
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Add Tasks and Scripts to navigation**

In `client/src/components/Layout.jsx`, update the `navItems` array:

```js
const navItems = [
  { to: '/', label: 'Pipeline', icon: '◫' },
  { to: '/tasks', label: 'Tasks', icon: '☑' },
  { to: '/contacts', label: 'Contacts', icon: '☻' },
  { to: '/companies', label: 'Companies', icon: '⌂' },
  { to: '/scripts', label: 'Scripts', icon: '✎' },
];
```

- [ ] **Step 2: Add routes to App.jsx**

Add imports and routes for Tasks and Scripts pages in `client/src/App.jsx`:

```jsx
import Tasks from './pages/Tasks';
import Scripts from './pages/Scripts';
```

Add inside the layout Route children:

```jsx
<Route path="tasks" element={<Tasks />} />
<Route path="scripts" element={<Scripts />} />
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/Layout.jsx client/src/App.jsx
git commit -m "feat: add Tasks and Scripts to sidebar navigation and routing"
```

---

### Task 7: Tasks Dashboard Page

**Files:**
- Create: `client/src/pages/Tasks.jsx`

- [ ] **Step 1: Create the Tasks page**

```jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = async () => {
    try {
      const data = await api.getTasks();
      setTasks(data.tasks);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const markDone = async (id) => {
    await api.updateTask(id, { status: 'done' });
    load();
  };

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today); nextWeek.setDate(nextWeek.getDate() + 7);

  const overdue = tasks.filter(t => t.status === 'pending' && t.due_at && new Date(t.due_at) < today);
  const todayTasks = tasks.filter(t => t.status === 'pending' && t.due_at && new Date(t.due_at) >= today && new Date(t.due_at) < tomorrow);
  const upcoming = tasks.filter(t => t.status === 'pending' && t.due_at && new Date(t.due_at) >= tomorrow && new Date(t.due_at) < nextWeek);
  const noDue = tasks.filter(t => t.status === 'pending' && !t.due_at);

  if (loading) return <div style={{ padding: 40 }}>Loading tasks...</div>;

  const renderSection = (title, items, color) => (
    items.length > 0 && (
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
          {title} ({items.length})
        </h3>
        {items.map(t => (
          <div key={t.id} style={{
            padding: '10px 14px', background: '#fff', border: '1px solid #E2E6EB',
            borderRadius: 6, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={() => markDone(t.id)}
                style={{ background: 'none', border: '2px solid #E2E6EB', borderRadius: 4, width: 20, height: 20, cursor: 'pointer' }}
              />
              <div>
                <div style={{ fontSize: 13 }}>{t.description}</div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                  {t.company_name || 'No company'} {t.contact_name && `· ${t.contact_name}`}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {t.due_at && (
                <span style={{ fontSize: 11, color: color === '#dc2626' ? '#dc2626' : '#64748B' }}>
                  {new Date(t.due_at).toLocaleDateString()} {new Date(t.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <button
                onClick={() => navigate(`/deals/${t.deal_id}`)}
                style={{ background: 'none', border: 'none', color: '#00D4AA', fontSize: 11, cursor: 'pointer' }}
              >
                View Deal →
              </button>
            </div>
          </div>
        ))}
      </div>
    )
  );

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Tasks</h1>
      {tasks.filter(t => t.status === 'pending').length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>No pending tasks. You're all caught up.</div>
      )}
      {renderSection('Overdue', overdue, '#dc2626')}
      {renderSection('Today', todayTasks, '#1B2838')}
      {renderSection('Upcoming', upcoming, '#64748B')}
      {renderSection('No Due Date', noDue, '#64748B')}
    </div>
  );
}
```

- [ ] **Step 2: Add getTasks and updateTask to api.js**

Add to `client/src/lib/api.js`:

```js
  // Tasks
  getTasks: (params) => request(`/tasks${params ? '?' + new URLSearchParams(params) : ''}`),
  createTask: (body) => request('/tasks', { method: 'POST', body }),
  updateTask: (id, body) => request(`/tasks/${id}`, { method: 'PATCH', body }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Tasks.jsx client/src/lib/api.js
git commit -m "feat: add Tasks dashboard with overdue/today/upcoming sections"
```

---

### Task 8: ScriptViewer Component with Stepper Mode

**Files:**
- Create: `client/src/components/ScriptViewer.jsx`

- [ ] **Step 1: Create the ScriptViewer**

```jsx
import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

/**
 * Renders a script template with merge fields filled.
 * For call_script type with ## Step: headers, renders as a guided stepper.
 */
export default function ScriptViewer({ deal, contact, company }) {
  const [scripts, setScripts] = useState([]);
  const [activeScript, setActiveScript] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (deal?.stage) {
      api.getScripts({ stage: deal.stage }).then(data => {
        setScripts(data.scripts);
        if (data.scripts.length > 0) setActiveScript(data.scripts[0]);
      }).catch(() => {});
    }
  }, [deal?.stage]);

  const fillMergeFields = (content) => {
    const context = {
      company: company?.name || '', contact: contact?.name || '',
      email: contact?.email || '', phone: contact?.phone || '',
      industry: company?.industry || '', location: company?.location || '',
      type: company?.type || '', website: company?.website || '',
      source: deal?.source || '', source_detail: deal?.source_detail || '',
      referrer: deal?.source_detail || '', package_type: deal?.package_type || '',
      estimated_value: deal?.estimated_value || '', call_notes: deal?.call_notes || '',
      research_findings: deal?.research_findings || '', objections_noted: deal?.objections_noted || '',
      services: deal?.services_discussed || '',
    };
    return content.replace(/\{(\w+)\}/g, (match, field) => context[field] || match);
  };

  const parseSteps = (content) => {
    const steps = [];
    const parts = content.split(/^## Step:\s*/m).filter(Boolean);
    for (const part of parts) {
      const lines = part.split('\n');
      const title = lines[0].trim();
      const body = lines.slice(1).join('\n').trim();

      // Parse "If:" branches
      const branches = [];
      const mainParts = body.split(/^### If:\s*/m);
      const mainContent = mainParts[0].trim();

      for (let i = 1; i < mainParts.length; i++) {
        const bLines = mainParts[i].split('\n');
        const condition = bLines[0].replace(/^["']|["']$/g, '').trim();
        const response = bLines.slice(1).join('\n').trim();
        branches.push({ condition, response });
      }

      steps.push({ title, content: mainContent, branches });
    }
    return steps;
  };

  if (scripts.length === 0) {
    return <div style={{ fontSize: 13, color: '#64748B' }}>No scripts available for this stage.</div>;
  }

  const isCallScript = activeScript?.type === 'call_script' && activeScript?.content?.includes('## Step:');
  const filled = activeScript ? fillMergeFields(activeScript.content) : '';
  const steps = isCallScript ? parseSteps(filled) : [];

  return (
    <div>
      {/* Script selector tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {scripts.map(s => (
          <button
            key={s.id}
            onClick={() => { setActiveScript(s); setCurrentStep(0); }}
            style={{
              padding: '6px 12px', fontSize: 12, borderRadius: 4, border: '1px solid #E2E6EB',
              background: activeScript?.id === s.id ? '#1B2838' : '#fff',
              color: activeScript?.id === s.id ? '#fff' : '#64748B',
              cursor: 'pointer', fontWeight: activeScript?.id === s.id ? 600 : 400,
            }}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* Stepper mode for call scripts */}
      {isCallScript && steps.length > 0 ? (
        <div>
          {/* Progress indicator */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
            {steps.map((s, i) => (
              <div key={i} style={{
                flex: 1, height: 4, borderRadius: 2,
                background: i <= currentStep ? '#00D4AA' : '#E2E6EB',
              }} />
            ))}
          </div>

          <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>
            Step {currentStep + 1} of {steps.length}
          </div>

          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1B2838', marginBottom: 12 }}>
            {steps[currentStep].title}
          </h3>

          <div style={{
            background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16,
            whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, marginBottom: 12,
          }}>
            {steps[currentStep].content}
          </div>

          {/* Conditional branches */}
          {steps[currentStep].branches.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 8 }}>
                If they say...
              </div>
              {steps[currentStep].branches.map((b, i) => (
                <details key={i} style={{ marginBottom: 6 }}>
                  <summary style={{
                    cursor: 'pointer', fontSize: 13, color: '#E6A817',
                    fontWeight: 600, padding: '6px 0',
                  }}>
                    "{b.condition}"
                  </summary>
                  <div style={{
                    background: '#FFF3E0', borderRadius: 4, padding: 12,
                    fontSize: 13, lineHeight: 1.6, marginTop: 4, whiteSpace: 'pre-wrap',
                  }}>
                    {b.response}
                  </div>
                </details>
              ))}
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0}
              style={{
                padding: '8px 16px', fontSize: 13, background: '#fff', border: '1px solid #E2E6EB',
                borderRadius: 4, cursor: currentStep === 0 ? 'not-allowed' : 'pointer',
                opacity: currentStep === 0 ? 0.4 : 1,
              }}
            >
              ← Previous
            </button>
            <button
              onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
              disabled={currentStep === steps.length - 1}
              style={{
                padding: '8px 16px', fontSize: 13, background: '#00D4AA', color: '#1B2838',
                border: 'none', borderRadius: 4, fontWeight: 600,
                cursor: currentStep === steps.length - 1 ? 'not-allowed' : 'pointer',
                opacity: currentStep === steps.length - 1 ? 0.4 : 1,
              }}
            >
              Next →
            </button>
          </div>
        </div>
      ) : (
        /* Standard template view */
        <div style={{
          background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16,
          whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6,
        }}>
          {filled}
        </div>
      )}

      {/* Copy button */}
      <button
        onClick={() => navigator.clipboard.writeText(filled)}
        style={{
          marginTop: 12, padding: '6px 16px', fontSize: 12, background: '#fff',
          border: '1px solid #E2E6EB', borderRadius: 4, cursor: 'pointer', color: '#64748B',
        }}
      >
        Copy to Clipboard
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Add Scripts tab to DealDetail page**

In `client/src/pages/DealDetail.jsx`, add import:
```jsx
import ScriptViewer from '../components/ScriptViewer';
```

Add `'scripts'` to the `tabs` array, and add this tab content section:

```jsx
{activeTab === 'scripts' && (
  <ScriptViewer deal={deal} contact={contact} company={company} />
)}
```

- [ ] **Step 3: Add getScripts to api.js**

Add to `client/src/lib/api.js`:

```js
  // Scripts
  getScripts: (params) => request(`/scripts${params ? '?' + new URLSearchParams(params) : ''}`),
  createScript: (body) => request('/scripts', { method: 'POST', body }),
  updateScript: (id, body) => request(`/scripts/${id}`, { method: 'PATCH', body }),
  deleteScript: (id) => request(`/scripts/${id}`, { method: 'DELETE' }),
```

- [ ] **Step 4: Commit**

```bash
git add client/src/components/ScriptViewer.jsx client/src/pages/DealDetail.jsx client/src/lib/api.js
git commit -m "feat: add ScriptViewer with stepper mode for CLOSER call scripts"
```

---

### Task 9: FollowUpScheduler Component

**Files:**
- Create: `client/src/components/FollowUpScheduler.jsx`

- [ ] **Step 1: Create the follow-up scheduler**

```jsx
import React, { useState } from 'react';
import { api } from '../lib/api';

export default function FollowUpScheduler({ dealId, onCreated }) {
  const [mode, setMode] = useState('natural'); // 'natural' or 'picker'
  const [natural, setNatural] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('08:00');
  const [description, setDescription] = useState('Follow up');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const body = { deal_id: dealId, description };
      if (mode === 'natural') {
        body.due_at_natural = natural;
      } else {
        body.due_at = `${date}T${time}:00`;
      }
      await api.createTask(body);
      setNatural('');
      setDate('');
      setDescription('Follow up');
      if (onCreated) onCreated();
    } catch (err) {
      alert('Failed to schedule: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: '#F7F8FA', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#1B2838' }}>
        Schedule Follow-Up
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => setMode('natural')}
          style={{
            padding: '4px 12px', fontSize: 12, borderRadius: 4,
            border: '1px solid #E2E6EB', cursor: 'pointer',
            background: mode === 'natural' ? '#1B2838' : '#fff',
            color: mode === 'natural' ? '#fff' : '#64748B',
          }}
        >
          Natural Language
        </button>
        <button
          onClick={() => setMode('picker')}
          style={{
            padding: '4px 12px', fontSize: 12, borderRadius: 4,
            border: '1px solid #E2E6EB', cursor: 'pointer',
            background: mode === 'picker' ? '#1B2838' : '#fff',
            color: mode === 'picker' ? '#fff' : '#64748B',
          }}
        >
          Date Picker
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 8 }}>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What to do..."
            style={{ width: '100%', padding: '6px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13 }}
          />
        </div>

        {mode === 'natural' ? (
          <input
            value={natural}
            onChange={(e) => setNatural(e.target.value)}
            placeholder='e.g., "3 days at 8AM" or "next Tuesday at 2PM"'
            required
            style={{ width: '100%', padding: '6px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13, marginBottom: 8 }}
          />
        ) : (
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required
              style={{ flex: 1, padding: '6px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13 }} />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
              style={{ width: 120, padding: '6px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13 }} />
          </div>
        )}

        <button type="submit" disabled={loading} style={{
          padding: '6px 16px', fontSize: 12, background: '#00D4AA', color: '#1B2838',
          border: 'none', borderRadius: 4, fontWeight: 600, cursor: 'pointer',
        }}>
          {loading ? 'Scheduling...' : 'Schedule'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Add to DealDetail Tasks tab**

In `client/src/pages/DealDetail.jsx`, add import:
```jsx
import FollowUpScheduler from '../components/FollowUpScheduler';
```

Add inside the tasks tab, after the task list:
```jsx
<div style={{ marginTop: 16 }}>
  <FollowUpScheduler dealId={parseInt(id)} onCreated={loadDeal} />
</div>
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/FollowUpScheduler.jsx client/src/pages/DealDetail.jsx
git commit -m "feat: add FollowUpScheduler with natural language and date picker"
```

---

### Task 10: Scripts Editor Page

**Files:**
- Create: `client/src/pages/Scripts.jsx`

- [ ] **Step 1: Create the Scripts management page**

```jsx
import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import Modal from '../components/Modal';

const STAGES = ['lead', 'outreach', 'discovery_call', 'proposal', 'follow_up', 'closed_won'];
const TYPES = ['email', 'call_script', 'objection', 'checklist', 'follow_up'];

export default function Scripts() {
  const [scripts, setScripts] = useState([]);
  const [activeStage, setActiveStage] = useState('outreach');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ stage: 'outreach', name: '', type: 'email', content: '' });
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const data = await api.getScripts({ stage: activeStage });
    setScripts(data.scripts);
  };

  useEffect(() => { load(); }, [activeStage]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editing) {
      await api.updateScript(editing, form);
    } else {
      await api.createScript(form);
    }
    setShowForm(false);
    setForm({ stage: activeStage, name: '', type: 'email', content: '' });
    setEditing(null);
    load();
  };

  const startEdit = (s) => {
    setForm({ stage: s.stage, name: s.name, type: s.type, content: s.content });
    setEditing(s.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this script template?')) return;
    await api.deleteScript(id);
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Script Templates</h1>
        <button
          onClick={() => { setEditing(null); setForm({ stage: activeStage, name: '', type: 'email', content: '' }); setShowForm(true); }}
          style={{
            background: '#00D4AA', color: '#1B2838', border: 'none', borderRadius: 6,
            padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}
        >
          + New Template
        </button>
      </div>

      {/* Stage tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {STAGES.map(s => (
          <button key={s} onClick={() => setActiveStage(s)} style={{
            padding: '6px 14px', fontSize: 12, borderRadius: 4, border: '1px solid #E2E6EB',
            background: activeStage === s ? '#1B2838' : '#fff',
            color: activeStage === s ? '#fff' : '#64748B',
            cursor: 'pointer', fontWeight: activeStage === s ? 600 : 400,
          }}>
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Script list */}
      {scripts.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>
          No templates for this stage yet.
        </div>
      )}
      {scripts.map(s => (
        <div key={s.id} style={{
          background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8,
          padding: 16, marginBottom: 12,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</span>
              <span style={{
                fontSize: 11, color: '#64748B', background: '#F7F8FA',
                padding: '2px 8px', borderRadius: 3, marginLeft: 8,
              }}>
                {s.type}
              </span>
            </div>
            <div>
              <button onClick={() => startEdit(s)} style={{ background: 'none', border: 'none', color: '#00D4AA', cursor: 'pointer', fontSize: 12, marginRight: 8 }}>Edit</button>
              <button onClick={() => handleDelete(s.id)} style={{ background: 'none', border: 'none', color: '#E6A817', cursor: 'pointer', fontSize: 12 }}>Delete</button>
            </div>
          </div>
          <pre style={{
            background: '#F7F8FA', padding: 12, borderRadius: 4, fontSize: 12,
            whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto', color: '#64748B',
          }}>
            {s.content.slice(0, 300)}{s.content.length > 300 ? '...' : ''}
          </pre>
        </div>
      ))}

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Template' : 'New Template'}>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }} />
            </div>
            <div style={{ width: 160 }}>
              <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }}>
                {TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>
              Content <span style={{ fontSize: 11 }}>(merge fields: {'{company}'}, {'{contact}'}, {'{industry}'}, {'{location}'}, etc.)</span>
            </label>
            <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required
              rows={12}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13, fontFamily: 'monospace', resize: 'vertical' }} />
          </div>
          <button type="submit" style={{
            width: '100%', padding: '10px 0', background: '#00D4AA', color: '#1B2838',
            border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>
            {editing ? 'Save Changes' : 'Create Template'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/Scripts.jsx
git commit -m "feat: add Scripts editor page for managing templates by stage"
```

---

### Task 11: Seed Default Script Templates

**Files:**
- Create: `server/db/seed-scripts.js`

- [ ] **Step 1: Create script seeder**

```js
/**
 * Seeds default script templates into the database.
 * Run once during setup or when resetting templates.
 */
function seedScriptTemplates(db) {
  const templates = [
    // Lead stage
    { stage: 'lead', name: 'Research Checklist', type: 'checklist', content: `# Research Checklist for {company}

- [ ] Check website: platform, page count, mobile responsiveness, forms, CTAs
- [ ] Google "{company} {location}" — years in business, employee count, certifications
- [ ] Check Google Business Profile — review count, rating, photos, post activity
- [ ] Find social media — LinkedIn, Facebook, Instagram (follower counts, last post)
- [ ] Check review platforms — Google, Yelp, BBB
- [ ] Look for email marketing — popups, lead magnets, newsletter forms
- [ ] Identify top 2-3 competitors in same market
- [ ] Classify: B2B or B2C
- [ ] Note 3-4 strengths
- [ ] Note 4-5 digital gaps with evidence` },

    // Outreach stage
    { stage: 'outreach', name: 'Warm Referral Intro', type: 'email', content: `Subject: {referrer} suggested I reach out

Hey {contact},

{referrer} mentioned you and I should connect. I work with {industry} businesses in {location} to help them get more clients through their digital presence.

I took a quick look at {company}'s online presence and had a couple thoughts I think you'd find useful — no pitch, just observations.

Worth a quick 10-minute call this week?

Best,
Josh Horsley
TKBS Marketing` },

    { stage: 'outreach', name: 'Cold Email #1 — Observation + Value', type: 'email', content: `Subject: quick thought about {company}

Hey {contact},

I was looking at {company}'s online presence and noticed a few things that jumped out.

We help {industry} businesses in {location} get more inbound leads by fixing exactly this kind of thing. Recently helped a similar business go from sporadic leads to a predictable pipeline.

Would a quick 10-min walkthrough of what I found be worth your time? No pitch — just sharing what I see.

Josh Horsley
TKBS Marketing` },

    { stage: 'outreach', name: 'Cold Email #2 — Case Study (Day 3)', type: 'email', content: `Subject: how a {industry} business added clients in 60 days

Hey {contact},

Following up on my note from a few days ago.

We just wrapped up a project with a {industry} business — they went from relying entirely on referrals to getting 15+ inbound leads per month. Took about 60 days.

Your business reminds me a lot of theirs before we started. Want me to send the breakdown? Takes 5 minutes to read.

Josh` },

    { stage: 'outreach', name: 'Cold Email #3 — Break-Up (Day 10)', type: 'email', content: `Subject: closing the loop

Hey {contact},

I've reached out a couple times and haven't heard back — totally understand, you're busy running {company}.

I'm going to assume the timing isn't right. No hard feelings at all.

If anything changes and you want to revisit getting more clients through your digital presence, I'm here. Wishing you the best with {company}.

Josh Horsley
TKBS Marketing` },

    { stage: 'outreach', name: 'Discovery Call Script (CLOSER)', type: 'call_script', content: `## Step: CLARIFY
"Hey {contact}, thanks for taking the time. Before I jump into anything, can you tell me a little about {company} and what made you agree to this call?"

"What's going on with your marketing right now? How are you currently getting new clients?"

Listen. Let them talk. Take notes.

### If: "We mostly get referrals"
"That's a great sign — it means your work speaks for itself. The challenge with referrals is you can't control when they come in. What happens during slow months?"

### If: "We've tried some ads before"
"Got it. What platform? What happened? ... That's actually really common. Most of the businesses I work with had a similar experience before we started working together."

## Step: LABEL
"So it sounds like {company} is doing great work, but you don't have a predictable system to bring in new clients when you need them. You're relying on [referrals/word of mouth/hope], and when things slow down, there's no lever to pull. Is that fair?"

Wait for them to agree. If they push back, adjust your label.

### If: "That's not quite right"
"Help me understand better — what would you say is the main challenge?"

## Step: OVERVIEW
"What have you tried before to solve this? Any agencies, ads, marketing efforts?"

"And what happened? What worked, what didn't?"

"Why do you think it didn't work?"

### If: "We got burned by an agency"
"I hear that a lot, honestly. What specifically went wrong? ... Yeah, that's exactly the kind of thing we do differently. Let me explain how."

## Step: SELL THE SOLUTION
"Based on what you've told me, here's what I think {company} actually needs:

Step 1: We build you a digital presence that converts — a landing page designed to turn visitors into leads, connected to an email system that follows up automatically.

Step 2: We drive targeted traffic — people in {location} actively searching for {industry} services — straight to that page.

Step 3: Your phone rings. You close the deals you're already great at closing.

That's it. We handle the marketing system, you handle what you're best at — running {company}."

### If: "That sounds expensive"
"I get it. Let me ask you this — if you KNEW it would work, if I could guarantee you'd see results, would the investment still be an issue?"

## Step: EXPLAIN CONCERNS
"Now, I know you might be thinking a few things. Let me address them:

You might be wondering if this will work for {industry}. We've done this for [similar businesses]. It works.

You might be worried about the time commitment on your end. This is fully done-for-you. You don't write copy, you don't manage ads, you don't build pages.

And if you're concerned about getting burned again — I get it. That's why we [guarantee]. If we don't deliver, you don't pay."

### If: "I need to think about it"
"Totally fair. What specifically do you need to think about? Is it the money, whether it'll work, or something else? Because if there's something I haven't addressed, I'd rather handle it now while we're talking."

### If: "I need to talk to my partner"
"Of course. What do you think they'll be most concerned about? ... And if they asked 'what did they say about that,' what would you tell them?"

## Step: REINFORCE
"So here's what I'd like to do next — I'll put together a custom proposal based on everything we discussed today. No obligation. You'll see exactly what we'd build, the timeline, and the investment.

Should we plan to reconnect [day/time] to walk through it together?"

After they agree: "Great decision. You're going to love what we put together for {company}."` },

    // Follow-up stage
    { stage: 'follow_up', name: 'Day 1: Thank-You + Recap', type: 'follow_up', content: `Subject: great talking today, {contact}

Hey {contact},

Really enjoyed our conversation today about {company}. You've built something impressive, and I'm excited about the opportunity to help take it further.

Quick recap of what we discussed:
- [Key pain point discussed]
- [Solution approach we outlined]
- [Specific deliverables mentioned]

I'm putting together your custom proposal now. You'll have it by [date].

In the meantime, if any questions come up, don't hesitate to reach out.

Talk soon,
Josh` },

    { stage: 'follow_up', name: 'Day 4: Check-In', type: 'follow_up', content: `Subject: quick question, {contact}

Hey {contact},

Following up on the proposal I sent over. Had a chance to look through it?

I also came across [relevant insight/stat for their industry] and thought of {company}. Might be worth a conversation.

Any questions I can answer about what we put together?

Josh` },

    { stage: 'follow_up', name: 'Day 21: Break-Up', type: 'follow_up', content: `Subject: closing the loop on {company}

Hey {contact},

I've reached out a few times and haven't heard back, so I'm going to assume the timing isn't right. That's totally okay.

I'll stop reaching out, but if anything changes and you want to revisit getting {company} a predictable stream of new clients, I'm here.

Wishing you the best,
Josh` },

    // Closed Won stage
    { stage: 'closed_won', name: 'Welcome Email', type: 'email', content: `Subject: welcome aboard, {contact}! Here's what happens next

Hey {contact},

Officially excited to be working with {company}! Great decision — we're going to build something awesome together.

Here's what happens next:

1. Kickoff Call — I'll send a calendar invite for [date/time]. We'll align on goals, timelines, and get everything we need to start building.

2. Asset Collection — I'll send over a short list of things we'll need from you (logos, logins, brand guidelines if you have them). Don't worry — it's quick.

3. Build Starts — Within [timeline], you'll see the first deliverables. We move fast.

If you need anything before our kickoff, just reply to this email.

Let's go!
Josh Horsley
TKBS Marketing` },
  ];

  const insert = db.prepare(
    `INSERT INTO script_templates (stage, name, type, content, sort_order) VALUES (?, ?, ?, ?, ?)`
  );

  const existing = db.prepare('SELECT COUNT(*) as c FROM script_templates').get().c;
  if (existing > 0) return { seeded: false, count: existing };

  const transaction = db.transaction(() => {
    templates.forEach((t, i) => {
      insert.run(t.stage, t.name, t.type, t.content, i);
    });
  });

  transaction();
  return { seeded: true, count: templates.length };
}

module.exports = { seedScriptTemplates };
```

- [ ] **Step 2: Add to setup script**

Add to `scripts/setup.sh` after the stage actions seeding:

```js
// Seed script templates
const { seedScriptTemplates } = require('./server/db/seed-scripts');
const scriptResult = seedScriptTemplates(db);
console.log(scriptResult.seeded ? 'Script templates seeded: ' + scriptResult.count : 'Script templates already exist.');
```

- [ ] **Step 3: Run full test suite**

```bash
npx jest --verbose
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add server/db/seed-scripts.js scripts/setup.sh
git commit -m "feat: add default script templates with Hormozi CLOSER call script"
```

---

### Task 12: End-to-End Verification

- [ ] **Step 1: Run setup**

```bash
bash scripts/setup.sh
```

- [ ] **Step 2: Start dev servers**

```bash
npm run dev
```

- [ ] **Step 3: Verify Phase 2 features**

Open `http://localhost:5173` and verify:

1. Create a new deal → auto-tasks appear (Research prospect, Send first outreach)
2. Drag deal to Outreach → cadence tasks created (day 3, 7, 14 reminders)
3. Navigate to Tasks page → see all tasks sorted by urgency
4. Click into a deal → Scripts tab shows templates with merge fields filled
5. If CLOSER call script exists → stepper view with step-by-step navigation and collapsible "If they say..." branches
6. On Tasks tab → Schedule Follow-Up works with both natural language ("3 days at 8AM") and date picker
7. Navigate to Scripts page → view/create/edit/delete templates by stage
8. Copy button on script viewer copies filled template to clipboard

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: Phase 2 complete — tasks, scripts, stepper viewer, follow-up scheduling, stage actions"
```
