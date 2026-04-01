# TKBS CRM Phase 3: Intelligence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Claude Code CLI integration for skill triggers, AI content generation with Hormozi prompts, reports dashboard, and settings/admin UI.

**Architecture:** Builds on Phase 1+2. Adds a Claude CLI service that spawns child processes, a prompt builder service for Hormozi-informed content generation, generation job tracking with polling, a reports endpoint with aggregation queries, and a settings page for managing stage actions and users.

**Tech Stack:** Same as Phase 1+2. Uses Node.js `child_process.spawn` for Claude Code CLI.

**Prerequisite:** Phase 1+2 complete. Claude Code CLI installed (`npm install -g @anthropic-ai/claude-code`).

**Spec reference:** `docs/specs/2026-03-31-tkbs-crm-design.md`

---

## File Structure (New/Modified)

```
tkbs-crm/
├── server/
│   ├── routes/
│   │   ├── deals.js              # MODIFY — add generation-status + generate endpoints
│   │   ├── reports.js            # NEW — aggregation queries
│   │   └── settings.js           # MODIFY — stage actions + user management
│   ├── services/
│   │   ├── claude-cli.js         # NEW — spawn Claude Code CLI
│   │   ├── ai-prompts.js         # NEW — Hormozi prompt construction by stage
│   │   └── stage-actions.js      # MODIFY — wire up trigger_skill to claude-cli
│   └── __tests__/
│       ├── ai-prompts.test.js    # NEW
│       ├── reports.test.js       # NEW
│       └── claude-cli.test.js    # NEW
├── client/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Reports.jsx       # NEW — metrics dashboard
│   │   │   ├── Settings.jsx      # NEW — admin settings
│   │   │   └── DealDetail.jsx    # MODIFY — generation status, AI generate button
│   │   ├── components/
│   │   │   ├── ScriptViewer.jsx  # MODIFY — add "Generate with AI" button
│   │   │   └── Layout.jsx        # MODIFY — add Reports + Settings nav
```

---

### Task 1: Claude Code CLI Service

**Files:**
- Create: `server/services/claude-cli.js`
- Create: `server/__tests__/claude-cli.test.js`

- [ ] **Step 1: Write the test**

```js
const { buildCliCommand, isCliAvailable } = require('../services/claude-cli');

describe('buildCliCommand', () => {
  test('builds a command string with prompt', () => {
    const result = buildCliCommand('Build a presentation for Acme Manufacturing');
    expect(result.command).toBe('claude');
    expect(result.args).toContain('--print');
    expect(result.args.some(a => a.includes('Acme Manufacturing'))).toBe(true);
  });

  test('escapes special characters in prompt', () => {
    const result = buildCliCommand('Test with "quotes" and $variables');
    const promptArg = result.args.find(a => a.includes('Test with'));
    expect(promptArg).toBeDefined();
  });
});

describe('isCliAvailable', () => {
  test('returns a boolean', () => {
    const result = isCliAvailable();
    expect(typeof result).toBe('boolean');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest server/__tests__/claude-cli.test.js --verbose
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the Claude CLI service**

Create `server/services/claude-cli.js`:

```js
const { spawn, execSync } = require('child_process');
const path = require('path');

/**
 * Checks if the Claude Code CLI is installed and available.
 */
function isCliAvailable() {
  try {
    execSync('claude --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds the command and args for spawning claude CLI.
 */
function buildCliCommand(prompt) {
  return {
    command: 'claude',
    args: ['--print', prompt],
  };
}

/**
 * Spawns Claude Code CLI with the given prompt.
 * Returns a promise that resolves with the output or rejects with an error.
 *
 * @param {string} prompt - The prompt to send to Claude
 * @param {object} options - Optional settings
 * @param {string} options.cwd - Working directory for the CLI process
 * @param {number} options.timeout - Timeout in ms (default: 300000 = 5 min)
 * @returns {Promise<{output: string, exitCode: number}>}
 */
function runCli(prompt, options = {}) {
  const { cwd, timeout = 300000 } = options;
  const { command, args } = buildCliCommand(prompt);

  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: cwd || process.cwd(),
      timeout,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ output: stdout.trim(), exitCode: code });
      } else {
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr || stdout}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });
  });
}

/**
 * Runs Claude CLI and tracks the job in the generation_jobs table.
 * Updates job status on completion or failure.
 *
 * @param {object} db - Database connection
 * @param {number} dealId - Deal ID to link the job to
 * @param {string} type - Job type (analysis_deck, proposal, ai_content)
 * @param {string} prompt - The prompt to send
 * @param {object} options - Optional settings passed to runCli
 */
async function runTrackedJob(db, dealId, type, prompt, options = {}) {
  // Create the job record
  const result = db.prepare(
    `INSERT INTO generation_jobs (deal_id, type, status) VALUES (?, ?, 'running')`
  ).run(dealId, type);
  const jobId = result.lastInsertRowid;

  try {
    const { output } = await runCli(prompt, options);

    db.prepare(
      `UPDATE generation_jobs SET status = 'completed', output = ?, completed_at = datetime('now') WHERE id = ?`
    ).run(output, jobId);

    // Log activity
    db.prepare(
      `INSERT INTO activities (deal_id, type, content, metadata) VALUES (?, 'system', ?, ?)`
    ).run(dealId, `AI generation completed: ${type}`, JSON.stringify({ job_id: jobId }));

    return { jobId, output, status: 'completed' };
  } catch (err) {
    db.prepare(
      `UPDATE generation_jobs SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?`
    ).run(err.message, jobId);

    // Log error as activity
    db.prepare(
      `INSERT INTO activities (deal_id, type, content, metadata) VALUES (?, 'system', ?, ?)`
    ).run(dealId, `AI generation failed: ${type} — ${err.message}`, JSON.stringify({ job_id: jobId }));

    return { jobId, error: err.message, status: 'failed' };
  }
}

module.exports = { isCliAvailable, buildCliCommand, runCli, runTrackedJob };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest server/__tests__/claude-cli.test.js --verbose
```

Expected: Tests PASS (isCliAvailable may return false if CLI not installed — that's fine).

- [ ] **Step 5: Commit**

```bash
git add server/services/claude-cli.js server/__tests__/claude-cli.test.js
git commit -m "feat: add Claude Code CLI service with tracked job management"
```

---

### Task 2: AI Prompt Builder (Hormozi Methodology)

**Files:**
- Create: `server/services/ai-prompts.js`
- Create: `server/__tests__/ai-prompts.test.js`

- [ ] **Step 1: Write the test**

```js
const { buildPrompt } = require('../services/ai-prompts');

const mockDeal = {
  stage: 'outreach', source: 'cold', source_detail: '',
  estimated_value: 2500, package_type: 'boost',
  services_discussed: '["Landing Page","Email Marketing","Meta Ads"]',
  call_notes: 'They rely on referrals only.', research_findings: 'No email infrastructure. Thin GBP listing.',
  objections_noted: '',
};
const mockContact = { name: 'Sarah Chen', email: 'sarah@acme.com', phone: '555-1234' };
const mockCompany = { name: 'Acme Manufacturing', location: 'Detroit, MI', industry: 'Manufacturing', type: 'B2B', website: 'acme-mfg.com' };

describe('buildPrompt', () => {
  test('builds outreach email prompt with Hormozi framework', () => {
    const prompt = buildPrompt('outreach_emails', mockDeal, mockContact, mockCompany);
    expect(prompt).toContain('Acme Manufacturing');
    expect(prompt).toContain('Sarah Chen');
    expect(prompt).toContain('Detroit, MI');
    expect(prompt).toContain('Hormozi');
    expect(prompt).toContain('Value Equation');
    expect(prompt).toContain('break-up');
  });

  test('builds call script prompt with CLOSER framework', () => {
    const prompt = buildPrompt('outreach_call', mockDeal, mockContact, mockCompany);
    expect(prompt).toContain('CLOSER');
    expect(prompt).toContain('CLARIFY');
    expect(prompt).toContain('REINFORCE');
  });

  test('builds follow-up prompt with objection weaving', () => {
    const dealWithObjections = { ...mockDeal, stage: 'follow_up', objections_noted: 'Price concern — thinks $2500 is high' };
    const prompt = buildPrompt('followup_emails', dealWithObjections, mockContact, mockCompany);
    expect(prompt).toContain('Price concern');
    expect(prompt).toContain('ROI');
  });

  test('builds objection handling prompt', () => {
    const prompt = buildPrompt('objection_scripts', mockDeal, mockContact, mockCompany);
    expect(prompt).toContain('Too expensive');
    expect(prompt).toContain('I need to think about it');
    expect(prompt).toContain('NEVER discount');
  });

  test('adapts tone for warm vs cold source', () => {
    const warmDeal = { ...mockDeal, source: 'referral', source_detail: 'Referral from Dave' };
    const prompt = buildPrompt('outreach_emails', warmDeal, mockContact, mockCompany);
    expect(prompt).toContain('warm');
    expect(prompt).toContain('Dave');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest server/__tests__/ai-prompts.test.js --verbose
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the prompt builder**

Create `server/services/ai-prompts.js`:

```js
const HORMOZI_PREAMBLE = `You are a sales copywriter following Alex Hormozi's methodology. Apply these principles to everything you write:

VALUE EQUATION — Every piece must address all four variables:
- Dream Outcome: What the prospect actually wants (not services, but results — "a full calendar," "predictable growth")
- Perceived Likelihood: Why they should believe it'll work (proof, specificity, guarantees)
- Time Delay: How fast they'll see results (emphasize early wins, collapse perceived waiting)
- Effort & Sacrifice: How little they have to do ("done for you" framing)

KEY RULES:
1. Lead with value, not features. Describe what they GET, not what you DO.
2. Specificity beats generics. Use their actual business name, industry, location, and situation. Never say "businesses like yours."
3. Dream outcome language. Not "digital marketing" but "a predictable system that fills your calendar without you lifting a finger."
4. Proof over promises. Back claims with case studies, metrics, or guarantees. Use industry benchmarks with sources if no case study exists yet.
5. Small CTAs first. First contact asks for a conversation, not a purchase.
6. Never "just checking in." Every follow-up provides value.
7. Risk reversal through bold guarantees.
8. Scarcity must be real. "We onboard 5 clients/month because quality requires it."
9. Never discount. Adjust scope instead.
10. The break-up creates urgency. Final follow-up is a gracious walk-away.

`;

function buildPrompt(type, deal, contact, company) {
  const isWarm = deal.source === 'referral' || deal.source === 'content';
  const warmCold = isWarm ? 'warm' : 'cold';
  const referrer = deal.source_detail || '';

  const context = `
PROSPECT CONTEXT:
- Contact: ${contact.name} (${contact.email || 'no email'})
- Company: ${company.name}
- Location: ${company.location || 'unknown'}
- Industry: ${company.industry || 'unknown'}
- Type: ${company.type || 'unknown'}
- Website: ${company.website || 'none found'}
- Source: ${deal.source || 'unknown'} ${referrer ? `— ${referrer}` : ''}
- Known gaps: ${deal.research_findings || 'none documented'}
- Services we'd recommend: ${deal.services_discussed || '[]'}
- Package type: ${deal.package_type || 'undecided'}
- Estimated value: $${deal.estimated_value || 0}/mo
- Call notes: ${deal.call_notes || 'none'}
- Objections noted: ${deal.objections_noted || 'none'}
`;

  switch (type) {
    case 'outreach_emails':
      return HORMOZI_PREAMBLE + context + `
Generate a ${warmCold} outreach email sequence for ${contact.name} at ${company.name}.
${isWarm && referrer ? `This is a warm referral from ${referrer}. Lead with the personal connection.` : ''}

Follow Hormozi's outreach methodology:
- Email 1: Lead with a specific, genuine observation about their business. Provide an insight or value upfront. End with a small ask (10-min call). No pitch.
- Email 2 (day 3): Different angle. Share a relevant result from a similar business. Keep the CTA soft.
- Email 3 (day 7): Value bomb — offer a free audit or specific recommendations. Make it about THEM.
- Email 4 (day 14): Direct but respectful check-in. Reference previous value shared.
- Email 5 (day 21): Break-up email. "I'm going to stop reaching out, but if anything changes, I'm here."

Tone: Consultative, confident, not pushy. Willingness to walk away is the most powerful frame.

Output each email with: subject line, body, and send timing.`;

    case 'outreach_call':
      return HORMOZI_PREAMBLE + context + `
Generate a ${warmCold} outreach call script for calling ${contact.name} at ${company.name}.

Follow Alex Hormozi's CLOSER framework:
1. CLARIFY — Open with a brief, human intro. Ask what's going on with their marketing. Let them talk. Listen.
2. LABEL — Reflect back what you heard. Name the problem clearly. Get them to agree: "Is that fair?"
3. OVERVIEW — Ask what they've tried before. What worked? What didn't? Why do they think it failed?
4. SELL THE SOLUTION — Present the approach in 3 simple steps. Sell the "what" and "why" before the "who."
5. EXPLAIN CONCERNS — Proactively address likely objections:
   - Price: "If you KNEW it would work, would the price still be an issue?" → restack proof and guarantee
   - Trust: "You SHOULD be skeptical. That's why we [guarantee]." → stack proof
   - Timing: "What specifically do you need to think about?" → surface the real objection
   - DIY: "The question isn't whether you can — it's whether you should."
6. REINFORCE — Ask for the close. Reinforce the decision immediately. Move to next steps.

Include conditional branches: if they say X, respond with Y.
Format call scripts using these Markdown conventions so the CRM can render them as a stepper:
- Use "## Step: STEP_NAME" for each CLOSER step
- Use "### If: \\"prospect objection\\"" for conditional branches within a step
Tone: Curious, consultative, confident. Ask more than you tell.`;

    case 'followup_emails':
      return HORMOZI_PREAMBLE + context + `
Generate a post-proposal follow-up email sequence for ${contact.name} at ${company.name}.

Follow Hormozi's follow-up methodology — NEVER send "just checking in." Every touchpoint must provide value.
- Day 1: Thank-you + recap what was discussed. Reinforce dream outcome. Mention one specific thing from the call that showed you listened.
- Day 4: Check-in with value. Share a relevant insight, quick tip, or case study result. End with: "Any questions about the proposal?"
- Day 10: Value bomb. Send something genuinely useful — a competitor insight, an industry stat. Position it as "I came across this and thought of ${company.name}."
- Day 21: Break-up email. Gracious walk-away. Creates pattern interrupt.

${deal.objections_noted ? `IMPORTANT — weave responses to these objections into the emails:
${deal.objections_noted}
- Price concern → Day 4 email should include ROI framing and cost-of-inaction
- Trust concern → Day 4 email should include proof/case study
- Timing concern → Day 10 email should include urgency framing` : ''}

Output each email with: subject line, body, and send timing.`;

    case 'objection_scripts':
      return HORMOZI_PREAMBLE + context + `
Generate objection handling scripts customized to ${contact.name} at ${company.name}.

For each objection, follow Hormozi's framework — objections are unresolved concerns in the Value Equation:

1. "Too expensive" / Price:
   - Diagnose: value problem or cash problem?
   - If value: "If you KNEW it would work, would the price still be an issue?" → restack proof, guarantee, ROI math specific to ${company.industry || 'their industry'}
   - If cash: Adjust scope. NEVER discount.
   - Cost of inaction: "What's it costing you right now to NOT have a steady stream of clients?"

2. "I need to think about it" / Stall:
   - "What specifically do you need to think about?"
   - Two Decisions reframe: "Do you want [dream outcome]? And who are you going to do it with?"

3. "I've been burned before" / Trust:
   - Validate: "You SHOULD be skeptical."
   - Differentiate with specifics about how TKBS is different
   - Proof stack: guarantee, metrics, case study

4. "Not the right time":
   - "When would be? What changes between now and then?"
   - Cost of waiting: "Every month without the system is X potential clients missed"

5. "I can do it myself":
   - "You absolutely could. Is your time better spent running ${company.name} or learning Facebook ads?"

After handling each objection, always re-ask for the close.
Make all scripts specific to ${company.name}'s industry, size, and stated goals.`;

    default:
      return HORMOZI_PREAMBLE + context + `
Generate sales content for the "${deal.stage}" stage of the pipeline for ${contact.name} at ${company.name}.
Apply the Value Equation to everything. Be specific to their business.`;
  }
}

/**
 * Maps a deal's current stage to the appropriate prompt type(s).
 */
function getPromptTypesForStage(stage) {
  switch (stage) {
    case 'outreach': return ['outreach_emails', 'outreach_call'];
    case 'discovery_call': return ['outreach_call'];
    case 'follow_up': return ['followup_emails', 'objection_scripts'];
    case 'proposal': return ['followup_emails'];
    default: return ['generic'];
  }
}

module.exports = { buildPrompt, getPromptTypesForStage };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest server/__tests__/ai-prompts.test.js --verbose
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/ai-prompts.js server/__tests__/ai-prompts.test.js
git commit -m "feat: add Hormozi-informed AI prompt builder for all pipeline stages"
```

---

### Task 3: Deal Generation Endpoints

**Files:**
- Modify: `server/routes/deals.js`

- [ ] **Step 1: Add generation-status and generate endpoints**

Add to `server/routes/deals.js`:

```js
const { runTrackedJob, isCliAvailable } = require('../services/claude-cli');
const { buildPrompt, getPromptTypesForStage } = require('../services/ai-prompts');

// GET /api/deals/:id/generation-status
router.get('/:id/generation-status', (req, res) => {
  const jobs = req.db.prepare(
    'SELECT * FROM generation_jobs WHERE deal_id = ? ORDER BY started_at DESC'
  ).all(req.params.id);
  const active = jobs.find(j => j.status === 'running');
  res.json({ jobs, activeJob: active || null });
});

// POST /api/deals/:id/generate — trigger AI content generation
router.post('/:id/generate', async (req, res) => {
  const deal = req.db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
  if (!deal) return res.status(404).json({ error: 'Deal not found' });

  if (!isCliAvailable()) {
    return res.status(503).json({ error: 'Claude Code CLI is not installed. Run: npm install -g @anthropic-ai/claude-code' });
  }

  const company = deal.company_id ? req.db.prepare('SELECT * FROM companies WHERE id = ?').get(deal.company_id) : {};
  const contact = deal.contact_id ? req.db.prepare('SELECT * FROM contacts WHERE id = ?').get(deal.contact_id) : {};

  const promptType = req.body.prompt_type || getPromptTypesForStage(deal.stage)[0] || 'generic';
  const prompt = buildPrompt(promptType, deal, contact, company);

  // Start async — respond immediately
  res.json({ status: 'started', message: 'AI generation started. Poll /generation-status for updates.' });

  // Run in background
  runTrackedJob(req.db, deal.id, 'ai_content', prompt).catch(err => {
    console.error('Generation job failed:', err.message);
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/deals.js
git commit -m "feat: add deal generation-status and generate endpoints for AI content"
```

---

### Task 4: Wire Stage Actions to Claude CLI

**Files:**
- Modify: `server/services/stage-actions.js`

- [ ] **Step 1: Update trigger_skill handler**

In the `switch` statement in `executeStageActions`, replace the `trigger_skill` case:

```js
      case 'trigger_skill': {
        const { isCliAvailable: cliAvailable, runTrackedJob } = require('./claude-cli');
        const { buildPrompt } = require('./ai-prompts');

        if (!cliAvailable()) {
          result.actions.push({ type: 'trigger_skill', skill: config.skill, skipped: true, reason: 'CLI not installed' });
          break;
        }

        const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(dealId);
        const company = deal?.company_id ? db.prepare('SELECT * FROM companies WHERE id = ?').get(deal.company_id) : {};
        const contact = deal?.contact_id ? db.prepare('SELECT * FROM contacts WHERE id = ?').get(deal.contact_id) : {};

        // Build prompt from config template with deal context
        let prompt = config.prompt_template || '';
        const context = {
          company: company?.name || '', contact: contact?.name || '',
          location: company?.location || '', industry: company?.industry || '',
          type: company?.type || '', source_detail: deal?.source_detail || '',
          notes: deal?.call_notes || '', package_type: deal?.package_type || '',
          services_discussed: deal?.services_discussed || '', pricing_notes: deal?.pricing_notes || '',
          call_notes: deal?.call_notes || '',
        };
        prompt = prompt.replace(/\{(\w+)\}/g, (match, field) => context[field] || match);

        const jobType = config.skill === 'tkbs-initial-analysis' ? 'analysis_deck' : 'proposal';

        // Run async — don't await in the action handler
        runTrackedJob(db, dealId, jobType, prompt).catch(err => {
          console.error(`Skill trigger failed for deal ${dealId}:`, err.message);
        });

        result.skillsTriggered.push(config.skill);
        result.actions.push({ type: 'trigger_skill', skill: config.skill, started: true });
        break;
      }
```

- [ ] **Step 2: Commit**

```bash
git add server/services/stage-actions.js
git commit -m "feat: wire stage actions to Claude CLI for skill triggers"
```

---

### Task 5: Reports Routes + Tests

**Files:**
- Modify: `server/routes/reports.js` (new file was placeholder from Phase 2 settings)
- Create: `server/__tests__/reports.test.js`

- [ ] **Step 1: Create reports route file**

Create `server/routes/reports.js`:

```js
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/summary', (req, res) => {
  const activeDeals = req.db.prepare(
    "SELECT COUNT(*) as count FROM deals WHERE stage NOT IN ('closed_won', 'closed_lost')"
  ).get().count;

  const pipelineValue = req.db.prepare(
    "SELECT COALESCE(SUM(estimated_value), 0) as total FROM deals WHERE stage NOT IN ('closed_won', 'closed_lost')"
  ).get().total;

  const won = req.db.prepare("SELECT COUNT(*) as count FROM deals WHERE stage = 'closed_won'").get().count;
  const lost = req.db.prepare("SELECT COUNT(*) as count FROM deals WHERE stage = 'closed_lost'").get().count;
  const totalClosed = won + lost;
  const winRate = totalClosed > 0 ? Math.round((won / totalClosed) * 100) : 0;

  const avgCycle = req.db.prepare(
    "SELECT AVG(julianday(closed_at) - julianday(created_at)) as avg_days FROM deals WHERE stage = 'closed_won' AND closed_at IS NOT NULL"
  ).get().avg_days;

  res.json({
    summary: {
      activeDeals,
      pipelineValue,
      winRate,
      avgDealCycle: avgCycle ? Math.round(avgCycle) : null,
      totalWon: won,
      totalLost: lost,
    },
  });
});

router.get('/funnel', (req, res) => {
  const stages = req.db.prepare(
    'SELECT stage, COUNT(*) as count FROM deals GROUP BY stage ORDER BY count DESC'
  ).all();
  res.json({ funnel: stages });
});

router.get('/sources', (req, res) => {
  const sources = req.db.prepare(
    'SELECT source, COUNT(*) as count FROM deals WHERE source IS NOT NULL GROUP BY source ORDER BY count DESC'
  ).all();
  res.json({ sources });
});

router.get('/lost-reasons', (req, res) => {
  const reasons = req.db.prepare(
    "SELECT lost_reason, COUNT(*) as count FROM deals WHERE stage = 'closed_lost' AND lost_reason IS NOT NULL GROUP BY lost_reason ORDER BY count DESC"
  ).all();
  res.json({ reasons });
});

router.get('/monthly', (req, res) => {
  const monthly = req.db.prepare(
    "SELECT strftime('%Y-%m', closed_at) as month, SUM(estimated_value) as revenue, COUNT(*) as count FROM deals WHERE stage = 'closed_won' AND closed_at IS NOT NULL GROUP BY month ORDER BY month DESC LIMIT 12"
  ).all();
  res.json({ monthly });
});

module.exports = router;
```

- [ ] **Step 2: Add route mounting to server/index.js**

Add after settings route:
```js
app.use('/api/reports', require('./routes/reports'));
```

- [ ] **Step 3: Write the test**

Create `server/__tests__/reports.test.js`:

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
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Test', 'test@test.com', hash, 'admin');
  db.prepare('INSERT INTO companies (name) VALUES (?)').run('Acme');
  db.prepare('INSERT INTO contacts (name, company_id) VALUES (?, ?)').run('Sarah', 1);

  // Active deals
  db.prepare("INSERT INTO deals (company_id, contact_id, stage, source, estimated_value, owner_id) VALUES (1, 1, 'lead', 'referral', 2000, 1)").run();
  db.prepare("INSERT INTO deals (company_id, contact_id, stage, source, estimated_value, owner_id) VALUES (1, 1, 'outreach', 'cold', 1500, 1)").run();
  // Won deal
  db.prepare("INSERT INTO deals (company_id, contact_id, stage, source, estimated_value, owner_id, closed_at) VALUES (1, 1, 'closed_won', 'referral', 3000, 1, '2026-03-15')").run();
  // Lost deal
  db.prepare("INSERT INTO deals (company_id, contact_id, stage, source, estimated_value, owner_id, lost_reason, closed_at) VALUES (1, 1, 'closed_lost', 'cold', 2500, 1, 'price', '2026-03-20')").run();
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

describe('GET /api/reports/summary', () => {
  test('returns pipeline metrics', async () => {
    const res = await agent.get('/api/reports/summary');
    expect(res.status).toBe(200);
    expect(res.body.summary.activeDeals).toBe(2);
    expect(res.body.summary.pipelineValue).toBe(3500);
    expect(res.body.summary.winRate).toBe(50);
    expect(res.body.summary.totalWon).toBe(1);
    expect(res.body.summary.totalLost).toBe(1);
  });
});

describe('GET /api/reports/sources', () => {
  test('returns deals grouped by source', async () => {
    const res = await agent.get('/api/reports/sources');
    expect(res.body.sources).toHaveLength(2);
  });
});

describe('GET /api/reports/lost-reasons', () => {
  test('returns lost deal reasons', async () => {
    const res = await agent.get('/api/reports/lost-reasons');
    expect(res.body.reasons).toHaveLength(1);
    expect(res.body.reasons[0].lost_reason).toBe('price');
  });
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest server/__tests__/reports.test.js --verbose
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/reports.js server/__tests__/reports.test.js server/index.js
git commit -m "feat: add reports endpoints with pipeline metrics, funnel, sources, lost reasons"
```

---

### Task 6: Update Layout + App Routes

**Files:**
- Modify: `client/src/components/Layout.jsx`
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Add Reports and Settings to navigation**

Update `navItems` in `client/src/components/Layout.jsx`:

```js
const navItems = [
  { to: '/', label: 'Pipeline', icon: '◫' },
  { to: '/tasks', label: 'Tasks', icon: '☑' },
  { to: '/contacts', label: 'Contacts', icon: '☻' },
  { to: '/companies', label: 'Companies', icon: '⌂' },
  { to: '/scripts', label: 'Scripts', icon: '✎' },
  { to: '/reports', label: 'Reports', icon: '▦' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];
```

- [ ] **Step 2: Add routes to App.jsx**

Add imports:
```jsx
import Reports from './pages/Reports';
import Settings from './pages/Settings';
```

Add routes:
```jsx
<Route path="reports" element={<Reports />} />
<Route path="settings" element={<Settings />} />
```

- [ ] **Step 3: Add report API methods to api.js**

```js
  // Reports
  getReportSummary: () => request('/reports/summary'),
  getReportFunnel: () => request('/reports/funnel'),
  getReportSources: () => request('/reports/sources'),
  getReportLostReasons: () => request('/reports/lost-reasons'),
  getReportMonthly: () => request('/reports/monthly'),
```

- [ ] **Step 4: Commit**

```bash
git add client/src/components/Layout.jsx client/src/App.jsx client/src/lib/api.js
git commit -m "feat: add Reports and Settings to navigation and routing"
```

---

### Task 7: Reports Dashboard Page

**Files:**
- Create: `client/src/pages/Reports.jsx`

- [ ] **Step 1: Create the Reports page**

```jsx
import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: '#1B2838', borderRadius: 8, padding: 20, textAlign: 'center',
    }}>
      <div style={{ color: color || '#00D4AA', fontSize: 28, fontWeight: 700 }}>{value}</div>
      <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function Reports() {
  const [summary, setSummary] = useState(null);
  const [funnel, setFunnel] = useState([]);
  const [sources, setSources] = useState([]);
  const [lostReasons, setLostReasons] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getReportSummary(),
      api.getReportFunnel(),
      api.getReportSources(),
      api.getReportLostReasons(),
    ]).then(([sumData, funnelData, srcData, lostData]) => {
      setSummary(sumData.summary);
      setFunnel(funnelData.funnel);
      setSources(srcData.sources);
      setLostReasons(lostData.reasons);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40 }}>Loading reports...</div>;

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Reports</h1>

      {/* Summary cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          <StatCard label="Active Deals" value={summary.activeDeals} />
          <StatCard label="Pipeline Value/mo" value={`$${Number(summary.pipelineValue).toLocaleString()}`} />
          <StatCard label="Win Rate" value={`${summary.winRate}%`} />
          <StatCard label="Avg Deal Cycle" value={summary.avgDealCycle ? `${summary.avgDealCycle}d` : '—'} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Funnel */}
        <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Pipeline Funnel</h3>
          {funnel.map(f => (
            <div key={f.stage} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F7F8FA' }}>
              <span style={{ fontSize: 13 }}>{f.stage.replace('_', ' ')}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#00D4AA' }}>{f.count}</span>
            </div>
          ))}
          {funnel.length === 0 && <div style={{ fontSize: 13, color: '#64748B' }}>No data yet.</div>}
        </div>

        {/* Sources */}
        <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Deals by Source</h3>
          {sources.map(s => (
            <div key={s.source} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F7F8FA' }}>
              <span style={{ fontSize: 13 }}>{s.source}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#00D4AA' }}>{s.count}</span>
            </div>
          ))}
          {sources.length === 0 && <div style={{ fontSize: 13, color: '#64748B' }}>No data yet.</div>}
        </div>

        {/* Lost Reasons */}
        <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Lost Deal Reasons</h3>
          {lostReasons.map(r => (
            <div key={r.lost_reason} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F7F8FA' }}>
              <span style={{ fontSize: 13 }}>{r.lost_reason}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#E6A817' }}>{r.count}</span>
            </div>
          ))}
          {lostReasons.length === 0 && <div style={{ fontSize: 13, color: '#64748B' }}>No lost deals yet.</div>}
        </div>

        {/* Quick stats */}
        {summary && (
          <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Closed Deals</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F7F8FA' }}>
              <span style={{ fontSize: 13 }}>Won</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#00D4AA' }}>{summary.totalWon}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span style={{ fontSize: 13 }}>Lost</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#E6A817' }}>{summary.totalLost}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/Reports.jsx
git commit -m "feat: add Reports dashboard with summary cards, funnel, sources, lost reasons"
```

---

### Task 8: Settings Page

**Files:**
- Create: `client/src/pages/Settings.jsx`
- Modify: `server/routes/settings.js`

- [ ] **Step 1: Implement settings routes**

Replace `server/routes/settings.js`:

```js
const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

router.use(requireAuth);

// Stage actions
router.get('/actions', (req, res) => {
  const actions = req.db.prepare('SELECT * FROM stage_actions ORDER BY stage, sort_order').all();
  res.json({ actions });
});

router.patch('/actions/:id', requireAdmin, (req, res) => {
  const existing = req.db.prepare('SELECT * FROM stage_actions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Action not found' });

  const updates = [];
  const values = [];

  if (req.body.enabled !== undefined) { updates.push('enabled = ?'); values.push(req.body.enabled ? 1 : 0); }
  if (req.body.config !== undefined) { updates.push('config = ?'); values.push(JSON.stringify(req.body.config)); }

  if (updates.length > 0) {
    values.push(req.params.id);
    req.db.prepare(`UPDATE stage_actions SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const action = req.db.prepare('SELECT * FROM stage_actions WHERE id = ?').get(req.params.id);
  res.json({ action });
});

// Users (admin only)
router.get('/users', requireAdmin, (req, res) => {
  const users = req.db.prepare('SELECT id, name, email, role, created_at FROM users').all();
  res.json({ users });
});

router.post('/users', requireAdmin, (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  const existing = req.db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already exists' });

  const hash = bcrypt.hashSync(password, 10);
  const result = req.db.prepare(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
  ).run(name, email, hash, role || 'member');

  const user = req.db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ user });
});

router.delete('/users/:id', requireAdmin, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  req.db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// CLI status check
router.get('/cli-status', (req, res) => {
  const { isCliAvailable } = require('../services/claude-cli');
  res.json({ available: isCliAvailable() });
});

module.exports = router;
```

- [ ] **Step 2: Create Settings page**

Create `client/src/pages/Settings.jsx`:

```jsx
import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import Modal from '../components/Modal';

export default function Settings() {
  const [actions, setActions] = useState([]);
  const [users, setUsers] = useState([]);
  const [cliStatus, setCliStatus] = useState(null);
  const [showNewUser, setShowNewUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'member' });
  const [activeTab, setActiveTab] = useState('actions');

  useEffect(() => {
    api.request('/settings/actions').then(d => setActions(d.actions)).catch(() => {});
    api.request('/settings/users').then(d => setUsers(d.users)).catch(() => {});
    api.request('/settings/cli-status').then(d => setCliStatus(d.available)).catch(() => setCliStatus(false));
  }, []);

  const toggleAction = async (id, enabled) => {
    await api.request(`/settings/actions/${id}`, { method: 'PATCH', body: { enabled: !enabled } });
    const d = await api.request('/settings/actions');
    setActions(d.actions);
  };

  const createUser = async (e) => {
    e.preventDefault();
    await api.request('/settings/users', { method: 'POST', body: newUser });
    setShowNewUser(false);
    setNewUser({ name: '', email: '', password: '', role: 'member' });
    const d = await api.request('/settings/users');
    setUsers(d.users);
  };

  const deleteUser = async (id) => {
    if (!confirm('Delete this user?')) return;
    await api.request(`/settings/users/${id}`, { method: 'DELETE' });
    const d = await api.request('/settings/users');
    setUsers(d.users);
  };

  const tabStyle = (t) => ({
    padding: '8px 16px', fontSize: 13, fontWeight: activeTab === t ? 600 : 400,
    color: activeTab === t ? '#00D4AA' : '#64748B', background: 'none', border: 'none',
    borderBottom: activeTab === t ? '2px solid #00D4AA' : '2px solid transparent', cursor: 'pointer',
  });

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Settings</h1>

      {/* CLI Status */}
      <div style={{
        padding: '10px 16px', borderRadius: 6, marginBottom: 20, fontSize: 13,
        background: cliStatus ? '#E6FAF5' : '#FFF3E0',
        color: cliStatus ? '#00D4AA' : '#E6A817',
        border: `1px solid ${cliStatus ? '#00D4AA' : '#E6A817'}`,
      }}>
        Claude Code CLI: {cliStatus === null ? 'Checking...' : cliStatus ? 'Installed and available' : 'Not installed — AI features disabled'}
      </div>

      <div style={{ borderBottom: '1px solid #E2E6EB', marginBottom: 20 }}>
        <button onClick={() => setActiveTab('actions')} style={tabStyle('actions')}>Stage Actions</button>
        <button onClick={() => setActiveTab('users')} style={tabStyle('users')}>Team</button>
      </div>

      {activeTab === 'actions' && (
        <div>
          {actions.map(a => (
            <div key={a.id} style={{
              background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8,
              padding: 14, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{a.stage.replace('_', ' ')}</span>
                <span style={{ fontSize: 12, color: '#64748B', marginLeft: 8 }}>{a.action_type}</span>
              </div>
              <button
                onClick={() => toggleAction(a.id, a.enabled)}
                style={{
                  padding: '4px 12px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
                  background: a.enabled ? '#00D4AA' : '#E2E6EB',
                  color: a.enabled ? '#1B2838' : '#64748B',
                  border: 'none', fontWeight: 600,
                }}
              >
                {a.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'users' && (
        <div>
          <button
            onClick={() => setShowNewUser(true)}
            style={{
              background: '#00D4AA', color: '#1B2838', border: 'none', borderRadius: 6,
              padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer', marginBottom: 16,
            }}
          >
            + Add Team Member
          </button>

          {users.map(u => (
            <div key={u.id} style={{
              background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8,
              padding: 14, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{u.name}</span>
                <span style={{ fontSize: 12, color: '#64748B', marginLeft: 8 }}>{u.email}</span>
                <span style={{
                  fontSize: 11, marginLeft: 8, padding: '2px 8px', borderRadius: 3,
                  background: u.role === 'admin' ? '#00D4AA' : '#F7F8FA',
                  color: u.role === 'admin' ? '#1B2838' : '#64748B',
                }}>{u.role}</span>
              </div>
              <button onClick={() => deleteUser(u.id)} style={{
                background: 'none', border: 'none', color: '#E6A817', cursor: 'pointer', fontSize: 12,
              }}>Remove</button>
            </div>
          ))}

          <Modal open={showNewUser} onClose={() => setShowNewUser(false)} title="Add Team Member">
            <form onSubmit={createUser}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Name</label>
                <input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} required
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Email</label>
                <input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Password</label>
                <input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Role</label>
                <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }}>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button type="submit" style={{
                width: '100%', padding: '10px 0', background: '#00D4AA', color: '#1B2838',
                border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>Create User</button>
            </form>
          </Modal>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add generic request method to api.js**

Add to `client/src/lib/api.js` at the top of the `api` object:

```js
  request: (path, options = {}) => request(path, options),
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/settings.js client/src/pages/Settings.jsx client/src/lib/api.js
git commit -m "feat: add Settings page with stage action toggles and team management"
```

---

### Task 9: Add "Generate with AI" to ScriptViewer

**Files:**
- Modify: `client/src/components/ScriptViewer.jsx`

- [ ] **Step 1: Add generation button and status**

Add to the ScriptViewer component, after the script selector tabs and before the content rendering:

```jsx
const [generating, setGenerating] = useState(false);
const [aiContent, setAiContent] = useState(null);
const [generationError, setGenerationError] = useState(null);

const generateWithAI = async (promptType) => {
  setGenerating(true);
  setGenerationError(null);
  try {
    await api.request(`/deals/${deal.id}/generate`, { method: 'POST', body: { prompt_type: promptType } });
    // Poll for completion
    const poll = setInterval(async () => {
      const status = await api.request(`/deals/${deal.id}/generation-status`);
      const latest = status.jobs[0];
      if (latest && latest.status !== 'running') {
        clearInterval(poll);
        setGenerating(false);
        if (latest.status === 'completed') {
          setAiContent(latest.output);
        } else {
          setGenerationError(latest.error || 'Generation failed');
        }
      }
    }, 5000);
  } catch (err) {
    setGenerating(false);
    setGenerationError(err.message);
  }
};
```

Add the button after the script selector tabs:

```jsx
<div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
  <button
    onClick={() => generateWithAI(getPromptTypesForStage(deal.stage))}
    disabled={generating}
    style={{
      padding: '6px 14px', fontSize: 12, borderRadius: 4,
      background: generating ? '#F7F8FA' : '#1B2838', color: generating ? '#64748B' : '#00D4AA',
      border: 'none', cursor: generating ? 'not-allowed' : 'pointer', fontWeight: 600,
    }}
  >
    {generating ? 'Generating...' : '✨ Generate with AI'}
  </button>
</div>

{generationError && (
  <div style={{ background: '#FFF3E0', color: '#E6A817', padding: '8px 12px', borderRadius: 4, fontSize: 12, marginBottom: 12 }}>
    {generationError}
  </div>
)}

{aiContent && (
  <div style={{ marginBottom: 16 }}>
    <div style={{ fontSize: 12, fontWeight: 600, color: '#00D4AA', marginBottom: 4 }}>AI Generated Content</div>
    <div style={{
      background: '#fff', border: '2px solid #00D4AA', borderRadius: 8, padding: 16,
      whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6,
    }}>
      {aiContent}
    </div>
    <button
      onClick={() => navigator.clipboard.writeText(aiContent)}
      style={{
        marginTop: 8, padding: '6px 16px', fontSize: 12, background: '#00D4AA',
        color: '#1B2838', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
      }}
    >
      Copy AI Content
    </button>
  </div>
)}
```

Add the helper function inside the component:

```jsx
const getPromptTypesForStage = (stage) => {
  switch (stage) {
    case 'outreach': return 'outreach_emails';
    case 'discovery_call': return 'outreach_call';
    case 'follow_up': return 'followup_emails';
    default: return 'generic';
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/ScriptViewer.jsx
git commit -m "feat: add Generate with AI button to ScriptViewer with polling for results"
```

---

### Task 10: End-to-End Verification

- [ ] **Step 1: Run full test suite**

```bash
npx jest --verbose
```

Expected: All tests pass.

- [ ] **Step 2: Start dev servers**

```bash
npm run dev
```

- [ ] **Step 3: Verify Phase 3 features**

Open `http://localhost:5173` and verify:

1. **Reports page** — shows summary cards (active deals, pipeline value, win rate, avg cycle), funnel, sources, lost reasons
2. **Settings page** — stage actions listed with enable/disable toggles. CLI status indicator shows installed/not installed. Team management lets you add/remove users.
3. **Deal detail → Scripts tab** — "Generate with AI" button appears. If CLI is installed, clicking it starts generation and polls for results. Generated content appears with mint border.
4. **Stage change triggers** — drag a deal to Discovery Call. If CLI is installed, analysis deck generation starts automatically (check generation-status endpoint).
5. **Copy buttons** — both template content and AI-generated content can be copied to clipboard.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: Phase 3 complete — AI generation, reports, settings, full CRM operational"
```
