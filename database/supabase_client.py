from datetime import datetime, timezone
from collections import Counter
from supabase import create_client


class SupabaseDB:
    def __init__(self, url: str, key: str):
        self.client = create_client(url, key)

    def upsert_lead(self, lead: dict) -> dict:
        lead.setdefault("status", "new")
        lead.setdefault("created_at", datetime.now(timezone.utc).isoformat())
        lead["updated_at"] = datetime.now(timezone.utc).isoformat()
        result = (
            self.client.table("acq_leads")
            .upsert(lead, on_conflict="platform_source,platform_url")
            .execute()
        )
        return result.data[0] if result.data else {}

    def insert_contact(self, contact: dict) -> dict:
        result = (
            self.client.table("acq_lead_contacts")
            .insert(contact)
            .execute()
        )
        return result.data[0] if result.data else {}

    def upsert_marketing_signals(self, signals: dict) -> dict:
        result = (
            self.client.table("acq_marketing_signals")
            .upsert(signals, on_conflict="lead_id")
            .execute()
        )
        return result.data[0] if result.data else {}

    def log_outreach(self, log_entry: dict) -> dict:
        log_entry.setdefault("sent_at", datetime.now(timezone.utc).isoformat())
        result = (
            self.client.table("acq_outreach_log")
            .insert(log_entry)
            .execute()
        )
        return result.data[0] if result.data else {}

    def get_leads_by_status(self, status: str) -> list[dict]:
        result = (
            self.client.table("acq_leads")
            .select("*")
            .eq("status", status)
            .execute()
        )
        return result.data

    def update_lead_status(self, lead_id: str, status: str):
        self.client.table("acq_leads").update({
            "status": status,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", lead_id).execute()

    def get_lead_by_id(self, lead_id: str) -> dict:
        result = (
            self.client.table("acq_leads")
            .select("*")
            .eq("id", lead_id)
            .single()
            .execute()
        )
        return result.data

    def get_signals_for_lead(self, lead_id: str) -> dict:
        result = (
            self.client.table("acq_marketing_signals")
            .select("*")
            .eq("lead_id", lead_id)
            .single()
            .execute()
        )
        return result.data

    def get_contacts_for_lead(self, lead_id: str) -> list[dict]:
        result = (
            self.client.table("acq_lead_contacts")
            .select("*")
            .eq("lead_id", lead_id)
            .execute()
        )
        return result.data

    def get_stats(self) -> dict:
        result = (
            self.client.table("acq_leads")
            .select("status")
            .execute()
        )
        return dict(Counter(row["status"] for row in result.data))
