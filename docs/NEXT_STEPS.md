# TKBS CRM — Next Steps

Last updated: 2026-04-02

## Current Status

**All 4 phases complete:**
- Phase 1: Foundation (auth, pipeline board, deals/contacts/companies CRUD)
- Phase 2: Productivity (tasks, scripts, CLOSER stepper, follow-up scheduler)
- Phase 3: Intelligence (AI generation, reports, settings)
- Phase 4: Integrations (Gmail, Slack, Calendar, webhooks, Twilio, web form intake)

**Additional features added:**
- Prospect stage (pre-Lead)
- Bulk import page (CSV/JSON paste + manual entry)
- Expandable task notes
- Upcoming tasks on deal overview
- Task delete buttons
- Email template auto-loader in composer
- Contact-company assignment in Contacts page
- Gmail auto-polling (every 5 min) with contact-matching filter
- Company filter in contacts list

**Tests:** 90 passing across 14 suites

## Immediate Next Steps

### 1. Seed Hormozi Script Library (HIGH PRIORITY)
Fill out the script_templates table with comprehensive Alex Hormozi-style scripts for every stage:
- **Prospect stage:** Qualification questions, research brief template
- **Lead stage:** Cold outreach sequence (5 emails: observation, case study, value bomb, check-in, break-up), LinkedIn DMs, call scripts
- **Outreach stage:** Follow-up cadence emails, voicemail scripts
- **Discovery Call stage:** Full CLOSER framework script with conditional branches for common objections, pre-call prep checklist, post-call notes template
- **Proposal stage:** Proposal delivery email, walkthrough script, pricing justification talking points, value stack explanations
- **Follow-Up stage:** 4-email post-proposal sequence (day 1, 4, 10, 21), objection handling scripts (price, timing, trust, DIY)
- **Closed Won stage:** Welcome email, onboarding checklist, kickoff agenda

Reference: docs/specs/2026-03-31-tkbs-crm-design.md (Hormozi methodology section)

### 2. Global Inbox View
Add a page in the sidebar showing all recently synced inbound emails across all deals, with links to each deal. Currently emails only appear on individual deal views — hard to see new activity at a glance.

### 3. Test Phase 4 Integrations End-to-End
- Gmail OAuth → send test email → verify tracking pixel works
- Gmail auto-sync → reply to an email from a known contact → verify it appears in the deal
- Slack notifications → configure bot token → verify stage changes post to channel
- Google Calendar → create an event from a deal → verify it appears in calendar
- Twilio SMS → configure credentials → send test SMS
- Web form intake → test with curl POST to verify lead creation

## Phase 5 Ideas (not yet planned)

### Prospecting Tools
- Google Maps scraper integration for local business discovery
- LinkedIn Sales Navigator import
- Industry directory scrapers (Yelp, BBB, ThomasNet)
- Auto-research with Claude Code CLI (enrich prospect data from website/GBP)
- Lead scoring based on qualification criteria

### Content/Inbound Lead Gen
- Landing page builder integrated with CRM
- Lead magnet tracking
- Content funnel analytics
- UTM parameter tracking on intake

### Advanced Email
- Reply threading (link email replies to the original sent email)
- Email scheduling (send at optimal time)
- A/B testing on subject lines
- Sequence automation (enroll a deal in a multi-step email sequence)

### Pipeline Value Tracking
- Show total monthly recurring value per stage on the kanban board
- Deal aging alerts (notification when stale in a stage too long)
- Win/loss analysis beyond lost_reason (services proposed, deal size, source patterns)

### Client Onboarding Pipeline
- Once a deal closes, move it into a separate onboarding pipeline
- Onboarding stages: Contract Signed → Assets Collected → Kickoff → Launched → Active
- Onboarding-specific task templates

### Proposal Status Tracking
- Integration with proposal skill to track: viewed, downloaded, signed
- Timestamps on each event
- Auto-trigger follow-up reminders based on proposal status

### Service Catalog Integration
- Pick services from catalog when building a deal
- Auto-calculate deal value from selected services
- Pre-fill proposal with selected services

### Recurring Revenue Dashboard
- MRR tracking from closed deals
- Churn tracking
- Expansion revenue
- Cohort analysis

## Environment Setup Reference

### Required env vars (tkbs-crm/.env)
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3001/api/integrations/google/callback
SLACK_BOT_TOKEN=
SLACK_WEBHOOK_URL=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
INTAKE_API_KEY=
PUBLIC_URL=http://localhost:3001
SESSION_SECRET=
```

### Prerequisites
- Node.js installed
- Claude Code CLI: `npm install -g @anthropic-ai/claude-code`
- Google Cloud project with Gmail API + Calendar API enabled (for OAuth)

### Run commands
```bash
cd tkbs-crm
npm run dev          # Start both server (3001) and client (5173)
npx jest             # Run all tests
bash scripts/setup.sh  # Initial setup + seed data
```

### Login credentials (dev)
- Email: info@tkbsmarketing.com
- Password: changeme

## Key File Locations

- **Spec:** docs/specs/2026-03-31-tkbs-crm-design.md
- **Phase plans:** docs/plans/2026-03-31-tkbs-crm-phase1-foundation.md through phase4-integrations.md
- **Server:** tkbs-crm/server/
- **Client:** tkbs-crm/client/src/
- **Database:** tkbs-crm/tkbs-crm.db (SQLite)
- **Default scripts seed:** tkbs-crm/server/db/seed-scripts.js

## Active Git Branch
main (all work committed directly to main)
