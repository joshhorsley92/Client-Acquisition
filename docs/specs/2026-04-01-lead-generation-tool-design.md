# TKBS Client Acquisition Tool Suite — Design Spec

## Context

Turnkey Marketing (TKBS) needs a lead generation tool to find, qualify, and reach out to potential clients. The business serves a mix of local small businesses and B2B companies across e-commerce, retail/boutique, and crowdfunding/startup industries. Currently, lead discovery is manual. This tool automates scraping, enrichment, and personalized outreach document generation — storing everything in Supabase alongside existing Launch product tables.

## Approach

Monolithic Python script suite with modular components. CLI-driven, start simple, grow later. Free scraping methods only (no paid APIs).

## Project Structure

```
Client-Acquisition-1/
├── scrapers/
│   ├── etsy.py
│   ├── kickstarter.py
│   └── county_registry.py
├── enrichment/
│   ├── email_finder.py
│   └── contact_finder.py
├── outreach/
│   ├── templates/
│   │   ├── mailer.docx
│   │   └── email.html
│   ├── generator.py
│   └── qr_generator.py
├── database/
│   └── supabase_client.py
├── assets/
│   ├── tkbs-faviconv2.svg
│   ├── tkbs-logo-horizontal-dark.svg
│   ├── tkbs-logo-horizontal-light.svg
│   ├── tkbs-logo-stacked-dark.svg
│   ├── tkbs-logo-stacked-light.svg
│   └── brand/
├── config.py
├── main.py
├── requirements.txt
├── .env.example
├── .gitignore
└── README.md
```

## Database Schema (Supabase)

All tables prefixed with `acq_` to avoid collision with existing Launch tables.

### Non-Destructive Guarantees

- **Never DROP or ALTER existing tables** — migrations only CREATE with `IF NOT EXISTS`
- **Never DELETE lead records** — status changes are soft-deletes
- **Append-only enrichment** — existing non-null fields are preserved unless new data is explicitly better
- **Outreach log is insert-only** — every attempt is a new row, never modified
- **Deduplication via upsert** — matched by `platform_source` + `platform_url`, merges into existing record
- **No interaction with existing Launch tables** — code only reads/writes `acq_*` tables

### `acq_leads`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| business_name | text | Company/shop name |
| platform_source | text | 'etsy', 'kickstarter', or 'county_registry' |
| platform_url | text | Link to platform listing |
| industry | text | e-commerce, retail/boutique, crowdfunding/startup |
| location | text | City/county or 'online' |
| review_count | integer | Reviews, backers, or equivalent metric |
| rating | decimal | Average rating if available |
| website_url | text | Business website |
| status | text | 'new', 'enriched', 'contacted', 'responded', 'converted', 'declined' |
| created_at | timestamp | When lead was first scraped |
| updated_at | timestamp | Last modified |

Unique constraint on (`platform_source`, `platform_url`) for deduplication.

### `acq_lead_contacts`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| lead_id | uuid (FK) | References acq_leads.id |
| name | text | Contact person's name |
| role | text | Owner, founder, manager, etc. |
| email | text | Scraped email address |
| phone | text | If found |
| source | text | Where contact was found (website, social, platform profile) |

### `acq_outreach_log`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| lead_id | uuid (FK) | References acq_leads.id |
| type | text | 'mailer' or 'email' |
| sent_at | timestamp | When it was sent |
| utm_code | text | UTM tracking code |
| qr_url | text | Full URL embedded in QR code |
| personalization_notes | text | Pitch points used |

### `acq_marketing_signals`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| lead_id | uuid (FK) | References acq_leads.id |
| has_website | boolean | Has a standalone website? |
| has_social_media | boolean | Active social presence? |
| social_platforms | text[] | Which platforms |
| website_quality | text | 'none', 'basic', 'decent', 'professional' |
| has_seo | boolean | Basic SEO signals present? |
| has_paid_ads | boolean | Running ads? |
| notes | text | Freeform observations |

## Scrapers

All scrapers follow the same pattern: search with filters, extract data, upsert into `acq_leads`.

### Etsy Scraper (`scrapers/etsy.py`)

- Searches Etsy for shops in target categories (e-commerce, retail/boutique)
- Filters by 100+ reviews
- Extracts: shop name, URL, review count, rating, linked website/social from About page
- Uses `requests` + `BeautifulSoup`, falling back to `Selenium` for JS-heavy pages
- Rate limited with random delays between requests

### Kickstarter Scraper (`scrapers/kickstarter.py`)

- Searches completed/active projects in relevant categories
- Filters by 100+ backers
- Extracts: project name, creator info, funding amount, backer count, creator's website
- Uses `requests` + `BeautifulSoup` with `Selenium` fallback
- Rate limited with random delays

### County Registry Scraper (`scrapers/county_registry.py`)

- Targets Metro Detroit counties: Wayne, Oakland, Macomb and surrounding
- Filters by business type/industry codes matching retail, e-commerce, startup categories
- Extracts: business name, registered agent, address, filing date
- Rate limited with random delays

## Enrichment Pipeline

Runs against leads with status `'new'`. Updates status to `'enriched'` on completion.

### Email Finder (`enrichment/email_finder.py`)

1. Visits lead's website
2. Crawls Contact, About, Team, and Footer pages
3. Extracts emails via regex and `mailto:` links
4. Stores in `acq_lead_contacts`

### Contact Finder (`enrichment/contact_finder.py`)

1. Scrapes About/Team pages for names and roles
2. Checks Etsy/Kickstarter profiles for creator/owner name
3. Uses registered agent name from county filings
4. Stores in `acq_lead_contacts`

### Marketing Signal Analyzer (part of enrichment)

1. Checks for standalone website
2. Scans for social media links (Instagram, Facebook, Twitter, TikTok)
3. Basic website quality assessment (mobile responsive, SSL, modern vs. dated)
4. SEO checks (meta descriptions, title tags, alt text)
5. Paid ads detection (Google Ads pixel, Meta pixel)
6. Stores in `acq_marketing_signals`

## Outreach Document Generation

### Brand Assets

- Accent color: `#00D4AA` (teal)
- Dark background: `#1B2838` (navy)
- Text on light: `#1B2838`
- Subtle text: `#64748B` (slate)
- Font: Arial, Bold
- Tagline: "YOUR GROWTH, UNLOCKED"
- Mailer letterhead: horizontal light-background logo
- Email header: stacked light-background logo

### Physical Mailer (DOCX)

- TKBS letterhead with logo via `python-docx`
- Personalized greeting (contact name + business name)
- Tailored pitch paragraphs from marketing signals
- QR code in footer with UTM-tracked URL (`?utm_source=mailer&utm_campaign=acq&utm_content={lead_id}`)
- Call to action

### Digital Email (HTML)

- Same personalized content, adapted for email format
- Inline CSS for email client compatibility
- UTM-tracked links (no QR code)
- Shorter format — hook, not full pitch

### Pitch Logic

Configurable mapping in config file:

| Signal | Pitch Angle |
|--------|-------------|
| No website | "You're leaving money on the table without a site you own" |
| No social media | "Your competitors are building audiences you're missing" |
| Basic/dated website | "Your online presence doesn't match the quality of your product" |
| No SEO | "Customers are searching for what you sell but can't find you" |
| No paid ads | "There's untapped demand you could be capturing" |

### QR Code Generation

- Uses `qrcode` library
- Each QR encodes a unique UTM-parameterized URL per lead
- Embedded into DOCX mailer
- **Note**: The QR destination URL (e.g., a TKBS landing page) is configured in `config.py`. The landing page itself is outside this repo's scope — the tool just generates the tracked QR link.

## CLI Interface

```bash
# Scraping
python main.py scrape etsy
python main.py scrape kickstarter
python main.py scrape county
python main.py scrape all

# Enrichment
python main.py enrich
python main.py enrich --lead-id <id>

# Outreach generation
python main.py generate --status enriched
python main.py generate --lead-id <id>
python main.py generate --format mailer
python main.py generate --format email

# Database utilities
python main.py list --status new
python main.py stats
```

### Typical Workflow

1. `python main.py scrape all` — gather leads from all sources
2. `python main.py enrich` — find emails, contacts, marketing signals
3. Review leads in Supabase dashboard, pick targets
4. `python main.py generate --status enriched` — produce personalized mailers and emails
5. Print mailers / send emails, log outreach

## Key Dependencies

- `requests` — HTTP requests
- `beautifulsoup4` — HTML parsing
- `selenium` — JS-heavy page scraping
- `supabase` — Supabase Python client
- `python-docx` — DOCX generation
- `jinja2` — Template rendering
- `qrcode` — QR code generation
- `Pillow` — Image processing for QR codes
- `click` — CLI framework
- `python-dotenv` — Environment variable management

## Verification Plan

1. **Database**: Run migration script, confirm all `acq_*` tables created in Supabase without affecting existing tables
2. **Scrapers**: Run each scraper individually, verify leads appear in `acq_leads` with correct data
3. **Deduplication**: Run a scraper twice, confirm no duplicate records created
4. **Enrichment**: Run enrichment on scraped leads, verify `acq_lead_contacts` and `acq_marketing_signals` populated
5. **Document generation**: Generate a mailer and email for an enriched lead, verify personalization and QR code
6. **UTM tracking**: Scan generated QR code, confirm URL has correct UTM parameters
7. **Non-destructive**: Verify existing Launch tables are untouched after all operations
