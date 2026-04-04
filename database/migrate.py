from database.supabase_client import SupabaseDB

MIGRATION_SQL = """
CREATE TABLE IF NOT EXISTS acq_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name TEXT,
    platform_source TEXT NOT NULL,
    platform_url TEXT NOT NULL,
    industry TEXT,
    location TEXT,
    review_count INTEGER,
    rating DECIMAL,
    website_url TEXT,
    status TEXT DEFAULT 'new',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(platform_source, platform_url)
);

CREATE TABLE IF NOT EXISTS acq_lead_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES acq_leads(id),
    name TEXT,
    role TEXT,
    email TEXT,
    phone TEXT,
    source TEXT
);

CREATE TABLE IF NOT EXISTS acq_outreach_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES acq_leads(id),
    type TEXT,
    sent_at TIMESTAMPTZ DEFAULT now(),
    utm_code TEXT,
    qr_url TEXT,
    personalization_notes TEXT
);

CREATE TABLE IF NOT EXISTS acq_marketing_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES acq_leads(id) UNIQUE,
    has_website BOOLEAN,
    has_social_media BOOLEAN,
    social_platforms TEXT[],
    website_quality TEXT,
    has_seo BOOLEAN,
    has_paid_ads BOOLEAN,
    notes TEXT
);
"""


def run_migration(db: SupabaseDB):
    """Run migration SQL against Supabase. Uses the rpc or raw SQL endpoint."""
    db.client.postgrest.auth(db.client.supabase_key)
    for statement in MIGRATION_SQL.strip().split(";"):
        statement = statement.strip()
        if statement:
            db.client.rpc("exec_sql", {"query": statement + ";"}).execute()
    print("Migration complete. All acq_* tables created.")
