# TKBS Client Acquisition Tool Suite

Lead generation and outreach tool for Turnkey Marketing. Scrapes business data from Etsy, Kickstarter, and Michigan county registries, enriches leads with contact info and marketing signals, and generates personalized outreach documents.

## Setup

1. Clone the repo and create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # or venv\Scripts\activate on Windows
   pip install -r requirements.txt
   ```

2. Copy `.env.example` to `.env` and adjust if needed:
   ```bash
   cp .env.example .env
   ```

3. Run the database migration:
   ```bash
   python main.py migrate
   ```

## Usage

```bash
# Scrape leads
python main.py scrape etsy
python main.py scrape kickstarter
python main.py scrape county
python main.py scrape all

# Enrich leads with contact info and marketing signals
python main.py enrich
python main.py enrich --lead-id <uuid>

# Generate personalized outreach documents
python main.py generate --status enriched
python main.py generate --lead-id <uuid>
python main.py generate --format mailer
python main.py generate --format email

# View leads and stats
python main.py list --status new
python main.py stats
```

## Testing

```bash
pytest -v
```

## CRM web app setup

The `tkbs-crm/` directory is a full Node/Express + React CRM sharing the same SQLite database. First-time setup:

```bash
cd tkbs-crm
npm install          # root-level deps (server + jest)
cd client && npm install && cd ..   # vite + react deps
cp .env.example .env                 # add ANTHROPIC_API_KEY + SESSION_SECRET
npm run dev                          # starts server (:3001) + client (:5173)
```

Seed admin accounts + the Wren & Ivy demo deal (idempotent, safe to re-run):

```bash
node scripts/seed-wren-ivy.js
```

Default logins (change password on first login):
- `joe@tkbsmarketing.com` / `changeme`
- `josh@tkbsmarketing.com` / `changeme`

> **Note:** each developer runs their own local CRM against their own `tkbs-crm.db`. You do NOT see each other's deals in real time. Shared multi-user access requires either a Tailscale deployment (Initiative 3) or the eventual Supabase migration. Until then, the seed script keeps both local DBs showing the same reference data.

## Architecture

- **scrapers/** — Etsy, Kickstarter, and Michigan county registry scrapers
- **enrichment/** — Email finder, contact finder, and marketing signal analyzer
- **outreach/** — Personalized DOCX mailer and HTML email generator with QR codes
- **database/** — SQLite database layer (shared with TKBS CRM)
- **main.py** — Click CLI entry point
- **tkbs-crm/** — Node/Express + React CRM, sessions + MFA + audit log + Fit Score + call recordings
