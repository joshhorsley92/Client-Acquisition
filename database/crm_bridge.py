import logging
from datetime import datetime, timedelta

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

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    due_at TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'done', 'overdue')),
    auto_generated INTEGER NOT NULL DEFAULT 0,
    template_key TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS stage_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stage TEXT NOT NULL,
    action_type TEXT NOT NULL CHECK(action_type IN ('create_tasks', 'start_cadence', 'trigger_skill', 'record')),
    config TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK(type IN ('email', 'call', 'meeting', 'note', 'stage_change', 'system')),
    content TEXT,
    metadata TEXT DEFAULT '{}',
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('analysis_deck', 'proposal', 'other')),
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    generated_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id INTEGER REFERENCES deals(id) ON DELETE CASCADE,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    direction TEXT NOT NULL CHECK(direction IN ('outbound', 'inbound')),
    subject TEXT,
    body_text TEXT,
    body_html TEXT,
    from_email TEXT,
    to_email TEXT,
    sent_at TEXT,
    opened_at TEXT,
    clicked_at TEXT,
    tracking_pixel_id TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
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


def log_activity(db, deal_id: int, contact_id: int | None, activity_type: str, content: str, metadata: dict | None = None):
    """Log an activity on a CRM deal."""
    import json
    db.conn.execute(
        """INSERT INTO activities (deal_id, contact_id, type, content, metadata)
        VALUES (?, ?, ?, ?, ?)""",
        (deal_id, contact_id, activity_type, content, json.dumps(metadata or {}))
    )


def find_deal_for_lead(db, lead_id: str) -> int | None:
    """Find the CRM deal_id for a lead by matching business_name → company → deal."""
    lead = db.get_lead_by_id(lead_id)
    if not lead or not lead.get("business_name"):
        return None

    company = db.conn.execute(
        "SELECT id FROM companies WHERE name = ?", (lead["business_name"],)
    ).fetchone()
    if not company:
        return None

    company_id = company[0] if isinstance(company, tuple) else company["id"]
    deal = db.conn.execute(
        "SELECT id FROM deals WHERE company_id = ? AND stage NOT IN ('closed_won', 'closed_lost') ORDER BY created_at DESC LIMIT 1",
        (company_id,)
    ).fetchone()
    if not deal:
        return None

    return deal[0] if isinstance(deal, tuple) else deal["id"]


def register_document(db, deal_id: int, file_path: str, file_name: str, doc_type: str = "other"):
    """Register a generated document in the CRM documents table."""
    db.conn.execute(
        """INSERT INTO documents (deal_id, type, file_path, file_name, generated_at)
        VALUES (?, ?, ?, ?, ?)""",
        (deal_id, doc_type, file_path, file_name, datetime.now().isoformat())
    )


def _execute_stage_actions(db, deal_id: int, stage: str) -> dict:
    """Execute stage actions for a deal, replicating CRM stage-actions.js logic.

    Handles 'create_tasks' and 'start_cadence' action types.
    Skips 'trigger_skill' and 'record' (require Node.js).
    """
    import json

    result = {"tasks_created": 0}

    actions = db.conn.execute(
        "SELECT * FROM stage_actions WHERE stage = ? AND enabled = 1 ORDER BY sort_order ASC",
        (stage,)
    ).fetchall()

    for action in actions:
        action_dict = dict(action) if hasattr(action, 'keys') else {"action_type": action[2], "config": action[3]}
        action_type = action_dict.get("action_type", "")
        try:
            config = json.loads(action_dict.get("config", "{}"))
        except (json.JSONDecodeError, TypeError):
            continue

        if action_type == "create_tasks":
            for task in config.get("tasks", []):
                offset_days = task.get("due_offset_days", 0)
                due_at = (datetime.now() + timedelta(days=offset_days)).strftime("%Y-%m-%dT%H:%M:%S")
                db.conn.execute(
                    """INSERT INTO tasks (deal_id, description, due_at, auto_generated, template_key)
                    VALUES (?, ?, ?, 1, ?)""",
                    (deal_id, task["description"], due_at, task.get("template"))
                )
                result["tasks_created"] += 1

        elif action_type == "start_cadence":
            for reminder in config.get("reminders", []):
                day = reminder.get("day", 1)
                due_at = (datetime.now() + timedelta(days=day)).strftime("%Y-%m-%dT%H:%M:%S")
                template = reminder.get("template", "")
                description = f"Follow-up reminder (day {day})"
                db.conn.execute(
                    """INSERT INTO tasks (deal_id, description, due_at, auto_generated, template_key)
                    VALUES (?, ?, ?, 1, ?)""",
                    (deal_id, description, due_at, template)
                )
                result["tasks_created"] += 1

    return result


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

            cursor = db.conn.execute(
                """INSERT INTO deals (contact_id, company_id, stage, source, source_detail,
                    research_findings, owner_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (contact_id, company_id, "lead", source, source_detail, research_findings, owner_id)
            )
            deal_id = cursor.lastrowid

            # Execute stage actions (auto-create tasks)
            try:
                _execute_stage_actions(db, deal_id, "lead")
            except Exception as e:
                logger.warning(f"Stage actions failed for deal {deal_id}: {e}")

            # Log deal creation activity
            log_activity(db, deal_id, contact_id, "stage_change",
                        "Deal created from lead acquisition tool",
                        {"from": None, "to": "lead"})

            db.conn.commit()

            # 5. Update lead status
            db.update_lead_status(lead_id, "contacted")

            results["pushed"] += 1
            logger.info(f"Pushed lead {lead_id} ({business_name}) to CRM")

        except Exception as e:
            logger.error(f"Error pushing lead {lead.get('id')}: {e}")
            results["errors"] += 1

    return results
