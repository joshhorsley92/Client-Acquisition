# Supabase setup — TKBS CRM v1.0

This dir holds the Postgres schema migrations and the one-shot user-seed script.

## What's here

```
supabase/
  migrations/
    0001_init_crm_schema.sql   ← creates everything in the `crm` Postgres schema
  seed-users.mjs               ← creates Joe + Josh in Supabase Auth, prints
                                  password-recovery links to send them
  README.md                    ← you are here
```

## One-time setup (only Joe runs this)

### 1. Get your Supabase project's connection details

Open the Supabase dashboard → your existing project → **Settings → API**:

- **Project URL** → use as `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** key → use as `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role** key → use as `SUPABASE_SERVICE_ROLE_KEY` (server-side only, never ship to client)

Fill these into `crm/.env.local` (copy from `.env.local.example`).

### 2. Apply the schema migration

Two ways, pick whichever you prefer:

**Option A — Supabase Dashboard SQL editor** (no CLI needed):

1. Open Supabase dashboard → **SQL Editor → New query**
2. Paste the entire contents of `migrations/0001_init_crm_schema.sql`
3. Click **Run**
4. You should see "Success. No rows returned" — that means the schema, RLS policies, triggers, and Storage bucket are all set up

**Option B — Supabase CLI** (recommended if you'll add more migrations later):

```bash
npm install -g supabase
cd crm
supabase link --project-ref <your-project-ref>
supabase db push
```

### 3. Seed Joe + Josh in Supabase Auth

```bash
cd crm
node supabase/seed-users.mjs
```

Output looks like:

```
→ Joe Zolinski (joe@tkbsmarketing.com)
  Created auth user id=...
  Recovery link (send to Joe Zolinski):
    https://<project>.supabase.co/auth/v1/verify?token=...&type=recovery&redirect_to=...

→ Josh Horsley (josh@tkbsmarketing.com)
  Created auth user id=...
  Recovery link (send to Josh Horsley):
    https://<project>.supabase.co/auth/v1/verify?token=...&type=recovery&redirect_to=...
```

Send each person their recovery link (Slack DM is fine — links are single-use and time-limited). They click it, set their real password, and they're in.

## What if I need to re-run the migration?

The migration is **not idempotent** beyond `CREATE SCHEMA IF NOT EXISTS` — if `crm.clients` already exists, the next `CREATE TABLE crm.clients` will fail. To re-apply against a non-empty schema, drop the schema first:

```sql
DROP SCHEMA crm CASCADE;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
```

Then re-run the migration. **This wipes all CRM data.** Don't do this in production once we have real data.

## Verifying the setup

After applying the migration:

```sql
-- In the Supabase SQL editor, you should see 13 tables in the crm schema
SELECT tablename FROM pg_tables WHERE schemaname = 'crm' ORDER BY tablename;
-- expected: activities, audit_log, call_recordings, clients, documents,
-- email_messages, engagements, generation_jobs, integration_settings,
-- outbound_webhooks, profiles, script_templates, sms_messages
```

After seeding users:

```sql
SELECT email, role, created_at FROM crm.profiles ORDER BY created_at;
-- expected: 2 rows, joe@ and josh@, both 'admin'
```
