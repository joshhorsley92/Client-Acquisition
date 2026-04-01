# TKBS CRM — Design Spec

## Overview

A browser-based CRM for TKBS that manages the full client acquisition pipeline from lead gathering through close. Built for a small team (2-5 users), it integrates with existing Claude Code skills (initial analysis, proposals) via webhooks, provides sales scripts and email templates at every stage, and offers AI-generated content using Alex Hormozi's sales methodology.

**Stack:** Node.js (Express) + SQLite + React
**Auth:** Email/password, session-based. Admin + Member roles.
**Deployment:** Self-hosted on a VPS. Single process.
**Prerequisite:** Claude Code CLI installed on the host machine (`npm install -g @anthropic-ai/claude-code`).

## Pipeline Stages

Six stages, plus Closed Lost (reachable from any stage):

| # | Stage | Purpose |
|---|-------|---------|
| 1 | Lead | New prospect enters the system |
| 2 | Outreach | First contact attempts |
| 3 | Discovery Call | Meeting scheduled or completed |
| 4 | Proposal | Post-call, building/sending proposal |
| 5 | Follow-Up | Proposal sent, awaiting decision |
| 6 | Closed Won | Deal signed |
| — | Closed Lost | Deal lost (from any stage) |

Stages are configurable — the user can rename, add, or reorder stages via Settings without code changes. The six above are defaults.

## Data Model

### Contact

| Field | Type | Notes |
|-------|------|-------|
| id | integer | Primary key |
| name | text | Required |
| email | text | |
| phone | text | |
| role | text | Job title / role |
| preferred_contact | text | email, phone, text, linkedin |
| notes | text | Free-form |
| company_id | integer | FK → Company |
| created_at | datetime | |
| updated_at | datetime | |

### Company

| Field | Type | Notes |
|-------|------|-------|
| id | integer | Primary key |
| name | text | Required |
| location | text | City, State |
| industry | text | |
| type | text | B2B or B2C |
| website | text | |
| social_links | json | LinkedIn, Facebook, Instagram URLs |
| employee_count | text | |
| revenue_estimate | text | |
| notes | text | |
| created_at | datetime | |
| updated_at | datetime | |

### Deal

| Field | Type | Notes |
|-------|------|-------|
| id | integer | Primary key |
| contact_id | integer | FK → Contact |
| company_id | integer | FK → Company |
| stage | text | Current pipeline stage |
| source | text | referral, cold, web, content, paid_ads |
| source_detail | text | e.g., "Referral from Dave" |
| estimated_value | decimal | Monthly recurring value |
| package_type | text | boost, launch, both, undecided |
| services_discussed | json | Array of service names from catalog |
| pricing_notes | text | Notes from pricing discussions |
| call_notes | text | Discovery call notes |
| research_findings | text | Key findings from initial research or analysis skill output |
| objections_noted | text | Objections raised during conversations |
| lost_reason | text | If Closed Lost: price, timing, competitor, ghosted, other |
| owner_id | integer | FK → User (team member assigned) |
| stage_entered_at | datetime | When deal entered current stage |
| created_at | datetime | |
| updated_at | datetime | |
| closed_at | datetime | |

### Activity

| Field | Type | Notes |
|-------|------|-------|
| id | integer | Primary key |
| deal_id | integer | FK → Deal |
| contact_id | integer | FK → Contact |
| type | text | email, call, meeting, note, stage_change, system |
| content | text | Summary or full content |
| metadata | json | Extra data (e.g., email subject, call duration) |
| created_by | integer | FK → User |
| created_at | datetime | |

### Task

| Field | Type | Notes |
|-------|------|-------|
| id | integer | Primary key |
| deal_id | integer | FK → Deal |
| description | text | What needs to be done |
| due_at | datetime | Specific date and time |
| status | text | pending, done, overdue |
| auto_generated | boolean | Created by stage trigger vs manually |
| template_key | text | Which script template to surface (nullable) |
| created_at | datetime | |
| completed_at | datetime | |

### Document

| Field | Type | Notes |
|-------|------|-------|
| id | integer | Primary key |
| deal_id | integer | FK → Deal |
| type | text | analysis_deck, proposal, other |
| file_path | text | Path to generated file |
| file_name | text | Display name |
| generated_at | datetime | |
| created_at | datetime | |

### User

| Field | Type | Notes |
|-------|------|-------|
| id | integer | Primary key |
| name | text | |
| email | text | Unique, used for login |
| password_hash | text | bcrypt |
| role | text | admin or member |
| created_at | datetime | |

### StageAction

| Field | Type | Notes |
|-------|------|-------|
| id | integer | Primary key |
| stage | text | Which stage triggers this |
| action_type | text | create_tasks, start_cadence, trigger_skill, record |
| config | json | Action-specific configuration |
| enabled | boolean | Can be toggled on/off |
| order | integer | Execution order within stage |

### ScriptTemplate

| Field | Type | Notes |
|-------|------|-------|
| id | integer | Primary key |
| stage | text | Which stage this belongs to |
| name | text | Display name |
| type | text | email, call_script, objection, checklist, follow_up |
| format | text | "markdown" (default) or "structured" (future: JSON decision tree) |
| content | text | Markdown with merge fields (or JSON if format=structured) |
| sort_order | integer | Display order within stage |
| created_at | datetime | |
| updated_at | datetime | |

### GenerationJob

| Field | Type | Notes |
|-------|------|-------|
| id | integer | Primary key |
| deal_id | integer | FK → Deal |
| type | text | analysis_deck, proposal, ai_content |
| status | text | running, completed, failed |
| output | text | File path or generated content |
| error | text | Error message if failed |
| started_at | datetime | |
| completed_at | datetime | |

### Relationships

- A Company has many Contacts
- A Contact can have many Deals
- A Deal has many Activities, Tasks, and Documents
- A Deal belongs to one pipeline stage at a time
- Each Deal is assigned to one User (owner)
- ScriptTemplates are grouped by stage and displayed on the deal detail view

## Stage-Triggered Actions

When a deal moves to a new stage, the system fires the configured actions for that stage. Every action shows a confirmation dialog: "This will trigger [action]. Run now / Skip / Run later."

### Default Stage Actions

**Lead:**
- Create task: "Research prospect" (due: same day)
- Create task: "Send first outreach" (due: next business day)
- Load research checklist template

**Outreach:**
- Start follow-up reminder cadence: tasks at day 3, 7, 14
- Each reminder task links to the next email template in the outreach sequence
- Auto-flag deal as "stale" after 21 days with no activity

**Discovery Call:**
- Trigger initial analysis skill via Claude Code CLI
  - Command: `claude --print "Build a presentation for {company}, {contact}, located in {location}, {industry} business, {type}. Additional context: {source_detail}, {notes}"`
  - Runs async — deal shows "Generating analysis deck..." status
  - Output .pptx linked to deal as a Document
- Create task: "Prep for discovery call" (due: 1 day before meeting if date set)
- Create task: "Log call notes" (due: same day as meeting)

**Proposal:**
- Trigger proposal skill via Claude Code CLI
  - Command includes: company name, contact, services discussed, package type, pricing notes, call notes
  - Runs async — deal shows "Generating proposal..." status
  - Output .docx/.pdf linked to deal as a Document
- Create task: "Send proposal" (due: next business day)

**Follow-Up:**
- Start post-proposal cadence: tasks at day 1, 4, 10, 21
  - Day 1: Thank-you + recap
  - Day 4: Check-in
  - Day 10: Value-add (case study / insight)
  - Day 21: Break-up email
- Each task links to the corresponding template

**Closed Won:**
- Record deal value and close date
- Create task: "Send welcome email" (due: same day)
- Create task: "Schedule kickoff meeting" (due: next business day)
- Create task: "Send onboarding checklist" (due: 2 business days)

**Closed Lost:**
- Record lost reason (required field on stage change)
- Log final activity
- All pending tasks on the deal are auto-cancelled

## Manual Follow-Up Scheduling

In addition to auto-generated cadences, users can schedule manual follow-ups from the deal detail view. Two input methods:

1. **Natural language:** Type "3 days at 8AM" or "next Tuesday at 2PM" — parsed into a specific datetime using the `chrono-node` library
2. **Date/time picker:** Standard calendar + time selector as fallback

Manual follow-ups override the next auto-generated reminder in the cadence. If a prospect says "call me Thursday at 8AM," that manual task replaces whatever the cadence had next. The cadence resumes after the manual task is completed.

## Scripts & Templates

### Two-Level System

**Level 1: Template Fill (default, free)**
Pre-written Markdown templates with merge fields (`{company}`, `{contact}`, `{industry}`, `{location}`, `{source}`, `{referrer}`, `{services}`, `{package_type}`). The CRM fills merge fields from deal/contact/company data and renders the result. User copies and sends.

**Level 2: AI-Generated (on-demand, per deal)**
A "Generate with AI" button on each stage that triggers Claude Code CLI to produce fully custom content for that deal. Uses the Hormozi methodology prompt (see below). Output replaces the template view for that deal/stage.

### Template Library by Stage

**Lead Stage:**
- Research checklist
- Lead qualification scorecard
- Internal notes template

**Outreach Stage:**
- Warm referral intro email
- Cold email #1 (value-first, gap-specific)
- Cold email #2 (follow-up, new angle, day 3)
- Cold email #3 (break-up, day 10)
- Cold outreach call script
- LinkedIn/social DM template

**Discovery Call Stage:**
- Meeting confirmation email
- Pre-call research brief (auto-filled from analysis skill output)
- Discovery call script (CLOSER framework)
- Post-call notes template

**Proposal Stage:**
- Proposal delivery email
- Proposal walkthrough script (if presenting live)
- Pricing justification talking points

**Follow-Up Stage:**
- Day 1: Thank-you + recap email
- Day 4: Check-in email
- Day 10: Value-add email (case study share)
- Day 21: Break-up email
- Objection handling scripts (price, timing, trust, "do it myself")

**Closed Won Stage:**
- Welcome/congratulations email
- Onboarding checklist
- Kickoff meeting agenda template

### Call Script Presentation (Step-by-Step Viewer)

Call scripts with `type: "call_script"` get a special UI treatment. Instead of rendering as a flat Markdown wall, the deal detail view presents them as a guided stepper:

1. **One CLOSER step at a time** — the viewer shows the current step (e.g., "CLARIFY") with its prompts, questions, and suggested language. Navigation buttons move forward/back through steps.
2. **Expandable conditional branches** — within each step, "If they say X" sections are collapsed by default. Click to expand the relevant response when the prospect raises that point.
3. **Merge fields filled** — the script references the prospect's actual company, industry, and situation throughout.
4. **Progress indicator** — shows where you are in the CLOSER flow (C → L → O → S → E → R).

**Markdown conventions for call scripts:**
```markdown
## Step: CLARIFY
Opening questions and prompts here...

### If: "We're not really looking for marketing help"
Response language here...

### If: "How did you find us?"
Response language here...

## Step: LABEL
Reflect back what you heard...
```

The viewer parses `## Step:` headers as stepper steps and `### If:` headers as collapsible conditional branches. This convention keeps scripts editable as plain Markdown while enabling the interactive UI.

**Future (v2+):** The `format: "structured"` option on ScriptTemplate will support a JSON decision tree format, enabling a full interactive decision tree UI where clicking a prospect response automatically navigates to the right branch. The stepper viewer is the stepping stone to that.

### Template Storage

Templates are stored in the ScriptTemplate table and editable through the CRM's Settings → Scripts UI. No file system editing required, though an initial seed migration populates the defaults.

## Alex Hormozi Sales Methodology — AI Generation Prompts

When the "Generate with AI" button is clicked, the CRM constructs a prompt that includes the deal context and Hormozi framework instructions, then invokes Claude Code CLI. The prompt structure varies by stage.

### Core Hormozi Frameworks Embedded in All Prompts

**Value Equation:**
Every piece of generated content must address all four variables:
- **Dream Outcome:** What the prospect actually wants (not "marketing services" but "a full calendar of booked appointments")
- **Perceived Likelihood:** Why they should believe it'll work (proof, specificity, guarantees)
- **Time Delay:** How fast they'll see results (emphasize early wins)
- **Effort & Sacrifice:** How little they have to do ("done for you" framing)

**Grand Slam Offer Framing:**
When generating proposals or offer-related content:
- Give the offer a proprietary name (e.g., "The Local Domination Engine")
- Stack value with named bonuses and individual dollar values
- Include a guarantee that reverses risk
- Use genuine urgency (limited client slots, capacity-based)
- Never discount — adjust scope instead

**Lead Source Awareness:**
Generated content adapts based on deal source:
- Warm outreach: personal, referral-leveraging, lower friction asks
- Cold outreach: value-first, personalized observation, small CTA
- Content/inbound: acknowledge their engagement, build on their interest
- Paid ads: reference the specific offer/lead magnet they responded to

### Stage-Specific AI Prompts

**Outreach — Email Sequence Generation:**

```
Generate a {warm/cold} outreach email sequence for {contact} at {company} ({industry}, {type}, {location}).

Context:
- Source: {source} — {source_detail}
- Their business: {company_notes}
- Known gaps: {research_findings}
- Services we'd likely recommend: {services_discussed}

Follow Alex Hormozi's outreach methodology:
- Email 1: Lead with a specific, genuine observation about their business. Provide an insight or value upfront. End with a small ask (10-min call, send over findings). No pitch.
- Email 2 (day 3): Different angle. Share a relevant result from a similar business. Keep the CTA soft.
- Email 3 (day 7): Value bomb — offer to send a free audit, teardown, or specific recommendations. Make it about THEM, not you.
- Email 4 (day 14): Direct but respectful check-in. Reference previous value shared.
- Email 5 (day 21): Break-up email. "I'm going to stop reaching out, but if anything changes, I'm here." Create a pattern interrupt.

Value Equation rules:
- Every email must reference their specific dream outcome (more clients, predictable growth, etc.)
- Build perceived likelihood with specificity (mention their actual industry, location, situation)
- Minimize perceived effort ("we handle everything — you just answer the phone")
- Collapse time delay ("first campaign live within 48 hours of onboarding")

Tone: Consultative, confident, not pushy. You're a doctor diagnosing, not a car salesman pressuring. Willingness to walk away is the most powerful frame.

Output each email with: subject line, body, and send timing.
```

**Outreach — Call Script Generation:**

```
Generate a cold/warm outreach call script for calling {contact} at {company} ({industry}, {type}, {location}).

Context:
- Source: {source} — {source_detail}
- Their business: {company_notes}
- Known gaps: {research_findings}

Follow Alex Hormozi's CLOSER framework:
1. CLARIFY — Open with a brief, human intro. Ask what's going on with their marketing. Let them talk. Listen.
2. LABEL — Reflect back what you heard. Name the problem clearly. Get them to agree: "Is that fair?"
3. OVERVIEW — Ask what they've tried before. What worked? What didn't? Why do they think it failed? (This lets you differentiate.)
4. SELL THE SOLUTION — Present the approach (not the product) in 3 simple steps. Sell the "what" and "why" before the "who."
5. EXPLAIN CONCERNS — Proactively address likely objections based on their situation. Use Hormozi frameworks:
   - Price: "If you KNEW it would work, would the price still be an issue?" → restack proof and guarantee
   - Trust/burned before: "You SHOULD be skeptical. That's why we [guarantee]." → stack proof
   - Timing/stall: "What specifically do you need to think about?" → surface the real objection
   - "I can do it myself": "The question isn't whether you can — it's whether you should."
6. REINFORCE — Ask for the close. Then reinforce the decision immediately. Move to next steps.

Include conditional branches: if they say X, respond with Y.
Tone: Curious, consultative, confident. Ask more than you tell.
```

**Follow-Up — Post-Proposal Sequence:**

```
Generate a post-proposal follow-up email sequence for {contact} at {company}.

Context:
- Proposal sent: {proposal_type} ({package_type})
- Services proposed: {services_discussed}
- Estimated value: {estimated_value}/mo
- Call notes: {call_notes}
- Known concerns: {objections_noted}

Follow Hormozi's follow-up methodology:
- NEVER send "just checking in" or "circling back." Every touchpoint must provide value.
- Day 1: Thank-you + recap what was discussed. Reinforce dream outcome. Mention one specific thing from the call that showed you listened.
- Day 4: Check-in with value. Share a relevant insight, quick tip, or case study result. End with: "Any questions about the proposal?"
- Day 10: Value bomb. Send something genuinely useful — a mini-audit of one specific thing, a competitor insight, an industry stat. Position it as "I came across this and thought of {company}."
- Day 21: Break-up email. "I've reached out a few times and haven't heard back, so I'm going to assume the timing isn't right. Totally okay. If anything changes, I'm here." This creates a pattern interrupt and often re-engages prospects.

If objections were noted during the call, weave responses into the appropriate emails:
- Price concern → Day 4 email should include ROI framing
- Trust concern → Day 4 email should include proof/case study
- Timing concern → Day 10 email should include cost-of-inaction framing

Value Equation in every email:
- Dream outcome: reference their specific goals from the call
- Perceived likelihood: mention specific results from similar clients
- Time delay: emphasize fast start and early wins
- Effort: remind them it's done-for-you

Output each email with: subject line, body, and send timing.
```

**Follow-Up — Objection Handling Scripts:**

```
Generate objection handling scripts for {contact} at {company}, customized to their situation.

Context:
- Services proposed: {services_discussed}
- Estimated value: {estimated_value}/mo
- Call notes: {call_notes}
- Their industry: {industry}
- Their concerns: {objections_noted}

For each objection, follow Hormozi's framework — objections are unresolved concerns in the Value Equation, not resistance to overcome:

1. "Too expensive" / Price objection:
   - Diagnose: Is it a value problem or a cash problem?
   - If value: "If you KNEW it would work, would the price still be an issue?" → restack proof, guarantee, ROI math
   - If cash: Offer to adjust scope (remove a component, phase the rollout). NEVER discount.
   - Cost of inaction: "What's it costing you right now to NOT have a steady stream of clients?"

2. "I need to think about it" / Stall:
   - "What specifically do you need to think about? Is it [money], [whether it'll work], or [something else]?"
   - Force the real objection to surface, then address it directly
   - Two Decisions reframe: "You've got two decisions — do you want [dream outcome]? And who are you going to do it with?"

3. "I've been burned before" / Trust:
   - Validate: "You SHOULD be skeptical. Most agencies over-promise."
   - Differentiate: "Here's specifically what we do differently..."
   - Proof stack: case study from similar business, guarantee, specific metrics

4. "Not the right time":
   - "When would be the right time? ... And what changes between now and then?"
   - Cost of waiting: "Every month without [system] is [X] potential clients you're missing"

5. "I can do it myself":
   - "You absolutely could. The question is whether you SHOULD. Is your time better spent [their core skill] or learning to run Facebook ads?"

After handling each objection, always re-ask: "Does that make sense? Great. So should we get started this week or next?"

Make all scripts specific to {company}'s industry, size, and stated goals. Use their actual numbers where available.
```

### Hormozi Methodology — Key Principles for All AI Content

These rules apply to every AI-generated piece regardless of stage:

1. **Lead with value, not features.** Never list what you do. Describe what they get.
2. **Specificity beats generics.** Reference their actual business name, industry, location, gaps, and goals. Never say "businesses like yours."
3. **Dream outcome language.** Not "digital marketing services" but "a predictable system that fills your calendar every month without you lifting a finger."
4. **Proof over promises.** Every claim backed by a case study, metric, or guarantee. If no case study exists yet, use industry benchmarks with source.
5. **Small CTAs first.** First contact asks for a conversation, not a purchase. "Worth a 10-minute call?" not "Ready to sign up?"
6. **Never "just checking in."** Every follow-up provides value — an insight, a resource, a case study, a specific observation.
7. **Risk reversal through guarantees.** Frame guarantees boldly. "If we don't [specific result] in [timeframe], [consequence]."
8. **Scarcity must be real.** "We onboard 5 clients/month because quality requires it" — not fake countdown timers.
9. **Never discount. Adjust scope.** If price is an issue, remove a component or phase the engagement. Discounting trains prospects to negotiate and devalues the offer.
10. **The break-up creates urgency.** The final follow-up in any sequence should be a gracious walk-away. This often re-engages prospects.

## Webhook Architecture

### Internal Event System

Stage changes fire events within the Express server. No external webhook service needed. Flow:

1. User drags deal to new stage (or clicks "Move to [stage]")
2. API endpoint: `PATCH /api/deals/:id` with new stage
3. Server fires `stage_changed` event
4. Event handler reads StageAction table for the new stage
5. Confirmation dialog shown to user (unless action is non-destructive like task creation)
6. Actions execute in configured order

### Claude Code CLI Invocation

For skill triggers (Discovery Call → analysis, Proposal → proposal generation):

1. Server spawns child process: `claude --print "{constructed_prompt}"`
2. Deal status updated to "generating..." with a spinner in the UI. The `GenerationJob` table tracks active jobs (deal_id, type, status, started_at).
3. Process runs async — user can continue working. Frontend polls `GET /api/deals/:id/generation-status` every 5 seconds while a job is active.
4. On completion:
   - Output file path stored in Document table, linked to deal
   - Deal status updated, activity logged
   - If a Claude Code hook is configured, it can POST back to the CRM API for additional metadata
5. On failure:
   - Error logged as activity on the deal
   - Task created: "Manually generate [document type]"

### Claude Code Hook (Return Path)

Optional: configure a Claude Code hook that fires after skill completion and POSTs to the CRM API:

```
POST /api/deals/:id/documents
{
  "type": "analysis_deck",
  "file_path": "/path/to/output.pptx",
  "metadata": { "slide_count": 8, "services_included": [...] }
}
```

This enables the skill to push richer metadata back to the CRM than the CLI spawn alone provides.

### AI Content Generation (Level 2)

For "Generate with AI" button clicks:

1. CRM constructs the stage-appropriate Hormozi prompt (see above) with deal context
2. Spawns `claude --print "{prompt}"`
3. Output stored as generated content on the deal for that stage
4. Displayed in the deal detail view, replacing the template fill

## UI & Dashboard

### Navigation

Sidebar with these views:
- **Pipeline** (home) — Kanban board
- **Tasks** — Daily action list
- **Contacts** — Contact/company directory
- **Companies** — Company list with linked contacts and deals
- **Reports** — Metrics dashboard
- **Scripts** — Template library editor
- **Settings** — Stage config, actions, team, webhooks

### Pipeline Board

Kanban-style drag-and-drop board. Each column is a pipeline stage.

**Deal cards show:**
- Company name
- Contact name
- Estimated deal value (monthly)
- Days in current stage
- Status indicators:
  - Amber: overdue tasks
  - Mint: completed trigger (deck ready, proposal generated)
  - Red: stale (no activity for 21+ days)
- Source badge (referral, cold, web)

**Interactions:**
- Drag to move between stages (fires stage action with confirmation)
- Click to open deal detail
- "+" button on any column to create a new deal in that stage
- Filter by: owner, source, date range
- Sort within column by: value, age, last activity

### Deal Detail View

Single page showing everything about a deal:

**Header:** Company name, contact name, stage badge, package type, estimated value

**Tabs or sections:**
1. **Overview** — Contact info, company info, deal metadata, stage history
2. **Tasks** — Pending and completed tasks. "Schedule follow-up" button with natural language input and date/time picker. Manual follow-ups override the next auto-cadence task.
3. **Scripts** — Templates for current stage with merge fields filled. "Generate with AI" button. Both template and AI-generated versions accessible.
4. **Activity** — Timeline of all interactions (emails sent, calls made, notes, stage changes, system events)
5. **Documents** — Linked files (analysis decks, proposals). Download links. Generation status.

### Task Dashboard

The "no lead falls through the cracks" view.

**Sections:**
1. **Overdue** (red) — Past-due tasks, sorted by how overdue
2. **Today** — Tasks due today
3. **Upcoming** — Next 7 days
4. **Completed** (collapsed) — Recently completed tasks

Each task shows: description, linked deal/company, due date/time, template link if applicable.

**Speed to Lead alert:** If a deal enters "Lead" stage and no activity is logged within 5 minutes, a persistent alert appears at the top of the dashboard.

### Reports (v1 — Simple)

Dashboard with key metrics:
- Active deals (count)
- Pipeline value (total estimated monthly recurring)
- Win rate (Closed Won / total closed)
- Average deal cycle (days from Lead to Closed Won)
- Deals by source (pie/bar chart)
- Stage conversion rates (funnel)
- Lost deal reasons (breakdown)
- Monthly revenue closed (trend)

### Auth

- Email + password login
- bcrypt password hashing
- Session-based auth with secure, httpOnly cookies
- Two roles:
  - **Admin** (Josh): manage users, edit settings, configure stage actions, edit scripts
  - **Member**: manage deals, contacts, tasks, log activities

## Project Structure

```
tkbs-crm/
├── package.json
├── server/
│   ├── index.js                  # Express app entry
│   ├── db/
│   │   ├── schema.sql            # SQLite schema
│   │   ├── seed.sql              # Default stage actions, script templates
│   │   └── migrations/           # Future schema changes
│   ├── routes/
│   │   ├── auth.js               # Login, logout, session
│   │   ├── deals.js              # CRUD + stage changes
│   │   ├── contacts.js           # CRUD
│   │   ├── companies.js          # CRUD
│   │   ├── tasks.js              # CRUD + completion
│   │   ├── activities.js         # Log activities
│   │   ├── documents.js          # Upload, link, list
│   │   ├── scripts.js            # Template CRUD
│   │   ├── reports.js            # Aggregation queries
│   │   └── settings.js           # Stage actions, user management
│   ├── services/
│   │   ├── stage-actions.js      # Event handler for stage changes
│   │   ├── claude-cli.js         # Spawn Claude Code CLI
│   │   ├── template-engine.js    # Merge field replacement
│   │   ├── task-scheduler.js     # Cadence management, overdue detection
│   │   └── ai-prompts.js         # Hormozi prompt construction by stage
│   └── middleware/
│       └── auth.js               # Session validation, role checks
├── client/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/
│   │   │   ├── Pipeline.jsx      # Kanban board
│   │   │   ├── DealDetail.jsx    # Deal view with tabs
│   │   │   ├── Tasks.jsx         # Task dashboard
│   │   │   ├── Contacts.jsx      # Contact/company directory
│   │   │   ├── Companies.jsx     # Company list
│   │   │   ├── Reports.jsx       # Metrics dashboard
│   │   │   ├── Scripts.jsx       # Template editor
│   │   │   ├── Settings.jsx      # Admin settings
│   │   │   └── Login.jsx         # Auth
│   │   ├── components/
│   │   │   ├── DealCard.jsx      # Pipeline card
│   │   │   ├── ActivityTimeline.jsx
│   │   │   ├── ScriptViewer.jsx  # Template render + AI generate button
│   │   │   ├── TaskList.jsx
│   │   │   ├── FollowUpScheduler.jsx  # Natural language + date picker
│   │   │   └── StageActionConfirm.jsx # Confirmation dialog
│   │   └── lib/
│   │       └── api.js            # API client
│   └── index.html
└── scripts/
    └── setup.sh                  # Install deps, init DB, seed data
```

## API Endpoints (Summary)

### Auth
- `POST /api/auth/login` — email + password → session cookie
- `POST /api/auth/logout` — clear session
- `GET /api/auth/me` — current user

### Deals
- `GET /api/deals` — list (filterable by stage, owner, source)
- `GET /api/deals/:id` — detail with related data
- `POST /api/deals` — create
- `PATCH /api/deals/:id` — update (stage change triggers actions)
- `DELETE /api/deals/:id` — soft delete

### Contacts & Companies
- Standard CRUD for both
- `GET /api/companies/:id/contacts` — contacts for a company
- `GET /api/contacts/:id/deals` — deals for a contact

### Tasks
- `GET /api/tasks` — list (filterable by status, due date, deal)
- `POST /api/tasks` — create (manual follow-up)
- `PATCH /api/tasks/:id` — update (mark done, reschedule)

### Activities
- `GET /api/deals/:id/activities` — timeline for a deal
- `POST /api/deals/:id/activities` — log an activity

### Documents
- `GET /api/deals/:id/documents` — documents for a deal
- `POST /api/deals/:id/documents` — link a document (also used by Claude Code hook)

### Scripts
- `GET /api/scripts?stage=outreach` — templates for a stage
- `POST /api/scripts` — create template
- `PATCH /api/scripts/:id` — edit template
- `POST /api/deals/:id/generate` — trigger AI content generation for current stage

### Reports
- `GET /api/reports/summary` — dashboard metrics
- `GET /api/reports/funnel` — stage conversion rates
- `GET /api/reports/sources` — deals by source
- `GET /api/reports/lost-reasons` — Closed Lost breakdown

### Settings
- `GET /api/settings/stages` — stage configuration
- `PATCH /api/settings/stages` — update stages
- `GET /api/settings/actions` — stage actions
- `PATCH /api/settings/actions/:id` — update action
- CRUD for users (admin only)

## TKBS Branding

Uses existing TKBS brand palette for visual consistency:

| Token | Hex | Usage |
|-------|-----|-------|
| Deep Charcoal | #1B2838 | Dark backgrounds, headers, text |
| Electric Mint | #00D4AA | Accents, CTAs, success states |
| White | #FFFFFF | Backgrounds, text on dark |
| Cool Gray | #64748B | Secondary text |
| Content BG | #F7F8FA | Light backgrounds |
| Amber | #FFF3E0 | Warning states, overdue indicators |
| Amber Border | #E6A817 | Warning text, stale deals |

Typography: System font stack (no custom fonts needed for v1).

## Out of Scope for v1

- Email sending integration (Gmail, SMTP) — v1 is copy-to-clipboard
- Calendar integration (Google Calendar, Outlook)
- Mobile app or responsive mobile UI
- Multi-pipeline support (e.g., separate pipelines for B2B vs B2C)
- Client-facing portal
- File upload for documents (v1 links to file paths)
- Notifications (email/SMS/push for task reminders) — v1 shows in-app only
- Import/export (CSV import of existing leads)

These can be added incrementally. The data model supports all of them without schema changes.
