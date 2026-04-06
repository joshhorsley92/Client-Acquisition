# TKBS CRM Phase 4: Integrations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Gmail (send/receive/track), Slack (notifications + commands), Google Calendar (event creation + availability), generic webhooks, and SMS via Twilio.

**Architecture:** Builds on Phase 1-3 foundation. Adds OAuth2 flows for Gmail and Google Calendar, Slack app with webhook + slash commands, a generic webhook dispatcher on stage changes, and Twilio SMS service. Each integration is a self-contained service module with its own route file.

**Tech Stack:** googleapis (Gmail + Calendar), @slack/web-api + @slack/bolt (Slack app), twilio (SMS), nodemailer (email composition)

**Prerequisite:** Phase 1-3 complete and working.

**Spec reference:** `docs/specs/2026-03-31-tkbs-crm-design.md`

---

## Phase 4 Scope

| # | Integration | What It Does |
|---|-------------|-------------|
| 1 | Gmail — Send | Compose and send emails from deal detail view via Gmail API. Auto-log as activity. |
| 2 | Gmail — Sync | Inbound email matching by contact email. Replies appear in deal activity timeline. |
| 3 | Gmail — Open/Click Tracking | Pixel tracking on sent emails, redirect-based link click tracking. |
| 4 | Slack — Notifications | Post to a channel on stage changes, closed wins, overdue alerts. |
| 5 | Slack — Commands | /tkbs-deal, /tkbs-tasks slash commands for quick lookups. |
| 6 | Google Calendar — Events | Auto-create calendar events when discovery calls are scheduled. Meeting context in description. |
| 7 | Google Calendar — Availability | Generate booking links with availability for outreach emails. |
| 8 | Generic Webhooks | Configurable outbound webhooks on any stage change (Zapier/Make compatible). |
| 9 | SMS — Twilio | Send text messages from deal detail view. Auto-log as activity. |
| 10 | Web Form Intake | Webhook endpoint that receives contact form submissions and auto-creates leads. |

---

## File Structure (New)

```
tkbs-crm/
├── server/
│   ├── routes/
│   │   ├── integrations.js       # Integration settings + OAuth callbacks
│   │   ├── email.js              # Gmail send/sync/tracking endpoints
│   │   ├── slack.js              # Slack event + command handlers
│   │   ├── calendar.js           # Calendar event creation
│   │   ├── webhooks.js           # Generic outbound webhook config
│   │   ├── sms.js                # Twilio SMS endpoints
│   │   └── intake.js             # Web form submission receiver
│   ├── services/
│   │   ├── gmail.js              # Gmail API client (OAuth, send, sync, tracking)
│   │   ├── slack.js              # Slack API client (post, commands)
│   │   ├── calendar.js           # Google Calendar API client
│   │   ├── twilio.js             # Twilio SMS client
│   │   ├── webhook-dispatcher.js # Fire outbound webhooks on events
│   │   └── stage-actions.js      # MODIFY — add email/slack/webhook action types
│   └── db/
│       └── schema.sql            # MODIFY — add integration_settings, email_tracking tables
├── client/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Settings.jsx      # MODIFY — add Integrations tab
│   │   │   └── DealDetail.jsx    # MODIFY — add email compose, SMS send
│   │   └── components/
│   │       ├── EmailComposer.jsx # NEW — compose + send email from deal
│   │       ├── EmailThread.jsx   # NEW — threaded email view in activity
│   │       └── SmsComposer.jsx   # NEW — compose + send SMS from deal
```

---

## Database Additions

### integration_settings

Stores OAuth tokens and configuration for each integration.

```sql
CREATE TABLE IF NOT EXISTS integration_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL UNIQUE,
  config TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Types: `gmail`, `slack`, `google_calendar`, `twilio`, `webhooks`

### email_messages

Stores sent/received emails linked to deals.

```sql
CREATE TABLE IF NOT EXISTS email_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER REFERENCES deals(id) ON DELETE CASCADE,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK(direction IN ('outbound', 'inbound')),
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  from_email TEXT,
  to_email TEXT,
  sent_at TEXT,
  opened_at TEXT,
  clicked_at TEXT,
  tracking_pixel_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### outbound_webhooks

Configurable webhooks that fire on CRM events.

```sql
CREATE TABLE IF NOT EXISTS outbound_webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT NOT NULL DEFAULT '[]',
  headers TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Events: `deal.stage_changed`, `deal.created`, `deal.closed_won`, `deal.closed_lost`, `task.overdue`, `activity.created`

### sms_messages

```sql
CREATE TABLE IF NOT EXISTS sms_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER REFERENCES deals(id) ON DELETE CASCADE,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK(direction IN ('outbound', 'inbound')),
  twilio_sid TEXT,
  from_number TEXT,
  to_number TEXT,
  body TEXT,
  status TEXT DEFAULT 'sent',
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## Integration 1: Gmail — Send

### OAuth2 Flow
1. User clicks "Connect Gmail" in Settings → Integrations
2. Redirects to Google OAuth consent screen (scope: gmail.send, gmail.readonly)
3. Callback stores access_token + refresh_token in integration_settings
4. Tokens auto-refresh via googleapis client

### Email Composer
- Lives on Deal Detail view as a new "Email" button
- Loads script templates for current stage, pre-fills with merge fields
- Subject + body fields, rich text optional (v1: plain text)
- "Send" calls POST /api/email/send with deal_id, to, subject, body
- Server sends via Gmail API, logs as activity, stores in email_messages

### Server Flow
```
POST /api/email/send
  → gmail.js sends via Gmail API
  → Inserts into email_messages (direction: outbound)
  → Inserts into activities (type: email)
  → Inserts tracking pixel into body_html
  → Returns { message_id, thread_id }
```

---

## Integration 2: Gmail — Sync

### Inbound Email Matching
- Polling service runs every 5 minutes (or webhook via Gmail push notifications)
- Fetches new messages from inbox
- Matches sender email against contacts table
- If match found, links to the contact's active deal
- Stores in email_messages (direction: inbound), logs as activity

### Thread View
- EmailThread component shows full conversation (outbound + inbound) for a deal
- Threaded by gmail_thread_id
- Replaces flat "email sent" activity entries with full message previews

---

## Integration 3: Gmail — Open/Click Tracking

### Open Tracking
- Transparent 1x1 pixel embedded in outbound HTML emails
- Unique tracking_pixel_id per email
- GET /api/email/track/:pixel_id returns the pixel image and updates opened_at
- Deal activity shows "Email opened by {contact}" with timestamp

### Click Tracking
- Links in outbound emails rewritten to redirect through CRM
- GET /api/email/click/:message_id?url=original_url
- Logs click, updates clicked_at, redirects to original URL
- Deal activity shows "Link clicked by {contact}"

---

## Integration 4: Slack — Notifications

### Setup
- Create a Slack app with Incoming Webhooks + Slash Commands
- User configures webhook URL in Settings → Integrations → Slack
- Select which events to notify on

### Notification Events
- **Stage change:** "📋 *Acme Manufacturing* moved to *Proposal* by Josh" with deal link
- **Closed Won:** "🎉 *Acme Manufacturing* closed! $2,500/mo — Boost package" 
- **Closed Lost:** "❌ *Beta LLC* lost — Reason: price"
- **Overdue tasks:** Daily digest at 9 AM: "You have 3 overdue tasks" with list
- **New lead:** "🆕 New lead: *Fresh Eats* (referral from Dave)"

### Implementation
- slack.js service with postMessage(channel, text, blocks) method
- stage-actions.js gets a new action type: `notify_slack`
- task-scheduler.js gets a daily overdue digest job

---

## Integration 5: Slack — Commands

### Slash Commands
- `/tkbs-deal [company name]` — Returns deal summary (stage, value, last activity, pending tasks)
- `/tkbs-tasks` — Returns your overdue + today tasks
- `/tkbs-pipeline` — Returns pipeline summary (deals per stage, total value)

### Implementation
- Slack sends POST to /api/slack/commands
- Server parses command + text, queries DB, returns Slack Block Kit response
- Requires Slack app with slash command configured pointing to CRM's public URL

---

## Integration 6: Google Calendar — Events

### Auto-Create on Discovery Call
- When deal moves to Discovery Call stage and a meeting date is set
- Creates Google Calendar event with:
  - Title: "Discovery Call — {company}" 
  - Description: deal context, contact info, link to analysis deck
  - Attendees: contact email (if available)
  - Reminder: 30 min before

### Manual Create
- "Schedule Meeting" button on deal detail
- Date/time picker + description
- Creates calendar event and task simultaneously

---

## Integration 7: Google Calendar — Availability

### Booking Link Generation
- Simple availability endpoint: GET /api/calendar/availability?days=5
- Returns available time slots based on Google Calendar free/busy
- Generates a booking page URL the user can paste into outreach emails
- When prospect books, auto-creates deal task + calendar event

---

## Integration 8: Generic Webhooks

### Configuration
- Settings → Integrations → Webhooks
- Add webhook: name, URL, select events to fire on, custom headers (for auth)
- Test button sends a sample payload

### Payload Format (Zapier/Make compatible)
```json
{
  "event": "deal.stage_changed",
  "timestamp": "2026-04-02T10:00:00Z",
  "data": {
    "deal": { "id": 1, "stage": "proposal", "previous_stage": "discovery_call", ... },
    "company": { "name": "Acme Manufacturing", ... },
    "contact": { "name": "Sarah Chen", ... }
  }
}
```

### Implementation
- webhook-dispatcher.js listens for CRM events, fires matching webhooks
- Async with retry (3 attempts, exponential backoff)
- Logs success/failure in activity timeline

---

## Integration 9: SMS — Twilio

### Setup
- User enters Twilio Account SID, Auth Token, and phone number in Settings
- Stored encrypted in integration_settings

### Send SMS
- SmsComposer component on deal detail view
- Pre-fills with contact's phone number
- Load SMS templates from script_templates (type: sms)
- "Send" calls POST /api/sms/send
- Server sends via Twilio API, logs as activity, stores in sms_messages

### Inbound SMS
- Twilio webhook POST /api/sms/inbound
- Matches by phone number to contacts table
- Links to active deal, logs as activity

---

## Integration 10: Web Form Intake

### Endpoint
- POST /api/intake/form — public endpoint (no auth required, but uses API key)
- Accepts: name, email, phone, company_name, message, source
- Auto-creates: Company (if new) → Contact → Deal (stage: lead)
- Fires stage actions for lead stage (research + outreach tasks)

### Usage
- Embed in website contact form as the action URL
- Or connect via Zapier from any form builder (Typeform, Gravity Forms, etc.)

### Security
- API key required in X-API-Key header
- Rate limited (10 submissions per minute)
- Configurable in Settings → Integrations → Web Forms

---

## Implementation Order

| Task | Integration | Dependencies |
|------|------------|-------------|
| 1 | Database schema additions | None |
| 2 | Integration settings routes + UI | Task 1 |
| 3 | Gmail OAuth flow | Task 2 |
| 4 | Gmail send + EmailComposer | Task 3 |
| 5 | Gmail sync (inbound matching) | Task 3 |
| 6 | Gmail open/click tracking | Task 4 |
| 7 | Slack notifications | Task 2 |
| 8 | Slack slash commands | Task 7 |
| 9 | Google Calendar events | Task 3 (shares OAuth) |
| 10 | Google Calendar availability | Task 9 |
| 11 | Generic webhooks | Task 2 |
| 12 | SMS — Twilio send | Task 2 |
| 13 | SMS — Twilio inbound | Task 12 |
| 14 | Web form intake | Task 1 |
| 15 | End-to-end verification | All |

---

## Environment Variables Required

```
# Gmail / Google Calendar
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3001/api/integrations/google/callback

# Slack
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
SLACK_WEBHOOK_URL=

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Web Form Intake
INTAKE_API_KEY=

# CRM Public URL (for tracking pixels, Slack commands, Twilio webhooks)
PUBLIC_URL=https://crm.tkbsmarketing.com
```

---

## Notes

- Gmail and Google Calendar share the same OAuth consent screen — one "Connect Google" button handles both
- Slack notifications are the quickest win — just an outgoing webhook, no Slack app approval needed for a private workspace
- Generic webhooks make the CRM compatible with any automation tool (Zapier, Make, n8n) without custom code
- Web form intake is the bridge from "manual entry only" to "web forms feeding the pipeline" — exactly where Josh said he's heading
- All integrations are optional and independently toggleable in Settings
