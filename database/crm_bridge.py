import json
import logging
import subprocess
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


def _is_cli_available() -> bool:
    """Check if Claude Code CLI is installed."""
    try:
        result = subprocess.run(['claude', '--version'], capture_output=True, timeout=10)
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def _interpolate_prompt(template: str, context: dict) -> str:
    """Replace {field} placeholders in a prompt template with context values. Preserves unmatched placeholders."""
    import re
    def replacer(match):
        key = match.group(1)
        return str(context.get(key, match.group(0)))
    return re.sub(r'\{(\w+)\}', replacer, template)

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

    Handles 'create_tasks', 'start_cadence', and 'trigger_skill' action types.
    Skips 'record' (requires Node.js).
    """
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

        elif action_type == "trigger_skill":
            if not _is_cli_available():
                logger.warning(f"Skipping trigger_skill for deal {deal_id}: Claude CLI not available")
                continue

            # Load deal context
            deal_row = db.conn.execute("SELECT * FROM deals WHERE id = ?", (deal_id,)).fetchone()
            if not deal_row:
                continue
            deal_dict = dict(deal_row) if hasattr(deal_row, 'keys') else {}

            company_id = deal_dict.get("company_id")
            contact_id = deal_dict.get("contact_id")

            company = {}
            if company_id:
                company_row = db.conn.execute("SELECT * FROM companies WHERE id = ?", (company_id,)).fetchone()
                if company_row:
                    company = dict(company_row) if hasattr(company_row, 'keys') else {}

            contact = {}
            if contact_id:
                contact_row = db.conn.execute("SELECT * FROM contacts WHERE id = ?", (contact_id,)).fetchone()
                if contact_row:
                    contact = dict(contact_row) if hasattr(contact_row, 'keys') else {}

            context = {
                "company": company.get("name", ""),
                "contact": contact.get("name", ""),
                "location": company.get("location", ""),
                "industry": company.get("industry", ""),
                "type": company.get("type", ""),
                "source_detail": deal_dict.get("source_detail", ""),
                "notes": deal_dict.get("call_notes", ""),
                "package_type": deal_dict.get("package_type", ""),
                "services_discussed": deal_dict.get("services_discussed", ""),
                "pricing_notes": deal_dict.get("pricing_notes", ""),
                "call_notes": deal_dict.get("call_notes", ""),
            }

            prompt = _interpolate_prompt(config.get("prompt_template", ""), context)
            skill_name = config.get("skill", "unknown")

            try:
                # Fire-and-forget (non-blocking, matches Node.js pattern)
                subprocess.Popen(
                    ['claude', '--print', prompt],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
                logger.info(f"Triggered skill '{skill_name}' for deal {deal_id}")

                # Log activity
                db.conn.execute(
                    """INSERT INTO activities (deal_id, type, content, metadata, created_by, created_at)
                       VALUES (?, 'system', ?, ?, NULL, ?)""",
                    (
                        deal_id,
                        f"AI skill triggered: {skill_name}",
                        json.dumps({"skill": skill_name, "stage": stage}),
                        datetime.now().isoformat(),
                    )
                )

                result["skills_triggered"] = result.get("skills_triggered", 0) + 1
            except Exception as e:
                logger.warning(f"Failed to trigger skill '{skill_name}' for deal {deal_id}: {e}")

    return result


def push_leads_to_crm(db, lead_ids: list[str] | None = None, owner_id: int = 1, dry_run: bool = False):
    """
    Push enriched leads from acq_leads into CRM tables (companies, contacts, deals).

    Args:
        db: Database instance (shared SQLite connection)
        lead_ids: Optional list of specific lead IDs to push. If None, pushes all 'enriched' leads.
        owner_id: CRM user ID to assign deals to (default: 1, the admin user)
        dry_run: If True, run SELECT/dedup queries but skip INSERT/UPDATE/commit, returning
            a preview of planned changes.

    Returns:
        In normal mode: {"pushed": N, "skipped": M, "errors": E}
        In dry_run mode: {"previews": [...], "summary": {"would_push": N, "would_skip": M}}
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
    previews = [] if dry_run else None
    summary = {"would_push": 0, "would_skip": 0} if dry_run else None

    # Pre-compute task preview (for dry_run) from stage_actions
    task_preview_count = 0
    task_preview_names: list[str] = []
    if dry_run:
        try:
            action_rows = db.conn.execute(
                "SELECT config FROM stage_actions WHERE stage = 'lead' AND action_type = 'create_tasks' AND enabled = 1 ORDER BY sort_order ASC"
            ).fetchall()
            for row in action_rows:
                cfg_raw = row["config"] if hasattr(row, "keys") else row[0]
                try:
                    cfg = json.loads(cfg_raw or "{}")
                except (json.JSONDecodeError, TypeError):
                    continue
                for task in cfg.get("tasks", []):
                    task_preview_count += 1
                    desc = task.get("description")
                    if desc:
                        task_preview_names.append(desc)
        except Exception as e:
            logger.warning(f"Failed to preview stage actions: {e}")

    for lead in leads:
        try:
            lead_id = lead["id"]
            business_name = lead.get("business_name")
            if not business_name:
                logger.warning(f"Lead {lead_id} has no business name, skipping")
                if dry_run:
                    previews.append({
                        "business_name": "(no name)",
                        "platform": lead.get("platform_source", "unknown"),
                        "detail": "no reviews",
                        "company_action": "N/A",
                        "contact_action": "N/A",
                        "skip_reason": "Lead has no business name",
                        "task_count": 0,
                        "task_names": [],
                    })
                    summary["would_skip"] += 1
                else:
                    results["skipped"] += 1
                continue

            platform = lead.get("platform_source", "unknown")
            review_count = lead.get("review_count", 0)
            detail = f"{review_count} reviews" if review_count else "no reviews"

            # 1. Company dedup
            existing_company = db.conn.execute(
                "SELECT id FROM companies WHERE name = ?", (business_name,)
            ).fetchone()

            company_id = None
            company_action = ""
            skip_reason = None

            if existing_company:
                company_id = existing_company[0] if isinstance(existing_company, tuple) else existing_company["id"]
                company_action = f"EXISTING (id={company_id})"
                # Check for active deal
                active_deal = db.conn.execute(
                    "SELECT id, stage FROM deals WHERE company_id = ? AND stage NOT IN ('closed_won', 'closed_lost')",
                    (company_id,)
                ).fetchone()
                if active_deal:
                    if isinstance(active_deal, tuple):
                        active_deal_id, active_stage = active_deal[0], active_deal[1]
                    else:
                        active_deal_id, active_stage = active_deal["id"], active_deal["stage"]
                    skip_reason = f"Active deal already exists (deal #{active_deal_id}, stage={active_stage})"

                    if dry_run:
                        previews.append({
                            "business_name": business_name,
                            "platform": platform,
                            "detail": detail,
                            "company_action": company_action,
                            "contact_action": "",
                            "skip_reason": skip_reason,
                            "task_count": 0,
                            "task_names": [],
                        })
                        summary["would_skip"] += 1
                    else:
                        logger.info(f"Lead {lead_id} ({business_name}) already has active deal, skipping")
                        results["skipped"] += 1
                        db.update_lead_status(lead_id, "contacted")
                    continue

                if not dry_run:
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
                company_action = "CREATE NEW (no match found)"
                if not dry_run:
                    cursor = db.conn.execute(
                        "INSERT INTO companies (name, location, industry, website) VALUES (?, ?, ?, ?)",
                        (business_name, lead.get("location"), lead.get("industry"), lead.get("website_url"))
                    )
                    company_id = cursor.lastrowid

            # 2. Contact dedup
            contacts = db.get_contacts_for_lead(lead_id)
            contact_id = None
            contact_action = "NONE (no contact on lead)"

            if contacts:
                best_contact = contacts[0]
                email = best_contact.get("email")

                if email:
                    existing_contact = db.conn.execute(
                        "SELECT id FROM contacts WHERE email = ?", (email,)
                    ).fetchone()
                    if existing_contact:
                        contact_id = existing_contact[0] if isinstance(existing_contact, tuple) else existing_contact["id"]
                        contact_action = f"EXISTING (id={contact_id})"
                    else:
                        contact_action = f"CREATE NEW — {email}"
                        if not dry_run:
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
                    contact_action = "CREATE NEW — no email"
                    if not dry_run:
                        # No email — create contact anyway
                        cursor = db.conn.execute(
                            "INSERT INTO contacts (name, role, company_id) VALUES (?, ?, ?)",
                            (best_contact.get("name", "Unknown"), best_contact.get("role"), company_id)
                        )
                        contact_id = cursor.lastrowid

            if dry_run:
                previews.append({
                    "business_name": business_name,
                    "platform": platform,
                    "detail": detail,
                    "company_action": company_action,
                    "contact_action": contact_action,
                    "skip_reason": None,
                    "task_count": task_preview_count,
                    "task_names": list(task_preview_names),
                })
                summary["would_push"] += 1
                continue

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
            if not dry_run:
                results["errors"] += 1

    if dry_run:
        return {"previews": previews, "summary": summary}
    return results
