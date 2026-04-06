import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# SQL to create CRM tables (only for testing — in production these already exist)
CRM_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location TEXT,
    industry TEXT,
    type TEXT CHECK(type IN ('B2B', 'B2C')),
    website TEXT,
    social_links TEXT DEFAULT '{}',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT,
    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    stage TEXT NOT NULL DEFAULT 'lead',
    source TEXT CHECK(source IN ('referral', 'cold', 'web', 'content', 'paid_ads')),
    source_detail TEXT,
    estimated_value REAL DEFAULT 0,
    research_findings TEXT,
    owner_id INTEGER,
    stage_entered_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


def _build_research_findings(signals: dict | None) -> str | None:
    """Build a research findings summary from marketing signals."""
    if not signals:
        return None

    findings = []
    if signals.get("has_website"):
        findings.append(f"Website quality: {signals.get('website_quality', 'unknown')}")
    else:
        findings.append("No standalone website found")

    if signals.get("has_social_media"):
        platforms = signals.get("social_platforms", [])
        if isinstance(platforms, str):
            import json
            try:
                platforms = json.loads(platforms)
            except (json.JSONDecodeError, TypeError):
                platforms = []
        if platforms:
            findings.append(f"Social media: {', '.join(platforms)}")
    else:
        findings.append("No social media presence found")

    if signals.get("has_seo"):
        findings.append("Basic SEO signals present")
    else:
        findings.append("No SEO optimization detected")

    if signals.get("has_paid_ads"):
        findings.append("Running paid advertising")
    else:
        findings.append("No paid advertising detected")

    return "\n".join(findings)


def push_leads_to_crm(db, lead_ids: list[str] | None = None, owner_id: int = 1):
    """
    Push enriched leads from acq_leads into CRM tables (companies, contacts, deals).

    Args:
        db: Database instance (shared SQLite connection)
        lead_ids: Optional list of specific lead IDs to push. If None, pushes all 'enriched' leads.
        owner_id: CRM user ID to assign deals to (default: 1, the admin user)

    Returns:
        dict with counts: {"pushed": N, "skipped": M, "errors": E}
    """
    # Get leads to push
    if lead_ids:
        leads = []
        for lid in lead_ids:
            lead = db.get_lead_by_id(lid)
            if lead:
                leads.append(lead)
    else:
        leads = db.get_leads_by_status("enriched")

    results = {"pushed": 0, "skipped": 0, "errors": 0}

    for lead in leads:
        try:
            lead_id = lead["id"]
            business_name = lead.get("business_name")
            if not business_name:
                logger.warning(f"Lead {lead_id} has no business name, skipping")
                results["skipped"] += 1
                continue

            # 1. Company dedup
            existing_company = db.conn.execute(
                "SELECT id FROM companies WHERE name = ?", (business_name,)
            ).fetchone()

            company_id = None
            if existing_company:
                company_id = existing_company[0] if isinstance(existing_company, tuple) else existing_company["id"]
                # Check for active deal
                active_deal = db.conn.execute(
                    "SELECT id FROM deals WHERE company_id = ? AND stage NOT IN ('closed_won', 'closed_lost')",
                    (company_id,)
                ).fetchone()
                if active_deal:
                    logger.info(f"Lead {lead_id} ({business_name}) already has active deal, skipping")
                    results["skipped"] += 1
                    db.update_lead_status(lead_id, "contacted")
                    continue

                # Update nulls via COALESCE
                db.conn.execute("""
                    UPDATE companies SET
                        location = COALESCE(location, ?),
                        industry = COALESCE(industry, ?),
                        website = COALESCE(website, ?),
                        updated_at = ?
                    WHERE id = ?
                """, (
                    lead.get("location"),
                    lead.get("industry"),
                    lead.get("website_url"),
                    datetime.now().isoformat(),
                    company_id,
                ))
            else:
                cursor = db.conn.execute(
                    "INSERT INTO companies (name, location, industry, website) VALUES (?, ?, ?, ?)",
                    (business_name, lead.get("location"), lead.get("industry"), lead.get("website_url"))
                )
                company_id = cursor.lastrowid

            # 2. Contact dedup
            contacts = db.get_contacts_for_lead(lead_id)
            contact_id = None

            if contacts:
                best_contact = contacts[0]
                email = best_contact.get("email")

                if email:
                    existing_contact = db.conn.execute(
                        "SELECT id FROM contacts WHERE email = ?", (email,)
                    ).fetchone()
                    if existing_contact:
                        contact_id = existing_contact[0] if isinstance(existing_contact, tuple) else existing_contact["id"]
                    else:
                        cursor = db.conn.execute(
                            "INSERT INTO contacts (name, email, phone, role, company_id) VALUES (?, ?, ?, ?, ?)",
                            (
                                best_contact.get("name", "Unknown"),
                                email,
                                best_contact.get("phone"),
                                best_contact.get("role"),
                                company_id,
                            )
                        )
                        contact_id = cursor.lastrowid
                else:
                    # No email — create contact anyway
                    cursor = db.conn.execute(
                        "INSERT INTO contacts (name, role, company_id) VALUES (?, ?, ?)",
                        (best_contact.get("name", "Unknown"), best_contact.get("role"), company_id)
                    )
                    contact_id = cursor.lastrowid

            # 3. Build research findings from marketing signals
            signals = db.get_signals_for_lead(lead_id)
            research_findings = _build_research_findings(signals)

            # 4. Create deal
            source = "cold"  # Scraped leads are cold outreach
            source_detail = f"Scraped from {lead.get('platform_source', 'unknown')} — {lead.get('review_count', 0)} reviews"

            db.conn.execute(
                """INSERT INTO deals (contact_id, company_id, stage, source, source_detail,
                    research_findings, owner_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (contact_id, company_id, "lead", source, source_detail, research_findings, owner_id)
            )

            db.conn.commit()

            # 5. Update lead status
            db.update_lead_status(lead_id, "contacted")

            results["pushed"] += 1
            logger.info(f"Pushed lead {lead_id} ({business_name}) to CRM")

        except Exception as e:
            logger.error(f"Error pushing lead {lead.get('id')}: {e}")
            results["errors"] += 1

    return results
