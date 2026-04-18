# UTM Builder — To Port (from Dashboard V2)

Source: `TKBS_CustomerDashboards/app/(portal)/admin/utm-builder/` + `/app/api/admin/utm/`
Date staged: 2026-04-18
Reason: V2 pivot — UTM Builder moves from Dashboard (admin-only) to the CRM.

## What's here

- `ui/` — the 8 Next.js (React + TypeScript) source files: main client, sub-components, constants.
- `api/utm/` — Next.js API routes: `route.ts` (GET/POST/DELETE) and `health/route.ts`.

## What the tool does

Admin-only UI for building and managing tracked UTM links per client organization. Three entities:
- **Landing pages** — per-org URLs the admin tags.
- **Campaigns** — per-org campaign slugs with optional start/end dates.
- **Links** — generated UTM-tagged URLs, saved for reuse. Each link has utm_source, utm_medium, utm_campaign, utm_term, utm_content, channel_label, notes.

Includes a batch generator (cross-product of sources × mediums × campaigns) and a saved-links section.

## Porting checklist (Next.js → CRM Express + Vite + React)

### Database
Current tables in Dashboard Supabase: `client_utm_landing_pages`, `client_utm_campaigns`, `client_utm_links`.
- Decide: share Dashboard's Supabase tables, or replicate in CRM's SQLite (`server/db/schema.sql`).
- If SQLite: translate the 3 table schemas (check Dashboard migrations for the original DDL). `organization_id` in Dashboard maps to the CRM's `companies.id` (or wherever the CRM tracks clients).

### API layer
Rewrite `api/utm/route.ts` as 3 Express routes in `server/routes/utm.js`:
- `GET /api/utm?org_id=…` — returns `{ landing_pages, campaigns, links }`.
- `POST /api/utm` — body `{ type: 'landing_page' | 'campaign' | 'link', org_id, …data }`.
- `DELETE /api/utm?type=…&id=…`.

Replace Supabase (`createServiceRoleClient`, `.from(...).select()`) with better-sqlite3 prepared statements.

Replace `requireAdminAuth` with the CRM's existing session/auth middleware (see `server/middleware/auth.js`).

The `health` route (`api/utm/health/route.ts`) — read the file to confirm scope, likely a health-check pinger; may not need porting.

### UI layer
Convert each `.tsx` → `.jsx` in `client/src/pages/UTMBuilder/` (or similar):
- Drop `'use client'` directive (Vite doesn't use it).
- Replace Next.js `next/navigation` hooks with react-router equivalents.
- Replace `fetch('/api/admin/utm...')` with `fetch('/api/utm...')`.
- Strip the tier / admin-specific gating (CRM is admin-only anyway).
- Check the CRM's UI conventions — if tailwind classes differ, adapt.
- Wire `UTMBuilderClient` into a new route in `client/src/App.jsx`.
- Add nav link in the CRM's sidebar/menu.

### Organization selection
The Dashboard version filters by `org_id`. In the CRM, this maps to whichever "client/company" the admin is viewing. Decide where this UI surfaces — top-level page with a company picker, or nested under a company's detail page.

### Tests
No tests existed in the Dashboard for the UTM Builder UI. Consider adding jest tests for the new Express route handlers.
