import json
import pytest
from database.supabase_client import Database
from database.migrate import run_migration
from database.crm_bridge import (
    push_leads_to_crm,
    find_client_for_lead,
    CRM_TABLES_SQL,
    _build_enrichment_data,
    _build_notes,
)


@pytest.fixture
def db():
    """In-memory DB with both acq_* and v2 CRM tables."""
    database = Database(":memory:")
    run_migration(database)
    for statement in CRM_TABLES_SQL.strip().split(";"):
        statement = statement.strip()
        if statement:
            database.conn.execute(statement + ";")
    database.conn.commit()
    yield database
    database.close()


def _enrich(db, lead_id, business_name="Test Shop", **lead_overrides):
    """Helper: upsert a lead, mark enriched, return the lead row."""
    base = {
        "business_name": business_name,
        "platform_source": "county_registry",
        "platform_url": f"michigan-lara://{business_name}",
        "industry": "retail/boutique",
        "location": "Wayne",
    }
    base.update(lead_overrides)
    lead = db.upsert_lead(base)
    db.update_lead_status(lead["id"], "enriched")
    return lead


# ----- core push behaviour -----

def test_push_creates_client(db):
    lead = _enrich(db, "lead-1", "Acme Retail",
                   website_url="https://acme.example", review_count=42, rating=4.7)

    results = push_leads_to_crm(db)

    assert results == {"pushed": 1, "skipped": 0, "errors": 0}
    row = db.conn.execute(
        "SELECT name, website, industry, location, source_lead_id, source_platform, source_url, owner_id "
        "FROM clients WHERE source_lead_id = ?",
        (lead["id"],),
    ).fetchone()
    assert row is not None
    assert row["name"] == "Acme Retail"
    assert row["website"] == "https://acme.example"
    assert row["industry"] == "retail/boutique"
    assert row["location"] == "Wayne"
    assert row["source_lead_id"] == lead["id"]
    assert row["source_platform"] == "county_registry"
    assert row["source_url"].startswith("michigan-lara://")
    assert row["owner_id"] == 1


def test_push_writes_source_imported_at_timestamp(db):
    lead = _enrich(db, "lead-ts", "Timestamped Co")
    push_leads_to_crm(db)
    row = db.conn.execute(
        "SELECT source_imported_at FROM clients WHERE source_lead_id = ?",
        (lead["id"],),
    ).fetchone()
    assert row["source_imported_at"] is not None
    assert "T" in row["source_imported_at"]  # ISO format


def test_push_skips_already_imported_lead(db):
    lead = _enrich(db, "lead-dedup", "Already In CRM")

    first = push_leads_to_crm(db)
    assert first["pushed"] == 1

    db.update_lead_status(lead["id"], "enriched")

    second = push_leads_to_crm(db)
    assert second["pushed"] == 0
    assert second["skipped"] == 1
    count = db.conn.execute(
        "SELECT COUNT(*) AS n FROM clients WHERE source_lead_id = ?",
        (lead["id"],),
    ).fetchone()["n"]
    assert count == 1


def test_push_updates_lead_status_to_in_crm(db):
    lead = _enrich(db, "lead-status", "Status Shop")
    push_leads_to_crm(db)
    refreshed = db.get_lead_by_id(lead["id"])
    assert refreshed["status"] == "in_crm"


def test_push_skips_lead_with_no_business_name(db):
    lead = db.upsert_lead({
        "business_name": None,
        "platform_source": "county_registry",
        "platform_url": "michigan-lara://no-name",
    })
    db.update_lead_status(lead["id"], "enriched")
    results = push_leads_to_crm(db)
    assert results["pushed"] == 0
    assert results["skipped"] == 1


def test_push_specific_lead_ids(db):
    lead1 = _enrich(db, "l1", "First Shop")
    lead2 = _enrich(db, "l2", "Second Shop")

    results = push_leads_to_crm(db, lead_ids=[lead1["id"]])

    assert results["pushed"] == 1
    pushed = db.conn.execute(
        "SELECT name FROM clients WHERE source_lead_id = ?", (lead1["id"],)
    ).fetchone()
    assert pushed["name"] == "First Shop"
    not_pushed = db.conn.execute(
        "SELECT 1 FROM clients WHERE source_lead_id = ?", (lead2["id"],)
    ).fetchone()
    assert not_pushed is None


# ----- contact handling -----

def test_push_includes_primary_contact(db):
    lead = _enrich(db, "lead-contact", "Contact Co")
    db.insert_contact({
        "lead_id": lead["id"], "name": "Sarah Owner",
        "email": "sarah@contact.example", "phone": "555-0100", "role": "Owner", "source": "website",
    })
    push_leads_to_crm(db)
    row = db.conn.execute(
        "SELECT primary_contact_name, email, phone, role FROM clients WHERE source_lead_id = ?",
        (lead["id"],),
    ).fetchone()
    assert row["primary_contact_name"] == "Sarah Owner"
    assert row["email"] == "sarah@contact.example"
    assert row["phone"] == "555-0100"
    assert row["role"] == "Owner"


def test_push_serializes_additional_contacts_to_json(db):
    lead = _enrich(db, "lead-multi", "Multi Contact")
    db.insert_contact({
        "lead_id": lead["id"], "name": "Primary", "email": "p@x.com", "source": "site"
    })
    db.insert_contact({
        "lead_id": lead["id"], "name": "Secondary", "email": "s@x.com", "source": "site"
    })
    db.insert_contact({
        "lead_id": lead["id"], "name": "Tertiary", "email": "t@x.com", "source": "site"
    })
    push_leads_to_crm(db)
    row = db.conn.execute(
        "SELECT primary_contact_name, additional_contacts FROM clients WHERE source_lead_id = ?",
        (lead["id"],),
    ).fetchone()
    assert row["primary_contact_name"] == "Primary"
    extra = json.loads(row["additional_contacts"])
    assert len(extra) == 2
    assert extra[0]["name"] == "Secondary"
    assert extra[1]["name"] == "Tertiary"


# ----- enrichment data -----

def test_push_no_signals_leaves_enrichment_status_none(db):
    lead = _enrich(db, "lead-no-signals", "Plain Shop")
    push_leads_to_crm(db)
    row = db.conn.execute(
        "SELECT enrichment_status, enrichment_data FROM clients WHERE source_lead_id = ?",
        (lead["id"],),
    ).fetchone()
    assert row["enrichment_status"] == "none"
    data = json.loads(row["enrichment_data"])
    # Lead-level facts always present
    assert data["platform_source"] == "county_registry"


def test_push_with_signals_marks_enrichment_succeeded(db):
    lead = _enrich(db, "lead-signals", "Signaled Co",
                   review_count=120, rating=4.8)
    db.upsert_marketing_signals({
        "lead_id": lead["id"],
        "has_website": True,
        "website_quality": "basic",
        "has_social_media": True,
        "social_platforms": ["instagram", "facebook"],
        "has_seo": False,
        "has_paid_ads": False,
    })
    push_leads_to_crm(db)
    row = db.conn.execute(
        "SELECT enrichment_status, enrichment_data FROM clients WHERE source_lead_id = ?",
        (lead["id"],),
    ).fetchone()
    assert row["enrichment_status"] == "succeeded"
    data = json.loads(row["enrichment_data"])
    assert data["has_website"] is True
    assert data["website_quality"] == "basic"
    assert data["social_platforms"] == ["instagram", "facebook"]
    assert data["review_count"] == 120
    assert data["rating"] == 4.8


# ----- activities -----

def test_push_logs_import_activity(db):
    lead = _enrich(db, "lead-activity", "Activity Co")
    push_leads_to_crm(db)
    activities = db.conn.execute(
        "SELECT type, content, metadata FROM activities ORDER BY id DESC LIMIT 1"
    ).fetchall()
    assert len(activities) == 1
    activity = activities[0]
    assert activity["type"] == "system"
    assert "Imported from" in activity["content"]
    meta = json.loads(activity["metadata"])
    assert meta["source_lead_id"] == lead["id"]


# ----- dry run -----

def test_push_dry_run_writes_nothing(db):
    lead = _enrich(db, "lead-dry", "Dry Run Co")
    db.insert_contact({"lead_id": lead["id"], "name": "Jane", "email": "j@x.com", "source": "site"})

    results = push_leads_to_crm(db, dry_run=True)

    assert db.conn.execute("SELECT COUNT(*) AS n FROM clients").fetchone()["n"] == 0
    assert "previews" in results
    assert results["summary"] == {"would_push": 1, "would_skip": 0}
    preview = results["previews"][0]
    assert preview["business_name"] == "Dry Run Co"
    assert preview["primary_contact"] == "Jane"
    assert preview["primary_email"] == "j@x.com"
    assert preview["skip_reason"] is None


def test_push_dry_run_detects_already_imported(db):
    lead = _enrich(db, "lead-dry-skip", "Already Here")
    push_leads_to_crm(db)  # real push

    db.update_lead_status(lead["id"], "enriched")
    results = push_leads_to_crm(db, dry_run=True)
    assert results["summary"] == {"would_push": 0, "would_skip": 1}
    assert "Already in CRM" in results["previews"][0]["skip_reason"]


# ----- helpers -----

def test_find_client_for_lead_returns_id(db):
    lead = _enrich(db, "lead-find", "Findable Co")
    push_leads_to_crm(db)
    client_id = find_client_for_lead(db, lead["id"])
    assert client_id is not None
    fetched = db.conn.execute(
        "SELECT name FROM clients WHERE id = ?", (client_id,)
    ).fetchone()
    assert fetched["name"] == "Findable Co"


def test_find_client_for_lead_returns_none_when_not_pushed(db):
    assert find_client_for_lead(db, "never-existed") is None


def test_build_notes_summarizes_signals():
    lead = {"platform_source": "county_registry", "review_count": 50, "rating": 4.5}
    signals = {"has_website": False, "has_social_media": False, "has_seo": False, "has_paid_ads": False}
    notes = _build_notes(lead, signals)
    assert "50 reviews" in notes
    assert "4.5★" in notes
    assert "no standalone website" in notes


def test_build_enrichment_data_strips_nulls():
    lead = {"platform_source": "county_registry", "platform_url": "x", "review_count": None, "rating": None}
    data = _build_enrichment_data(lead, None, [])
    assert "review_count" not in data
    assert "rating" not in data
    assert data["platform_source"] == "county_registry"
