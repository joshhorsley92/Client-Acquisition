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

## Architecture

- **scrapers/** — Etsy, Kickstarter, and Michigan county registry scrapers
- **enrichment/** — Email finder, contact finder, and marketing signal analyzer
- **outreach/** — Personalized DOCX mailer and HTML email generator with QR codes
- **database/** — SQLite database layer (shared with TKBS CRM)
- **main.py** — Click CLI entry point
