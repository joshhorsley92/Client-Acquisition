# tests/test_supabase_client.py
import pytest
import os
import tempfile
from database.supabase_client import Database
from database.migrate import run_migration


@pytest.fixture
def db():
    """Create an in-memory SQLite database with acq_* tables for testing."""
    database = Database(":memory:")
    run_migration(database)
    yield database
    database.close()


def test_upsert_lead_new(db):
    lead = {
        "business_name": "Test Shop",
        "platform_source": "etsy",
        "platform_url": "https://etsy.com/shop/test",
        "industry": "e-commerce",
        "review_count": 150,
    }
    result = db.upsert_lead(lead)

    assert result["business_name"] == "Test Shop"
    assert result["status"] == "new"
    assert result["id"] is not None

    # Verify it's in the database
    fetched = db.get_leads_by_status("new")
    assert len(fetched) == 1
    assert fetched[0]["business_name"] == "Test Shop"


def test_upsert_lead_deduplicates(db):
    lead1 = {
        "business_name": "Test Shop",
        "platform_source": "etsy",
        "platform_url": "https://etsy.com/shop/test",
        "review_count": 100,
    }
    lead2 = {
        "business_name": "Test Shop Updated",
        "platform_source": "etsy",
        "platform_url": "https://etsy.com/shop/test",
        "review_count": 200,
    }
    db.upsert_lead(lead1)
    db.upsert_lead(lead2)

    leads = db.get_leads_by_status("new")
    assert len(leads) == 1
    assert leads[0]["business_name"] == "Test Shop Updated"
    assert leads[0]["review_count"] == 200


def test_insert_contact(db):
    lead = db.upsert_lead({
        "business_name": "Shop",
        "platform_source": "etsy",
        "platform_url": "https://etsy.com/shop/test",
    })
    contact = db.insert_contact({
        "lead_id": lead["id"],
        "name": "Jane Doe",
        "role": "Owner",
        "email": "jane@test.com",
        "source": "website",
    })
    assert contact["name"] == "Jane Doe"

    contacts = db.get_contacts_for_lead(lead["id"])
    assert len(contacts) == 1
    assert contacts[0]["email"] == "jane@test.com"


def test_upsert_marketing_signals(db):
    lead = db.upsert_lead({
        "business_name": "Shop",
        "platform_source": "etsy",
        "platform_url": "https://etsy.com/shop/test",
    })
    signals = {
        "lead_id": lead["id"],
        "has_website": True,
        "has_social_media": False,
        "social_platforms": ["instagram", "facebook"],
        "website_quality": "basic",
        "has_seo": False,
        "has_paid_ads": False,
    }
    db.upsert_marketing_signals(signals)

    result = db.get_signals_for_lead(lead["id"])
    assert result["has_website"] == 1  # SQLite stores booleans as integers
    assert result["website_quality"] == "basic"
    assert result["social_platforms"] == ["instagram", "facebook"]


def test_log_outreach(db):
    lead = db.upsert_lead({
        "business_name": "Shop",
        "platform_source": "etsy",
        "platform_url": "https://etsy.com/shop/test",
    })
    log = db.log_outreach({
        "lead_id": lead["id"],
        "type": "mailer",
        "utm_code": "acq_123",
        "qr_url": "https://turnkey.com/start?utm_content=123",
    })
    assert log["type"] == "mailer"


def test_get_leads_by_status(db):
    db.upsert_lead({"business_name": "A", "platform_source": "etsy", "platform_url": "url1"})
    db.upsert_lead({"business_name": "B", "platform_source": "etsy", "platform_url": "url2"})

    results = db.get_leads_by_status("new")
    assert len(results) == 2


def test_update_lead_status(db):
    lead = db.upsert_lead({
        "business_name": "Shop",
        "platform_source": "etsy",
        "platform_url": "https://etsy.com/shop/test",
    })
    db.update_lead_status(lead["id"], "enriched")

    result = db.get_lead_by_id(lead["id"])
    assert result["status"] == "enriched"


def test_get_lead_by_id(db):
    lead = db.upsert_lead({
        "business_name": "Test",
        "platform_source": "etsy",
        "platform_url": "https://etsy.com/shop/test",
    })
    result = db.get_lead_by_id(lead["id"])
    assert result["business_name"] == "Test"


def test_get_stats(db):
    db.upsert_lead({"business_name": "A", "platform_source": "etsy", "platform_url": "url1"})
    db.upsert_lead({"business_name": "B", "platform_source": "etsy", "platform_url": "url2"})
    lead = db.upsert_lead({"business_name": "C", "platform_source": "etsy", "platform_url": "url3"})
    db.update_lead_status(lead["id"], "enriched")

    stats = db.get_stats()
    assert stats["new"] == 2
    assert stats["enriched"] == 1


def test_no_delete_methods_exist(db):
    public_methods = [m for m in dir(db) if not m.startswith("_")]
    for method in public_methods:
        assert "delete" not in method.lower()
