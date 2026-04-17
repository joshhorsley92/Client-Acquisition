# TKBS Ecosystem Plan — Client-Acquisition CRM ↔ Customer Dashboards

**Date:** 2026-04-10
**Author:** Joe Zolinski (w/ Claude planning)
**Status:** Draft — awaiting Joe's review/revision
**Supersedes parts of:** Josh's earlier phase plans in `docs/plans/2026-03-31-*` and `docs/plans/2026-04-*`

---

## 1. Strategic framing

TKBS is a marketing company that builds marketing assets and tracks analytics for clients. The strategic direction for this CRM is to **apply TKBS's own marketing methodology to TKBS itself, at larger scale** — track TKBS's client intake the same way the Dashboard tracks clients' marketing funnels.

Three concrete initiatives drive the work:

1. **Call → Brand Profile automation** — record discovery calls, transcribe, use Claude to synthesize a Brand Profile matching the Dashboard schema exactly, with zero manual data entry.
2. **Revenue-prediction CRM** — not just deal tracking. The CRM's job is to tell Josh which prospects are worth pursuing and where to spend his time. Bang-for-buck scoring, fit scoring, effort-vs-value visualization.
3. **In-house only access** — deployment-level isolation, not just app-level auth. The CRM must not be reachable from outside TKBS.

Everything in this plan maps to one of those three.

---

## 2. Key findings (what I learned before planning)

### 2.1 The Brand Profile already exists and is production-grade

Location: `c:/New folder/TKBS_CustomerDashboards/tkbs-mvp-schema-v1.1-migration-safe.sql` (table `brand_profiles`, ~lines 159-250). TypeScript types in `types/database.ts`.

**Structure — 5 sections:**

1. **Business Identity** (scalar columns): `business_name`, `industry`, `business_description`, `website_url`, `phone`, `location_city`, `location_state`, `years_in_business`, `revenue_streams`
2. **Customer Avatar** (JSONB, single or array): `name`, `age_range`, `gender`, `occupation`, `pain_points[]`, `goals[]`, `objections[]`, `where_online[]`
3. **Brand Personality** (JSONB): `traits[]`, `mood`, `formality_level` (`casual|neutral|formal`), `keywords[]`
4. **Visual Identity** (JSONB): `primary_color`, `secondary_color`, `accent_color`, `neutral_color`, `heading_font`, `body_font`, `style_keywords[]`
5. **Brand Voice** (JSONB): `tone[]`, `dos[]`, `donts[]`, `sample_phrases[]`, `tagline`

Versioned per user via `version` + `is_current` unique partial index. DB trigger auto-calculates `completion_percent`.

**Minimum viable fields** (per `BrandProfileStep.tsx` lines 44-48): `business_name`, `industry`, `customer_avatar.name`, `customer_avatar.pain_points[]`, `brand_personality.traits[]`, `visual_identity.primary_color`, `brand_voice.tone[]`.

**Write API:** `PATCH /api/brand` with admin `user_id` in body. Whitelisted fields = all scalars + the 4 JSONB sections.

### 2.2 The Dashboard already runs Claude off the Brand Profile

File: `c:/New folder/TKBS_CustomerDashboards/lib/ai/brand-context.ts`.

- `buildBrandContext(userId)` reads the brand profile and produces a structured text block.
- Sent as `system` message with `cache_control: { type: 'ephemeral' }` — so a batch of generations shares one cache write.
- Model: `claude-sonnet-4-20250514`, max 4096 output tokens.
- Endpoint: `POST /api/admin/launch-programs/[id]/generate`
- Deliverables: `customer_avatar`, `lead_magnet`, `landing_page`, `welcome_email`, `ad_campaign`
- All runs logged to `ai_generation_logs` (actor, batch, tokens, cost).

**Implication:** the CRM MUST NOT build its own Brand Profile storage or its own marketing-asset generator. The CRM's job is to feed Brand Profile INTO the Dashboard and let the existing pipeline take over.

### 2.3 Critical architectural mismatch

| | Dashboard | CRM |
|---|---|---|
| Stack | Next.js + Supabase (Postgres) | Express + better-sqlite3 |
| Hosting | Cloud, public internet | Local file, localhost |
| Auth | Supabase JWT, RLS, multi-org | express-session, admin/member, single file |
| Data access | Public client-facing | In-house only (goal) |

**These systems cannot share tables directly.** Integration must happen over HTTP (CRM calls Dashboard's `/api/brand`) or eventually by consolidating the CRM onto Supabase. Short-term: HTTP. Long-term (6+ months): revisit — possibly migrate CRM to Supabase for one unified data store. Defer the decision until we've felt the real friction of HTTP integration.

### 2.4 Dashboard analytics to mirror for UX cohesion

File: `c:/New folder/TKBS_CustomerDashboards/app/(portal)/analytics/AnalyticsOverviewClient.tsx`.

KPIs tracked: revenue (monthly trend, by channel), ROI (ad spend vs revenue), net new customers, traffic sources, campaign performance, ad ROAS, email open/click/subscriber growth. Data sources: Shopify, Klaviyo, Meta Ads, Google Ads, Google Analytics. Widgets: KPI cards with trend indicators, bar/area/pie charts, attribution tables, UTM table. Widget visibility configurable via `DashboardCustomizer` component.

**Implication:** mirror these UX patterns in the CRM. Same `#1B2838` / `#00D4AA` palette, same KPI card style, same chart library (likely `recharts`), same widget toggler. Goal: when Josh switches between CRM and Dashboard analytics, it feels like one product.

### 2.5 The CRM's current state vs what Joe's direction needs

**Current analytics** — `tkbs-crm/server/routes/reports.js` (64 lines, 5 endpoints):
- `/summary`: active deals, pipeline value (raw sum), win rate, avg deal cycle
- `/funnel`: count by stage
- `/sources`: count by source
- `/lost-reasons`: count by reason
- `/monthly`: revenue by closed-won month

Frontend at `tkbs-crm/client/src/pages/Reports.jsx` is 4 stat cards + 4 bare lists, inline styles, no chart library.

**Gap:** this is backward-looking deal reporting, not forward-looking revenue prediction. It doesn't help Josh decide who to call tomorrow.

**Current auth** — `tkbs-crm/server/middleware/auth.js` (22 lines):
- `requireAuth` checks `req.session.userId`, loads user from SQLite
- `requireAdmin` wraps with role check
- `express-session` + `connect-sqlite3` store
- Seeded dev creds: `info@tkbsmarketing.com` / `changeme`

**Gap:** no MFA, no rate limiting, no audit log, no IP allowlist, no HTTPS enforcement, no CSRF. "Localhost by default" is not a security guarantee.

**Stage actions** — `database/crm_bridge.py::_execute_stage_actions` implements `create_tasks` and `start_cadence`. `trigger_skill` is stubbed/commented. Unblocking this is a prerequisite for Initiative 1 Stage 5.

---

## 3. Initiative 1 — Call → Brand Profile pipeline

The flagship feature. Compresses a 2-hour manual intake into minutes and bridges CRM ↔ Dashboard in a single flow.

### 3.1 Five stages

**Stage 1 — Capture**
- New CRM page at `/calls`. Upload form: audio file + deal/prospect selector.
- New `call_recordings` table: `id`, `deal_id` (FK), `audio_path`, `transcript`, `transcript_source` (`zoom|whisper|manual`), `extracted_profile_json`, `review_status` (`pending|approved|rejected`), `pushed_to_dashboard_at`, `created_at`.
- Store raw audio in a gitignored `call_recordings/` folder (or S3-compatible later).

**Stage 2 — Transcribe**
- If Josh is using Zoom cloud recording: parse the VTT it produces. No Whisper needed.
- Otherwise: OpenAI Whisper API (cheap, fast, accurate).
- Write transcript to `call_recordings.transcript`.
- **Open question:** what recorder is Josh actually using? Decides whether Whisper is needed at all.

**Stage 3 — Synthesize with Claude**
- New endpoint: `POST /api/calls/:id/extract-brand-profile`.
- System message = the exact Brand Profile JSON schema (generate from `types/database.ts` so it stays in sync — don't hand-copy).
- User message = transcript + instructions: output a JSON object matching the schema, null any field not discussed, attach `confidence` (0-1) and `source_quote` sidecar per field.
- Model: `claude-opus-4-6` (worth the cost — this is the accuracy-critical step and it doesn't run hundreds of times per day).
- Use prompt caching for the schema prompt.
- Server-side: parse, validate against schema, flag missing required fields (see §2.1 for the minimum set).

**Stage 4 — Review & approve UI**
- New CRM page: extracted profile side-by-side with source transcript.
- Every field links to its `source_quote` so Josh can verify without re-reading the transcript.
- Editable inline. Reject individual fields. Approve the whole profile.
- "Push to Dashboard" button → `PATCH /api/brand?user_id={prospect_user_id}` on the Dashboard.
- Requires: provisioning a Supabase user for the prospect first (see open question 5.1).

**Stage 5 — Ecosystem handoff at Closed Won**
- When a CRM deal reaches Closed Won, a stage action fires:
  - Activate the extracted Brand Profile on the Dashboard (`is_current = true`)
  - Move the client to Launch tier
  - Trigger the Dashboard's existing Claude generation pipeline for the initial deliverable batch (`lead_magnet`, `landing_page`, `welcome_email`, `ad_campaign`)
- Josh opens the Dashboard after Closed Won and the client's marketing kit is already drafted.
- **Depends on:** `trigger_skill` stage action being unstubbed first.

### 3.2 Build order for Initiative 1

1. Transcript upload + storage (single page, no AI yet) — **1 day**
2. Claude extraction endpoint + JSON schema validation — **2 days**
3. Review UI with source-quote traceability — **2-3 days**
4. Dashboard `PATCH /api/brand` integration + admin user provisioning — **2 days**
5. Closed-Won stage action activating Launch deliverables — **2 days** (after `trigger_skill` is unstubbed)

**Estimated total:** ~9-10 working days.

---

## 4. Initiative 2 — Revenue-prediction CRM

Current reports look backward. The goal is forward-looking triage: "who should I call tomorrow?"

### 4.1 New concepts

**Fit Score (0-100)** — auto-computed when a deal is created:
- **ICP match (40 pts):** industry match to TKBS target list, `revenue_streams` keyword overlap, `years_in_business` range, location
- **Readiness signals (30 pts):** from `acq_marketing_signals` — no website or basic website = high (they need you), no social/SEO = high, existing paid ads = medium (budget but may be sophisticated)
- **Engagement (30 pts):** email opens, UTM clicks, replies, booked calls

Visible on every deal card. Pipeline sorts by score descending.

**Expected Value (EV)** — `estimated_value × stage_probability × fit_score_factor`:
- Stage probabilities configurable per stage in `stage_actions` (suggested defaults: lead=5%, discovery=25%, proposal=60%, follow-up=80%)
- Pipeline board shows EV next to each deal
- Pipeline Value KPI becomes "Weighted Pipeline EV" instead of raw sum — much more honest

**Time Investment** — `time_minutes` column on `tasks` and `activities`:
- Manual log or auto-infer from task completion (configurable default per task type)
- Per-deal rollup: total hours invested
- New KPIs: **Hours-per-Closed-Won** and **Revenue-per-Hour-Invested** (the explicit "bang for buck" metric)

**Effort-vs-Value quadrant** — scatter plot:
- X = hours invested, Y = expected value, color = fit score, size = stage
- Four quadrants: high-value-low-effort (pursue hardest), high-value-high-effort (qualify carefully), low-value-low-effort (automate/batch), low-value-high-effort (deprioritize)
- The single chart that answers "where should I spend my time?"

**Channel ROI** — group deals by `source` (Etsy scrape, Kickstarter, cold outreach, inbound, referral):
- CAC = hours × blended rate
- LTV = closed revenue
- LTV:CAC ratio per channel
- Tells Josh which acquisition channel pays for itself

### 4.2 UX cohesion with the Dashboard

Mirror `AnalyticsOverviewClient.tsx` patterns exactly:
- `#1B2838` / `#00D4AA` palette
- KPI cards with trend indicators
- `recharts` (or whatever the Dashboard uses — verify before committing)
- `DashboardCustomizer`-style widget toggler
- Same page structure: KPI row → main chart → secondary charts in grid

Goal: one mental model across both systems.

### 4.3 Build order for Initiative 2

1. Fit score engine + deal column (backend scoring, visible on pipeline) — **2 days**
2. Expected Value computation + pipeline sort — **1 day**
3. Time tracking on tasks + revenue-per-hour KPI — **2 days**
4. Effort-vs-value scatter chart (new Analytics page, Dashboard-style) — **2-3 days**
5. Channel ROI analytics — **1-2 days**

**Estimated total:** ~8-10 working days.

---

## 5. Initiative 3 — In-house only access

Hierarchy of "in-house only" strength, weakest to strongest:

1. **Localhost only** (current) — fragile; breaks the moment Josh wants phone/home access
2. **Strong auth on public deployment** — necessary but not sufficient
3. **Tailscale private mesh** ← **recommended**
4. **Corporate VPN + private subnet** — overkill for a 2-person company

### 5.1 Recommended approach

Deploy CRM behind **Tailscale** (or WireGuard self-hosted). The CRM is literally unreachable from the public internet. Josh accesses from laptop/phone as long as Tailscale is running. Free for small teams.

**Plus defense in depth** — harden the app-level auth anyway:
- TOTP MFA on login
- Minimal `audit_log` table: every auth event, every CRM write, every `push-to-crm` run, every Dashboard API call
- Rate limit login attempts
- Enforce HTTPS even on internal network (Caddy auto-TLS with Tailscale integration)

### 5.2 Note on the Dashboard

The Dashboard stays on public internet (Supabase cloud) because it's meant to be accessible to clients themselves. That's correct. "In-house only" applies to the CRM, which is the command center.

### 5.3 Build order for Initiative 3

1. Audit log table + middleware — **1 day**
2. TOTP MFA on login — **1-2 days**
3. Tailscale deployment + Caddy HTTPS — **1 day** (infra, not code)
4. Rate limiting on auth routes — **0.5 day**

**Estimated total:** ~3-5 working days. Cheap and reversible — do this first.

---

## 6. Recommended overall sequence

**Week 1 — Foundation**
- Unblock Josh's `trigger_skill` stage action (prerequisite for Initiative 1 Stage 5)
- Initiative 3 in full: Tailscale + audit log + MFA + rate limiting
- `push --dry-run` safety prompt on the Python CLI

**Why first:** Initiative 3 is cheap and reversible, and it closes the door before any real prospect data moves through the system. Don't build the transcript pipeline on an un-hardened CRM.

**Weeks 2-3 — Initiative 1** (Call → Brand Profile). Flagship feature. Earns full CRM↔Dashboard integration as a side effect.

**Weeks 4-5 — Initiative 2** (revenue-prediction analytics). By now there's real data from Initiative 1 flowing through, so the analytics have something meaningful to chart.

**Week 6+** — Channel ROI, lead scoring refinement, Dashboard UX parity pass, nice-to-haves from Track A of the earlier walkthrough (email tracking backend, county registry scraper fix or removal).

---

## 7. Open questions — RESOLVED (2026-04-12)

1. **Supabase user provisioning timing** → **EARLY (pre-sale).**
   - **Decision:** Provision prospect in Supabase early in the pipeline (Lead or Discovery stage), not at Closed Won.
   - **Rationale:** TKBS may build out the prospect's Brand Profile progressively during the sales process to create proposals/quotes. The Brand Profile becomes a sales tool, not just a post-sale deliverable.
   - **Design implications:**
     - Need a "provision prospect" action on the CRM tied to an early stage (e.g. Discovery Call stage action).
     - Brand Profile is filled incrementally: partial after first call, refined after follow-ups.
     - CRM Review UI must support incremental updates to an existing Dashboard profile, not just one-shot writes.
     - Prospect gets a Dashboard account with `prospect` tier (view-only) initially, upgraded to `launch` at Closed Won.
     - Initiative 1 Stage 4 changes: "Push to Dashboard" becomes "Update on Dashboard" — supports both first-write and subsequent patches.

2. **Recording tools** → **Phone calls + Google Meet.**
   - **Decision:** Josh uses phone calls and Google Meet for prospect conversations.
   - **Design implications:**
     - **Whisper API is required.** Google Meet has built-in transcription but it's inconsistent and requires manual export. Phone calls have no built-in transcription.
     - **Simplest approach:** use Whisper for everything. Josh uploads audio from either source → Whisper transcribes → Claude synthesizes. One pipeline, no conditional logic.
     - **Phone recording:** Josh needs a call recorder app. Options: Rev Call Recorder (iOS/Android, free), Otter.ai (auto-records), or a hardware solution. This is Josh's choice but we should recommend one.
     - **Google Meet:** Enable recording in Meet settings → download from Google Drive → upload to CRM. Or: explore Google Meet API for automated export (future, not MVP).
     - Add Whisper API cost to the pipeline: ~$0.006/min, so a 30-min call ≈ $0.18. Negligible.

3. **CRM-to-Supabase migration timing** → **Soon but not immediate.**
   - **Decision:** Migration happens after the CRM funnel is figured out. Don't migrate the data model until we know it's the right model.
   - **Trigger:** once Initiatives 1-2 are live and the CRM schema is stable, migrate. Could be 2-3 months out.
   - **No change to short-term plan:** continue with SQLite + HTTP integration for now.

4. **ICP definition** → **Not written yet. Joe needs help creating it.**
   - **Decision:** TKBS does not have a formal ICP document. We will build it together.
   - **Design implications:**
     - This is a **prerequisite for Initiative 2's Fit Score engine** but NOT a blocker for Initiative 1 or 3.
     - We should do the ICP exercise before Week 4 (when Initiative 2 starts).
     - The ICP definition becomes a config file in the repo (e.g. `tkbs-crm/server/config/icp.json`) so it's versionable and editable.
     - ICP fields needed: target industries (ranked), ideal revenue range, geographic focus, years-in-business sweet spot, "red flag" indicators (too small, too sophisticated, wrong vertical), and "green flag" indicators.

5. **Blended hourly rate** → **$100/hour.**
   - **Decision:** Use $100/hr as Josh's blended rate for all CAC calculations.
   - Store as a configurable value in CRM settings (not hardcoded), so it can be updated without code changes.
   - This means a 1-hour discovery call costs $100 in the CAC model, a 30-min follow-up costs $50, etc.

---

## 8. Decisions already made (don't re-litigate)

- **CRM does not store its own Brand Profile.** Dashboard owns it. CRM feeds via HTTP.
- **CRM does not generate its own marketing assets.** Dashboard's Claude pipeline does. CRM triggers it via stage actions.
- **Integration method is HTTP, not shared database.** Decision revisit horizon: after CRM funnel is stable (~2-3 months).
- **In-house only = deployment isolation + hardened auth, not just app auth.** Tailscale is the recommended mesh.
- **UX cohesion with Dashboard matters.** Match KPI card style, color palette, chart library. One mental model.
- **Supabase user provisioned early** (Lead or Discovery), not at Closed Won. Brand Profile is a sales tool, not just post-sale.
- **Whisper API for all transcription.** One pipeline regardless of recording source (phone or Google Meet).
- **$100/hr blended rate** for Josh's time in CAC calculations. Stored as config, not hardcoded.
- **ICP definition needed before Initiative 2 starts.** Joe + Claude will co-create it.

---

## 9. Non-goals (things we are NOT building right now)

- New Brand Profile editor in the CRM (Dashboard already has one)
- New marketing asset generator in the CRM (Dashboard already has one)
- Multi-org support in the CRM (TKBS is the only tenant, and should stay that way given §5)
- Public API for the CRM (violates in-house-only)
- Real-time collaboration features
- Mobile-native CRM app (Tailscale + responsive web is enough)

---

## 10. Current status (updated 2026-04-17 — end of day 6)

### Day 6 — big UX day

Wrapped up Initiative 3 infrastructure, knocked out the entire Option D real-use overhaul, finished the analytics half of Initiative 2, and re-fired Stage 5 against the live Dashboard. The CRM is now fully usable day-to-day for both Joe and Josh.

### Day 6 commits (all pushed to main)

| Commit | Content |
|---|---|
| `69fc12a` | Phase 4 auto-start on Windows login + power settings (Tailscale deployment finished) |
| `d1ca144` | Stage 5 CHECK constraint fix — re-fired Wren & Ivy activation, now has `launch_client_id` populated |
| `dafd501` | **Tier 1 UX overhaul** — Home dashboard, global search (Ctrl+K), pipeline filters, deal calls tab (1017 insertions) |
| `273f563` | **Tier 2 UX quick wins** — Contacts/Companies search, ICP editor, activity filter, script merge-fields (538 insertions) |
| `69dda6e` | **Pipeline velocity chart + task time tracking → deal profitability** (701 insertions, Initiative 2 analytics mostly complete) |
| `4688e09` | Reports error boundaries + Ctrl+K label for Windows |

### Initiative 2 status

| Item | Status |
|---|---|
| Fit Score engine | ✅ |
| ICP config source-of-truth | ✅ |
| ICP editor UI (admin-only) | ✅ |
| Pipeline velocity chart | ✅ |
| Stage conversion funnel | ✅ |
| Task time tracking | ✅ |
| Deal profitability table (ROI) | ✅ |
| Channel ROI analytics | ⏳ not yet |
| Effort-vs-Value scatter chart | ⏳ not yet |

### Pickup for tomorrow — remaining backlog

**Bite-sized UX finishes:**
- Task templates + quick-add on Home dashboard (~2-3 hrs)
- Transcript speaker labels on call detail (~2-3 hrs)
- Notification system — in-app/email alerts for stage changes, overdue tasks (~3-4 hrs)

**Bigger features:**
- **Auto-feed leads from Python scrapers → CRM** (Joe flagged this as wanted soon) — wrap `push_leads_to_crm` in a scheduled runner + scraper-queue UI so the prospect pipeline keeps filling automatically. ~1 day.
- **B — Nightly CRM↔Dashboard sync** — retry failed pushes, pull engagement data back to feed Fit Score. ~1 day.
- **C — Whisper auto-transcription** — kills the manual paste step in call intake. ~1 day.

**Channel ROI + Effort-vs-Value chart** (finishes Initiative 2) — ~1 day if done together.

### Known state at session close

- Dev server: likely running (Vite + Express via `npm run dev`)
- Tailscale serve: configured, survives reboots
- Prod server (via VBS Startup shortcut): auto-launches when Joe logs into Windows
- All tests: 108/108 Node, 21/21 Python critical paths — no regressions
- Wren & Ivy seed: still in prod DB + on Dashboard (test data, clean up when ready)
- Josh's Dashboard test user `megan@wrenandivyboutique.com`: still in prod Supabase, tier=launch, has launch_client

---

## 10-OLD-day5. Historical status (2026-04-16 — end of day 5)

### Day 5 progress — Initiative 3 (C2) shared access

Took on Tailscale deployment. Picked Style 2 (production-style — prod build + Express serves static + `tailscale serve` HTTPS). Joe's laptop (`mcm-pc2.tail87b28f.ts.net`) is the host.

**Completed:**
- ✅ Phase 1: Tailscale installed on Joe's laptop, HTTPS enabled on the tailnet
- ✅ Phase 2: Vite production build working, Express serves `client/dist` + API on :3001
- ✅ Phase 3: `tailscale serve --bg --https=443 http://localhost:3001` configured. Shared CRM live at `https://mcm-pc2.tail87b28f.ts.net` with real Let's Encrypt HTTPS. Joe logged in and confirmed his data (Wren & Ivy deal at fit score 80, Maple Lane at 27) is visible.
- ✅ Two prod-readiness fixes committed (`a2f6f5f`):
  1. Express 5's path-to-regexp rejects bare `*` wildcard → use `/.*/` regex for SPA fallback
  2. Express didn't trust the tailscale serve proxy → added `app.set('trust proxy', 'loopback')` so `express-session` honors HTTPS and sets secure cookies

**Pending:**
- Josh finishing Tailscale install + joining tailnet (Joe coordinating with him)
- Phase 4: auto-start on boot + power settings (so laptop sleeping doesn't lock Josh out)
- Phase 5: merge Josh's local CRM data into shared DB (optional, deferred)

### Known item to re-test tomorrow

Wren & Ivy deal has `launch_client_id: null` + `launch_activated_at: null` in the shared DB. Seed script re-ran after yesterday's Stage 5 smoke test, wiping those columns. Not a bug — just an artifact of re-seeding. Fix: drag deal out of Closed Won and back in; Stage 5 handler is idempotent on the Dashboard side (won't create a duplicate launch_client).

### Pickup for tomorrow

1. **Confirm Josh is on the tailnet** and can log in at the shared URL (should already be done if he connected overnight)
2. **Phase 4: auto-start** — write a Windows startup batch/scheduled task so `NODE_ENV=production node server/index.js` auto-runs on login, logs to a file, auto-restarts on crash. Plus power settings guidance so the laptop stops sleeping.
3. **Re-fire Stage 5** on the Wren & Ivy deal (drag out of Closed Won and back in)
4. **Optional: Phase 5** data merge from Josh's DB once everything else is stable
5. **Back to the A/B/C/D menu** — Initiative 2 finish, nightly sync, Whisper, etc.

**Servers live at session end:**
- Prod CRM server running on localhost:3001 (in-session background process, dies when Joe closes terminal or laptop sleeps)
- `tailscale serve` config persists across reboots — comes back when the node process does

---

## 10-OLD-day4. Historical status (2026-04-14 — end of day 4)

### 🎉 Initiative 1 functionally complete

Today shipped Stage 4b (CRM→Dashboard push) and Stage 5 (Closed Won → Launch activation). Smoke-tested end-to-end against Joe's live Dashboard (local Next.js → prod Supabase) using the Wren & Ivy seed deal. Push worked, portal link opened the right org, drag to Closed Won fired the activation, tier upgraded prospect→launch, launch_client row created. All 108/108 tests still passing.

### Day 4 commits

| Commit | Content |
|---|---|
| Dashboard `a9a6bb3` | (yesterday) PR #1 merged — `/api/crm/*` endpoints |
| CRM `c254460` | Stage 4b + Stage 5 — dashboard-client.js, push endpoint, CallDetail UI, Stage 5 closed-won handler, schema migrations |

### Initiative 1 final state

| Stage | Status |
|---|---|
| 1 — Capture | ✅ |
| 2 — Whisper transcription | ⏸ deferred (manual paste works) |
| 3 — Claude extraction | ✅ |
| 4a — Editable review UI | ✅ |
| 4b — Push to Dashboard | ✅ |
| 5 — Closed Won → Launch activation | ✅ |

### Cleanup items (pending Joe)

- **Test data on prod Supabase:** `megan@wrenandivyboutique.com` user + Wren & Ivy org + brand profile + launch_client row. Delete via Supabase console → Auth → Users (cascades).
- **`ANTHROPIC_API_KEY`** in `c:/Client-Acquisition/tkbs-crm/.env` — got clobbered when adding Dashboard env vars. Restore for Brand Profile re-extraction to work.

### Pickup for tomorrow — Joe wants A + B + C + D

Joe explicitly said: "I look forward to doing A, B, C, and D" — meaning he wants all four directions on the table. Suggested ordering by leverage:

1. **A — Initiative 2 finish** (highest near-term value): time tracking on tasks, effort-vs-value scatter chart, channel ROI. Completes the "help Josh prioritize his time" story. Builds on the Fit Score engine already shipped.
2. **B — Nightly CRM↔Dashboard sync** (medium): retries failed pushes, pulls Dashboard engagement back to feed Fit Score's engagement bucket. Self-contained feature, ~1 day.
3. **C — Whisper Stage 2** (medium): kills manual transcript paste. Requires OpenAI API key (~$0.006/min). Joe deferred this earlier — worth re-evaluating now that the rest of Initiative 1 works.
4. **C2 — Tailscale deployment / Initiative 3** (medium-high): real multi-user access (Joe + Josh on the same CRM). Currently each runs a local SQLite. ~1-2 hours of infra work.
5. **D — Something else from real use:** now that the core pipeline works, what hurts most when Joe + Josh actually try to use it for real prospects? Worth a 10-min reflection at session start tomorrow.

**Pick-up point for tomorrow:** decide which of A/B/C/C2/D to start with, then go. All are independent — no architectural decisions blocking any of them.

### Day 3 progress

| Task | Commit | Status |
|------|--------|--------|
| Initiative 1 Stage 4a: editable Brand Profile review UI | CRM `efb09f4` | ✅ Live (BrandProfileEditor component, source-quote popovers, keep/reject, re-extract modal) |
| Initiative 2 Fit Score engine | CRM `6a0478c` | ✅ Live (108/108 Node tests passing, lazy compute, badge on DealCard, sort dropdown) |
| Wren & Ivy ideal-client seed | CRM `11d21fb` | ✅ Reproducible, hits exactly 80/100 Fit Score, creates both admin accounts |
| Stage 4b/5 architecture decisions captured | memory + plan | ✅ All 9 clarifying questions answered (2026-04-13) |
| Stage 4b Phase 1 — Dashboard endpoints | Dashboard PR #1 merged to main (`a9a6bb3`) | ✅ 4 endpoints live at `/api/crm/*` on `joshhorsley92/TKBS_CustomerDashboards` |

### Pick-up point for tomorrow

**Phase 1 of Stage 4b is done — the Dashboard now exposes the endpoints the CRM needs.** Before building Phase 3 (CRM side), Joe must complete two prerequisites:

1. **Generate `CRM_SERVICE_KEY`** — `openssl rand -hex 32` (or any strong random string)
2. **Set env vars on both sides:**
   - **Vercel (Dashboard prod):** `CRM_SERVICE_KEY=<the key>`, confirm `NEXT_PUBLIC_APP_URL` is set (e.g. `https://dashboard.turnkeymarketing.com`)
   - **CRM local `.env`:** `DASHBOARD_SERVICE_KEY=<same key>`, `DASHBOARD_API_URL=<Dashboard public URL>`

### Phases ahead

**Phase 3 — CRM side (1-2 days, no blockers once env vars are set):**
- `tkbs-crm/server/services/dashboard-client.js` — fetch wrapper with retry + auth header
- `POST /api/calls/:id/push-to-dashboard` endpoint — orchestrates find-or-create prospect + push Brand Profile
- New columns: `call_recordings.dashboard_org_id`, `deals.dashboard_org_id`, `deals.launch_client_id`, `deals.launch_activated_at`
- CallDetail UI — "Push to Dashboard" button replaces the Stage 4b placeholder. Post-push → "Open on Dashboard ↗" link using `portal_url`
- Audit logging on push

**Phase 4 — Stage 5 closed-won handler (0.5 day):**
- New `activate_launch_on_dashboard` action_type in `tkbs-crm/server/services/stage-actions.js`
- Reads target tier from `deal.package_type` (launch or boost)
- Safety net: if push_to_dashboard hasn't happened yet, does it first
- Never blocks the stage transition — logs warning, flags deal for retry (per Joe's 2026-04-13 decision)
- Python `crm_bridge.py` safely ignores the new action_type (same pattern as pre-unstub trigger_skill)

**Phase 5 — End-to-end test (0.5 day):**
- Use existing Wren & Ivy seed deal with email `test@tkbsmarketing.com`
- Push → verify user + org + brand_profile appear on Dashboard
- Move deal to Closed Won → verify tier upgrade + launch_clients creation
- Clean up test user when done

### Still deferred

- Initiative 1 Stage 2 (Whisper transcription) — manual paste only for now
- Initiative 3 Tailscale/Caddy deployment — per-developer local SQLite still the norm
- Nightly CRM↔Dashboard sync — follow-on feature after Stage 4b core ships

---

## 10-OLD. Historical status (2026-04-12 — end of day 2)

### Shipped and committed

| Task | Commit | Status |
|------|--------|--------|
| Week 1 Foundation: audit log, MFA, rate limiting, trigger_skill, push --dry-run | `e7c23d6` | ✅ Live, 90/90 Node + 21/21 Python tests passing |
| Initiative 1 Stage 1: call capture (table, upload UI, detail page, `/calls` route) | `c7a598c` | ✅ Live, tested end-to-end |
| Initiative 1 Stage 3: Claude Brand Profile extraction (Opus 4.6, schema, sidebar preview) | `c7a598c` | ✅ Live, tested end-to-end with sample transcript |
| ICP codified (`server/config/icp.json`) | `c7a598c` | ✅ Done — Retail/Service/B2B, $500K-$10M, Michigan-preferred |

### Deferred

- **Initiative 1 Stage 2 (Whisper transcription):** deferred per Joe. Transcripts are manually pasted for now.
- **Initiative 3 Tailscale deployment + Caddy HTTPS:** deferred; still on the roadmap.

### Open decision blocking Initiative 1 Stage 4b

**How does the CRM create a Supabase user for a prospect and write a Brand Profile to the Dashboard?**

Three options:
1. CRM writes directly to Supabase via service-role key (fast, tight coupling)
2. Add a new admin endpoint to the Dashboard (`POST /api/admin/prospects`) that the CRM calls — cleaner separation, requires editing two repos
3. Use only existing Dashboard endpoints — not viable, no user-creation endpoint exists

**Recommendation:** option 2. Preserves RLS boundary. Minimal Dashboard-side code (one endpoint). Requires a cross-repo PR.

**Joe hasn't answered this yet** — needed before Stage 4b ships.

### Recommended next sequence (Path C from end-of-day discussion)

Joe leaning toward Path C (parallel tracks):

1. **Stage 4a** — editable review UI on `/calls/:id` (edits save to CRM only, no Dashboard push yet). ~2-3 days. No blockers.
2. **Initiative 2 Fit Score engine** — delegated to an agent in parallel. Reads `icp.json`, scores deals on creation, surfaces on pipeline cards. ~2-3 days. No blockers.
3. **Joe answers the Dashboard architecture question** while 1+2 are in flight.
4. **Stage 4b + Stage 5** — Dashboard push + Closed Won handoff. ~3-4 days. Blocked on the decision.

**Pick-up point for tomorrow:** Joe to confirm Path C, then kick off Stage 4a + Fit Score engine in parallel.

### Key design notes for Stage 4a

- Make every field in the extracted profile editable inline (scalars = text inputs, arrays = tag inputs)
- Show `source_quote` from sidecar on hover / expand — lets Josh verify extractions
- Reject individual fields (ignore them on push) — add a "keep / reject" toggle per field
- Save updates to `call_recordings.extracted_profile_json` (overwrite the profile key, keep sidecar for source quotes)
- "Approve" button flips `review_status: pending → approved`; "Push to Dashboard" button is the Stage 4b addition
- Mirror the Dashboard's `BrandProfileStep.tsx` field ordering so Josh has the same mental model across both systems

### Key design notes for Initiative 2 Fit Score

- New file `tkbs-crm/server/services/fit-score.js`
- Input: a deal + its company record + any `acq_marketing_signals` data
- Output: `{ score: 0-100, breakdown: { icp_match, readiness_signals, engagement }, flags: [ids of green/red flags hit] }`
- Weights + flag definitions come from `server/config/icp.json` — do NOT hardcode
- Compute on deal creation, store in new `deals.fit_score` column (needs migration)
- Display on PipelineCard: small badge with color ramp (green 70+, yellow 40-70, red <40)
- Don't build the scatter chart yet — one step at a time
