import os
import pytest
from unittest.mock import MagicMock, patch
from database.supabase_client import Database
from database.migrate import run_migration
from database.crm_bridge import (
    CRM_TABLES_SQL, push_leads_to_crm, find_deal_for_lead,
    register_document, log_activity,
)


@pytest.fixture
def db():
    """Create in-memory DB with both acq_* and CRM tables."""
    database = Database(":memory:")
    run_migration(database)
    for statement in CRM_TABLES_SQL.strip().split(";"):
        statement = statement.strip()
        if statement:
            database.conn.execute(statement + ";")
    database.conn.commit()
    yield database
    database.close()


def _create_and_push_lead(db, name="Test Shop"):
    """Helper: create a lead, enrich it, push to CRM, return lead dict."""
    lead = db.upsert_lead({
        "business_name": name,
        "platform_source": "etsy",
        "platform_url": f"https://etsy.com/shop/{name.lower().replace(' ', '')}",
        "industry": "e-commerce",
    })
    db.update_lead_status(lead["id"], "enriched")
    push_leads_to_crm(db)
    return lead


def test_find_deal_for_lead_returns_id(db):
    lead = _create_and_push_lead(db)
    deal_id = find_deal_for_lead(db, lead["id"])
    assert deal_id is not None
    assert isinstance(deal_id, int)


def test_find_deal_for_lead_no_push_returns_none(db):
    lead = db.upsert_lead({
        "business_name": "Unpushed Shop",
        "platform_source": "etsy",
        "platform_url": "https://etsy.com/shop/unpushed",
    })
    deal_id = find_deal_for_lead(db, lead["id"])
    assert deal_id is None


def test_register_document_creates_row(db):
    lead = _create_and_push_lead(db)
    deal_id = find_deal_for_lead(db, lead["id"])

    register_document(db, deal_id, "output/test/mailer.docx", "mailer.docx", "other")
    db.conn.commit()

    docs = db.conn.execute("SELECT * FROM documents WHERE deal_id = ?", (deal_id,)).fetchall()
    assert len(docs) == 1
    doc = dict(docs[0])
    assert doc["file_name"] == "mailer.docx"
    assert doc["type"] == "other"


def test_generate_links_documents_when_deal_exists(db):
    lead = _create_and_push_lead(db)
    deal_id = find_deal_for_lead(db, lead["id"])
    assert deal_id is not None

    # Generate outreach for this lead
    from outreach.generator import OutreachGenerator
    gen = OutreachGenerator(db=db, base_url="https://turnkey.com/start")
    results = gen.generate_for_lead(lead["id"], format="both")

    # Check documents table
    docs = db.conn.execute("SELECT * FROM documents WHERE deal_id = ?", (deal_id,)).fetchall()
    assert len(docs) == 2  # mailer + email
    file_names = [dict(d)["file_name"] for d in docs]
    assert "mailer.docx" in file_names
    assert "email.html" in file_names

    # Check activities
    activities = db.conn.execute(
        "SELECT * FROM activities WHERE deal_id = ? AND type = 'system'", (deal_id,)
    ).fetchall()
    assert len(activities) == 2

    # Cleanup generated files
    import shutil
    output_dir = os.path.join("output", lead["id"])
    if os.path.exists(output_dir):
        shutil.rmtree(output_dir)


def test_generate_no_deal_no_error(db):
    lead = db.upsert_lead({
        "business_name": "No Deal Shop",
        "platform_source": "etsy",
        "platform_url": "https://etsy.com/shop/nodeal",
    })

    from outreach.generator import OutreachGenerator
    gen = OutreachGenerator(db=db, base_url="https://turnkey.com/start")
    # Should not raise an error
    results = gen.generate_for_lead(lead["id"], format="both")
    assert "mailer" in results

    # No documents should be registered
    docs = db.conn.execute("SELECT * FROM documents").fetchall()
    assert len(docs) == 0

    # Cleanup
    import shutil
    output_dir = os.path.join("output", lead["id"])
    if os.path.exists(output_dir):
        shutil.rmtree(output_dir)
