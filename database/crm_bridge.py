"""Bridge between Python lead-acquisition tooling and the v2 CRM.

The v1 CRM (companies / contacts / deals / tasks) was wiped on 2026-04-18
and replaced with a unified `clients` table plus an `engagements` table for
active deals. This module pushes enriched leads from `acq_leads` into the
new `clients` table only — engagements are created by hand in the CRM UI
when a sales rep decides to pursue a lead.

Dedup is owned by the CRM via a UNIQUE index on `clients.source_lead_id`.
Once an `acq_leads` row has been pushed, its status flips to `'in_crm'`
permanently. Deletion of a client in the CRM does not make the lead
re-pushable (rejection is a final state).
"""

import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# Minimal v2 CRM schema for tests. Mirrors the production schema in
# tkbs-crm/server/db/schema.sql — only the columns the bridge writes are
# included. Real installs use the full schema via the Node CRM.
CRM_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    website TEXT,
    industry TEXT,
    location TEXT,
    type TEXT CHECK(type IN ('B2B', 'B2C')),
    primary_contact_name TEXT,
    email TEXT,
    phone TEXT,
    role TEXT,
    additional_contacts TEXT NOT NULL DEFAULT '[]',
    social_links TEXT NOT NULL DEFAULT '{}',
    enrichment_data TEXT NOT NULL DEFAULT '{}',
    enrichment_status TEXT NOT NULL DEFAULT 'none' CHECK(enrichment_status IN ('none', 'running', 'succeeded', 'failed')),
    fit_score INTEGER,
    fit_score_breakdown TEXT,
    notes TEXT,
    brand_profile TEXT NOT NULL DEFAULT '{}',
    brand_profile_sources TEXT NOT NULL DEFAULT '{}',
    source_lead_id TEXT,
    source_platform TEXT,
    source_url TEXT,
    source_imported_at TEXT,
    owner_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_source_lead_id_unique
    ON clients(source_lead_id) WHERE source_lead_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    engagement_id INTEGER,
    type TEXT NOT NULL,
    content TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


def _build_enrichment_data(lead: dict, signals: dict | None, contacts: list[dict]) -> dict:
    """Assemble the enrichment_data JSON blob stored on the client row.

    This is the source of truth for "why this lead is interesting" — review
    counts, marketing-signal flags, social platforms, and any extra contacts
    pulled from the original platform listing. The CRM's Fit Score engine
    reads from this blob, and the Client detail page renders it.
    """
    data: dict = {
        "review_count": lead.get("review_count"),
        "rating": lead.get("rating"),
        "platform_source": lead.get("platform_source"),
        "platform_url": lead.get("platform_url"),
    }
    if signals:
        social_platforms = signals.get("social_platforms")
        if isinstance(social_platforms, str):
            try:
                social_platforms = json.loads(social_platforms)
            except (json.JSONDecodeError, TypeError):
                social_platforms = []
        data.update({
            "has_website": bool(signals.get("has_website")),
            "website_quality": signals.get("website_quality"),
            "has_social_media": bool(signals.get("has_social_media")),
            "social_platforms": social_platforms,
            "has_seo": bool(signals.get("has_seo")),
            "has_paid_ads": bool(signals.get("has_paid_ads")),
            "confidence": signals.get("confidence"),
        })
    if contacts:
        emails = [c["email"] for c in contacts if c.get("email")]
        if emails:
            data["emails"] = emails
    return {k: v for k, v in data.items() if v is not None}


def _build_notes(lead: dict, signals: dict | None) -> str:
    """One-paragraph summary stitched into client.notes for at-a-glance context."""
    parts: list[str] = []
    review_count = lead.get("review_count") or 0
    rating = lead.get("rating")
    if review_count:
        rating_str = f", {rating}★" if rating else ""
        parts.append(f"{review_count} reviews{rating_str} on {lead.get('platform_source', 'source')}")

    if signals:
        if not signals.get("has_website"):
            parts.append("no standalone website")
        elif signals.get("website_quality"):
            parts.append(f"website quality: {signals['website_quality']}")
        if not signals.get("has_social_media"):
            parts.append("no social media presence")
        if not signals.get("has_seo"):
            parts.append("no SEO signals")
        if not signals.get("has_paid_ads"):
            parts.append("no paid ads")

    return "; ".join(parts) if parts else ""


def push_leads_to_crm(
    db,
    lead_ids: list[str] | None = None,
    owner_id: int = 1,
    dry_run: bool = False,
):
    """Push enriched leads from acq_leads into the v2 CRM `clients` table.

    Each lead becomes one client row. No engagements are created; that's a
    deliberate manual step in the CRM UI. Leads already promoted (status
    `in_crm`) are skipped so re-running the command is idempotent.

    Args:
        db: shared SQLite connection wrapper (Database)
        lead_ids: explicit list of acq_leads.id values; if None, pushes
            every lead with status='enriched'.
        owner_id: CRM users.id assigned as the client owner.
        dry_run: collect a preview of planned writes without committing.

    Returns:
        normal mode: {"pushed": N, "skipped": M, "errors": E}
        dry_run mode: {"previews": [...], "summary": {"would_push": N, "would_skip": M}}
    """
    if lead_ids:
        leads = [lead for lid in lead_ids if (lead := db.get_lead_by_id(lid))]
    else:
        leads = db.get_leads_by_status("enriched")

    results = {"pushed": 0, "skipped": 0, "errors": 0}
    previews: list[dict] | None = [] if dry_run else None
    summary: dict | None = {"would_push": 0, "would_skip": 0} if dry_run else None

    for lead in leads:
        try:
            lead_id = lead["id"]
            business_name = lead.get("business_name")

            if not business_name:
                if dry_run:
                    previews.append({
                        "lead_id": lead_id,
                        "business_name": "(no name)",
                        "skip_reason": "Lead has no business name",
                    })
                    summary["would_skip"] += 1
                else:
                    results["skipped"] += 1
                continue

            existing = db.conn.execute(
                "SELECT id, name FROM clients WHERE source_lead_id = ?",
                (lead_id,),
            ).fetchone()
            if existing:
                existing_id = existing[0] if isinstance(existing, tuple) else existing["id"]
                existing_name = existing[1] if isinstance(existing, tuple) else existing["name"]
                if dry_run:
                    previews.append({
                        "lead_id": lead_id,
                        "business_name": business_name,
                        "skip_reason": f"Already in CRM as client #{existing_id} ({existing_name})",
                    })
                    summary["would_skip"] += 1
                else:
                    results["skipped"] += 1
                    db.update_lead_status(lead_id, "in_crm")
                continue

            contacts = db.get_contacts_for_lead(lead_id) or []
            primary = contacts[0] if contacts else {}
            additional = contacts[1:] if len(contacts) > 1 else []

            signals = db.get_signals_for_lead(lead_id)
            enrichment = _build_enrichment_data(lead, signals, contacts)
            enrichment_status = "succeeded" if signals else "none"
            notes = _build_notes(lead, signals)

            if dry_run:
                previews.append({
                    "lead_id": lead_id,
                    "business_name": business_name,
                    "platform": lead.get("platform_source"),
                    "industry": lead.get("industry"),
                    "location": lead.get("location"),
                    "primary_contact": primary.get("name"),
                    "primary_email": primary.get("email"),
                    "additional_contact_count": len(additional),
                    "has_signals": bool(signals),
                    "skip_reason": None,
                })
                summary["would_push"] += 1
                continue

            cursor = db.conn.execute(
                """
                INSERT INTO clients (
                    name, website, industry, location,
                    primary_contact_name, email, phone, role,
                    additional_contacts,
                    enrichment_data, enrichment_status,
                    notes,
                    source_lead_id, source_platform, source_url, source_imported_at,
                    owner_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    business_name,
                    lead.get("website_url"),
                    lead.get("industry"),
                    lead.get("location"),
                    primary.get("name"),
                    primary.get("email"),
                    primary.get("phone"),
                    primary.get("role"),
                    json.dumps([
                        {"name": c.get("name"), "email": c.get("email"),
                         "phone": c.get("phone"), "role": c.get("role")}
                        for c in additional
                    ]),
                    json.dumps(enrichment),
                    enrichment_status,
                    notes,
                    lead_id,
                    lead.get("platform_source"),
                    lead.get("platform_url"),
                    datetime.now().isoformat(),
                    owner_id,
                ),
            )
            client_id = cursor.lastrowid

            try:
                db.conn.execute(
                    """
                    INSERT INTO activities (client_id, type, content, metadata, created_by)
                    VALUES (?, 'system', ?, ?, ?)
                    """,
                    (
                        client_id,
                        f"Imported from {lead.get('platform_source', 'scraper')} via lead acquisition pipeline.",
                        json.dumps({
                            "source_lead_id": lead_id,
                            "platform": lead.get("platform_source"),
                            "industry": lead.get("industry"),
                            "location": lead.get("location"),
                        }),
                        owner_id,
                    ),
                )
            except Exception as e:
                logger.debug(f"activity log skipped for client {client_id}: {e}")

            db.conn.commit()
            db.update_lead_status(lead_id, "in_crm")
            results["pushed"] += 1
            logger.info(f"Pushed lead {lead_id} ({business_name}) → client #{client_id}")

        except Exception as e:
            logger.error(f"Error pushing lead {lead.get('id')}: {e}")
            if not dry_run:
                results["errors"] += 1

    if dry_run:
        return {"previews": previews, "summary": summary}
    return results


def find_client_for_lead(db, lead_id: str) -> int | None:
    """Look up the CRM client_id that was created from a Python lead. Returns
    None if the lead was never pushed."""
    row = db.conn.execute(
        "SELECT id FROM clients WHERE source_lead_id = ?",
        (lead_id,),
    ).fetchone()
    if not row:
        return None
    return row[0] if isinstance(row, tuple) else row["id"]
