# database/migrate.py
MIGRATION_SQL = """
CREATE TABLE IF NOT EXISTS acq_leads (
    id TEXT PRIMARY KEY,
    business_name TEXT,
    platform_source TEXT NOT NULL,
    platform_url TEXT NOT NULL,
    industry TEXT,
    location TEXT,
    review_count INTEGER,
    rating REAL,
    website_url TEXT,
    status TEXT DEFAULT 'new',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(platform_source, platform_url)
);

CREATE TABLE IF NOT EXISTS acq_lead_contacts (
    id TEXT PRIMARY KEY,
    lead_id TEXT REFERENCES acq_leads(id),
    name TEXT,
    role TEXT,
    email TEXT,
    phone TEXT,
    source TEXT
);

CREATE TABLE IF NOT EXISTS acq_outreach_log (
    id TEXT PRIMARY KEY,
    lead_id TEXT REFERENCES acq_leads(id),
    type TEXT,
    sent_at TEXT DEFAULT (datetime('now')),
    utm_code TEXT,
    qr_url TEXT,
    personalization_notes TEXT
);

CREATE TABLE IF NOT EXISTS acq_marketing_signals (
    id TEXT PRIMARY KEY,
    lead_id TEXT REFERENCES acq_leads(id) UNIQUE,
    has_website INTEGER,
    has_social_media INTEGER,
    social_platforms TEXT,
    website_quality TEXT,
    has_seo INTEGER,
    has_paid_ads INTEGER,
    notes TEXT
);
"""


def run_migration(db):
    """Run migration SQL against SQLite database."""
    for statement in MIGRATION_SQL.strip().split(";"):
        statement = statement.strip()
        if statement:
            db.conn.execute(statement + ";")
    db.conn.commit()
    print("Migration complete. All acq_* tables created.")
