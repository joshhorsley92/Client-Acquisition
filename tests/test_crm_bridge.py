import pytest
from database.supabase_client import Database
from database.migrate import run_migration
from database.crm_bridge import push_leads_to_crm, CRM_TABLES_SQL, _build_research_findings, log_activity, _execute_stage_actions


@pytest.fixture
def db():
    """Create in-memory DB with both acq_* and CRM tables."""
    database = Database(":memory:")
    run_migration(database)
    # Create CRM tables for testing
    for statement in CRM_TABLES_SQL.strip().split(";"):
        statement = statement.strip()
        if statement:
            database.conn.execute(statement + ";")
    database.conn.commit()
    yield database
    database.close()


def test_push_creates_company_contact_deal(db):
    lead = db.upsert_lead({
        "business_name": "Test Shop",
        "platform_source": "etsy",
        "platform_url": "https://etsy.com/shop/test",
        "industry": "e-commerce",
        "website_url": "https://testshop.com",
        "review_count": 200,
    })
    db.update_lead_status(lead["id"], "enriched")
    db.insert_contact({"lead_id": lead["id"], "name": "Jane", "email": "jane@test.com", "role": "Owner", "source": "website"})

    results = push_leads_to_crm(db)

    assert results["pushed"] == 1
    assert results["skipped"] == 0

    # Verify company created
    company = db.conn.execute("SELECT * FROM companies WHERE name = 'Test Shop'").fetchone()
    assert company is not None

    # Verify contact created
    contact = db.conn.execute("SELECT * FROM contacts WHERE email = 'jane@test.com'").fetchone()
    assert contact is not None

    # Verify deal created
    deal = db.conn.execute("SELECT * FROM deals").fetchone()
    assert deal is not None


def test_push_deduplicates_company(db):
    # Pre-existing company in CRM
    db.conn.execute("INSERT INTO companies (name, location) VALUES ('Test Shop', 'Detroit')")
    db.conn.commit()

    lead = db.upsert_lead({
        "business_name": "Test Shop",
        "platform_source": "etsy",
        "platform_url": "https://etsy.com/shop/test",
        "website_url": "https://testshop.com",
    })
    db.update_lead_status(lead["id"], "enriched")

    results = push_leads_to_crm(db)

    assert results["pushed"] == 1
    # Should NOT create duplicate company
    companies = db.conn.execute("SELECT * FROM companies WHERE name = 'Test Shop'").fetchall()
    assert len(companies) == 1


def test_push_skips_active_deal(db):
    # Pre-existing company with active deal
    db.conn.execute("INSERT INTO companies (name) VALUES ('Active Shop')")
    company_id = db.conn.execute("SELECT id FROM companies WHERE name = 'Active Shop'").fetchone()[0]
    db.conn.execute("INSERT INTO deals (company_id, stage, source) VALUES (?, 'outreach', 'cold')", (company_id,))
    db.conn.commit()

    lead = db.upsert_lead({
        "business_name": "Active Shop",
        "platform_source": "etsy",
        "platform_url": "https://etsy.com/shop/active",
    })
    db.update_lead_status(lead["id"], "enriched")

    results = push_leads_to_crm(db)

    assert results["skipped"] == 1
    assert results["pushed"] == 0


def test_push_deduplicates_contact_by_email(db):
    # Pre-existing contact
    db.conn.execute("INSERT INTO contacts (name, email) VALUES ('Jane Existing', 'jane@test.com')")
    db.conn.commit()

    lead = db.upsert_lead({
        "business_name": "New Shop",
        "platform_source": "etsy",
        "platform_url": "https://etsy.com/shop/new",
    })
    db.update_lead_status(lead["id"], "enriched")
    db.insert_contact({"lead_id": lead["id"], "name": "Jane New", "email": "jane@test.com", "source": "website"})

    results = push_leads_to_crm(db)

    assert results["pushed"] == 1
    # Should NOT create duplicate contact
    contacts = db.conn.execute("SELECT * FROM contacts WHERE email = 'jane@test.com'").fetchall()
    assert len(contacts) == 1


def test_push_includes_research_findings(db):
    lead = db.upsert_lead({
        "business_name": "Signal Shop",
        "platform_source": "etsy",
        "platform_url": "https://etsy.com/shop/signal",
    })
    db.update_lead_status(lead["id"], "enriched")
    db.upsert_marketing_signals({
        "lead_id": lead["id"],
        "has_website": False,
        "has_social_media": True,
        "social_platforms": ["instagram", "facebook"],
        "website_quality": "none",
        "has_seo": False,
        "has_paid_ads": False,
    })

    results = push_leads_to_crm(db)

    deal = db.conn.execute("SELECT research_findings FROM deals").fetchone()
    findings = dict(deal)["research_findings"] if hasattr(deal, 'keys') else deal[0]
    assert "No standalone website" in (findings or "")


def test_push_specific_lead_ids(db):
    lead1 = db.upsert_lead({"business_name": "Shop A", "platform_source": "etsy", "platform_url": "url1"})
    lead2 = db.upsert_lead({"business_name": "Shop B", "platform_source": "etsy", "platform_url": "url2"})
    db.update_lead_status(lead1["id"], "enriched")
    db.update_lead_status(lead2["id"], "enriched")

    results = push_leads_to_crm(db, lead_ids=[lead1["id"]])

    assert results["pushed"] == 1
    companies = db.conn.execute("SELECT name FROM companies").fetchall()
    names = [dict(c)["name"] if hasattr(c, 'keys') else c[0] for c in companies]
    assert "Shop A" in names
    assert "Shop B" not in names


def test_push_updates_lead_status_to_contacted(db):
    lead = db.upsert_lead({
        "business_name": "Status Shop",
        "platform_source": "etsy",
        "platform_url": "https://etsy.com/shop/status",
    })
    db.update_lead_status(lead["id"], "enriched")

    push_leads_to_crm(db)

    updated_lead = db.get_lead_by_id(lead["id"])
    assert updated_lead["status"] == "contacted"


def test_build_research_findings():
    signals = {
        "has_website": True,
        "website_quality": "basic",
        "has_social_media": True,
        "social_platforms": ["instagram", "facebook"],
        "has_seo": False,
        "has_paid_ads": False,
    }
    findings = _build_research_findings(signals)
    assert "Website quality: basic" in findings
    assert "instagram" in findings
    assert "No SEO" in findings


def test_build_research_findings_none():
    assert _build_research_findings(None) is None


def _seed_stage_actions(db):
    """Insert default 'lead' stage actions matching CRM seed.sql."""
    db.conn.execute("""
        INSERT INTO stage_actions (stage, action_type, config, sort_order)
        VALUES ('lead', 'create_tasks', '{"tasks":[{"description":"Research prospect","due_offset_days":0},{"description":"Send first outreach","due_offset_days":1}]}', 0)
    """)
    db.conn.commit()


def test_push_creates_tasks_from_stage_actions(db):
    _seed_stage_actions(db)
    lead = db.upsert_lead({
        "business_name": "Task Shop",
        "platform_source": "etsy",
        "platform_url": "https://etsy.com/shop/taskshop",
    })
    db.update_lead_status(lead["id"], "enriched")

    push_leads_to_crm(db)

    tasks = db.conn.execute("SELECT * FROM tasks").fetchall()
    assert len(tasks) == 2
    descriptions = [dict(t)["description"] for t in tasks]
    assert "Research prospect" in descriptions
    assert "Send first outreach" in descriptions
    # Verify auto_generated flag
    for t in tasks:
        assert dict(t)["auto_generated"] == 1


def test_push_creates_activity_on_deal_creation(db):
    lead = db.upsert_lead({
        "business_name": "Activity Shop",
        "platform_source": "etsy",
        "platform_url": "https://etsy.com/shop/activityshop",
    })
    db.update_lead_status(lead["id"], "enriched")

    push_leads_to_crm(db)

    activities = db.conn.execute("SELECT * FROM activities").fetchall()
    assert len(activities) == 1
    activity = dict(activities[0])
    assert activity["type"] == "stage_change"
    assert "lead acquisition" in activity["content"]


def test_push_no_stage_actions_still_works(db):
    lead = db.upsert_lead({
        "business_name": "No Actions Shop",
        "platform_source": "etsy",
        "platform_url": "https://etsy.com/shop/noactions",
    })
    db.update_lead_status(lead["id"], "enriched")

    results = push_leads_to_crm(db)

    assert results["pushed"] == 1
    tasks = db.conn.execute("SELECT * FROM tasks").fetchall()
    assert len(tasks) == 0


def test_push_disabled_stage_action_skipped(db):
    db.conn.execute("""
        INSERT INTO stage_actions (stage, action_type, config, enabled, sort_order)
        VALUES ('lead', 'create_tasks', '{"tasks":[{"description":"Should not exist","due_offset_days":0}]}', 0, 0)
    """)
    db.conn.commit()

    lead = db.upsert_lead({
        "business_name": "Disabled Shop",
        "platform_source": "etsy",
        "platform_url": "https://etsy.com/shop/disabled",
    })
    db.update_lead_status(lead["id"], "enriched")

    push_leads_to_crm(db)

    tasks = db.conn.execute("SELECT * FROM tasks").fetchall()
    assert len(tasks) == 0


def test_push_dry_run_no_writes(db):
    """Dry-run mode should not write any rows to the database."""
    lead = db.upsert_lead({
        "business_name": "Dry Run Shop",
        "platform_source": "etsy",
        "platform_url": "https://etsy.com/shop/dryrun",
    })
    db.update_lead_status(lead["id"], "enriched")
    db.insert_contact({"lead_id": lead["id"], "name": "Jane", "email": "jane@dry.com", "source": "website"})

    results = push_leads_to_crm(db, dry_run=True)

    # No writes
    assert db.conn.execute("SELECT COUNT(*) FROM companies").fetchone()[0] == 0
    assert db.conn.execute("SELECT COUNT(*) FROM deals").fetchone()[0] == 0
    assert db.conn.execute("SELECT COUNT(*) FROM contacts").fetchone()[0] == 0

    # Previews returned
    assert "previews" in results
    assert len(results["previews"]) == 1
    assert results["previews"][0]["business_name"] == "Dry Run Shop"
    assert "CREATE NEW" in results["previews"][0]["company_action"]
    assert results["summary"]["would_push"] == 1
    assert results["summary"]["would_skip"] == 0


def test_push_dry_run_detects_skip(db):
    """Dry-run should correctly detect leads that would be skipped due to existing active deal."""
    db.conn.execute("INSERT INTO companies (name) VALUES ('Active Shop')")
    company_id = db.conn.execute("SELECT id FROM companies WHERE name = 'Active Shop'").fetchone()[0]
    db.conn.execute(
        "INSERT INTO deals (company_id, stage, source, created_at, updated_at) VALUES (?, 'outreach', 'cold', datetime('now'), datetime('now'))",
        (company_id,)
    )
    db.conn.commit()

    lead = db.upsert_lead({
        "business_name": "Active Shop",
        "platform_source": "etsy",
        "platform_url": "https://etsy.com/shop/active",
    })
    db.update_lead_status(lead["id"], "enriched")

    results = push_leads_to_crm(db, dry_run=True)

    assert results["summary"]["would_skip"] == 1
    assert results["summary"]["would_push"] == 0
    assert results["previews"][0]["skip_reason"] is not None
    assert "Active deal" in results["previews"][0]["skip_reason"]
