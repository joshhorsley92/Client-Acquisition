# database/supabase_client.py
import sqlite3
import uuid
from datetime import datetime, timezone
from collections import Counter
import json


class Database:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA foreign_keys=ON")

    def _row_to_dict(self, row):
        if row is None:
            return None
        return dict(row)

    def _rows_to_list(self, rows):
        return [dict(r) for r in rows]

    def upsert_lead(self, lead: dict) -> dict:
        lead.setdefault("id", str(uuid.uuid4()))
        lead.setdefault("status", "new")
        lead.setdefault("created_at", datetime.now(timezone.utc).isoformat())
        lead["updated_at"] = datetime.now(timezone.utc).isoformat()

        self.conn.execute("""
            INSERT INTO acq_leads (id, business_name, platform_source, platform_url,
                industry, location, review_count, rating, website_url, status, created_at, updated_at)
            VALUES (:id, :business_name, :platform_source, :platform_url,
                :industry, :location, :review_count, :rating, :website_url, :status, :created_at, :updated_at)
            ON CONFLICT(platform_source, platform_url) DO UPDATE SET
                business_name = COALESCE(excluded.business_name, acq_leads.business_name),
                industry = COALESCE(excluded.industry, acq_leads.industry),
                location = COALESCE(excluded.location, acq_leads.location),
                review_count = COALESCE(excluded.review_count, acq_leads.review_count),
                rating = COALESCE(excluded.rating, acq_leads.rating),
                website_url = COALESCE(excluded.website_url, acq_leads.website_url),
                updated_at = excluded.updated_at
        """, {
            "id": lead["id"],
            "business_name": lead.get("business_name"),
            "platform_source": lead["platform_source"],
            "platform_url": lead["platform_url"],
            "industry": lead.get("industry"),
            "location": lead.get("location"),
            "review_count": lead.get("review_count"),
            "rating": lead.get("rating"),
            "website_url": lead.get("website_url"),
            "status": lead["status"],
            "created_at": lead["created_at"],
            "updated_at": lead["updated_at"],
        })
        self.conn.commit()
        return lead

    def insert_contact(self, contact: dict) -> dict:
        contact.setdefault("id", str(uuid.uuid4()))
        self.conn.execute("""
            INSERT INTO acq_lead_contacts (id, lead_id, name, role, email, phone, source)
            VALUES (:id, :lead_id, :name, :role, :email, :phone, :source)
        """, {
            "id": contact["id"],
            "lead_id": contact.get("lead_id"),
            "name": contact.get("name"),
            "role": contact.get("role"),
            "email": contact.get("email"),
            "phone": contact.get("phone"),
            "source": contact.get("source"),
        })
        self.conn.commit()
        return contact

    def upsert_marketing_signals(self, signals: dict) -> dict:
        signals.setdefault("id", str(uuid.uuid4()))
        # Convert list to JSON string for SQLite storage
        social_platforms = signals.get("social_platforms", [])
        if isinstance(social_platforms, list):
            social_platforms = json.dumps(social_platforms)

        self.conn.execute("""
            INSERT INTO acq_marketing_signals (id, lead_id, has_website, has_social_media,
                social_platforms, website_quality, has_seo, has_paid_ads, notes)
            VALUES (:id, :lead_id, :has_website, :has_social_media,
                :social_platforms, :website_quality, :has_seo, :has_paid_ads, :notes)
            ON CONFLICT(lead_id) DO UPDATE SET
                has_website = excluded.has_website,
                has_social_media = excluded.has_social_media,
                social_platforms = excluded.social_platforms,
                website_quality = excluded.website_quality,
                has_seo = excluded.has_seo,
                has_paid_ads = excluded.has_paid_ads,
                notes = excluded.notes
        """, {
            "id": signals["id"],
            "lead_id": signals["lead_id"],
            "has_website": signals.get("has_website"),
            "has_social_media": signals.get("has_social_media"),
            "social_platforms": social_platforms,
            "website_quality": signals.get("website_quality"),
            "has_seo": signals.get("has_seo"),
            "has_paid_ads": signals.get("has_paid_ads"),
            "notes": signals.get("notes"),
        })
        self.conn.commit()
        return signals

    def log_outreach(self, log_entry: dict) -> dict:
        log_entry.setdefault("id", str(uuid.uuid4()))
        log_entry.setdefault("sent_at", datetime.now(timezone.utc).isoformat())
        self.conn.execute("""
            INSERT INTO acq_outreach_log (id, lead_id, type, sent_at, utm_code, qr_url, personalization_notes)
            VALUES (:id, :lead_id, :type, :sent_at, :utm_code, :qr_url, :personalization_notes)
        """, {
            "id": log_entry["id"],
            "lead_id": log_entry.get("lead_id"),
            "type": log_entry.get("type"),
            "sent_at": log_entry["sent_at"],
            "utm_code": log_entry.get("utm_code"),
            "qr_url": log_entry.get("qr_url"),
            "personalization_notes": log_entry.get("personalization_notes"),
        })
        self.conn.commit()
        return log_entry

    def get_leads_by_status(self, status: str) -> list[dict]:
        cursor = self.conn.execute(
            "SELECT * FROM acq_leads WHERE status = ?", (status,)
        )
        return self._rows_to_list(cursor.fetchall())

    def update_lead_status(self, lead_id: str, status: str):
        self.conn.execute(
            "UPDATE acq_leads SET status = ?, updated_at = ? WHERE id = ?",
            (status, datetime.now(timezone.utc).isoformat(), lead_id)
        )
        self.conn.commit()

    def get_lead_by_id(self, lead_id: str) -> dict:
        cursor = self.conn.execute(
            "SELECT * FROM acq_leads WHERE id = ?", (lead_id,)
        )
        return self._row_to_dict(cursor.fetchone())

    def get_signals_for_lead(self, lead_id: str) -> dict:
        cursor = self.conn.execute(
            "SELECT * FROM acq_marketing_signals WHERE lead_id = ?", (lead_id,)
        )
        row = self._row_to_dict(cursor.fetchone())
        if row and row.get("social_platforms"):
            try:
                row["social_platforms"] = json.loads(row["social_platforms"])
            except (json.JSONDecodeError, TypeError):
                row["social_platforms"] = []
        return row

    def get_contacts_for_lead(self, lead_id: str) -> list[dict]:
        cursor = self.conn.execute(
            "SELECT * FROM acq_lead_contacts WHERE lead_id = ?", (lead_id,)
        )
        return self._rows_to_list(cursor.fetchall())

    def get_stats(self) -> dict:
        cursor = self.conn.execute("SELECT status FROM acq_leads")
        rows = cursor.fetchall()
        return dict(Counter(dict(r)["status"] for r in rows))

    def close(self):
        self.conn.close()


# Backwards-compatibility alias
SupabaseDB = Database
