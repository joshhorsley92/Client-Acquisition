import logging
from enrichment.email_finder import EmailFinder
from enrichment.contact_finder import ContactFinder
from enrichment.signal_analyzer import SignalAnalyzer

logger = logging.getLogger(__name__)

class EnrichmentPipeline:
    def __init__(self, db):
        self.db = db
        self.email_finder = EmailFinder(db=db)
        self.contact_finder = ContactFinder(db=db)
        self.signal_analyzer = SignalAnalyzer(db=db)

    def _enrich_single(self, lead: dict):
        lead_id = lead["id"]
        logger.info(f"Enriching lead {lead_id}: {lead.get('business_name', 'Unknown')}")
        modules = [
            ("email_finder", self.email_finder.find_emails),
            ("contact_finder", self.contact_finder.find_contacts),
            ("signal_analyzer", self.signal_analyzer.analyze),
        ]
        for name, func in modules:
            try:
                func(lead)
            except Exception as e:
                logger.warning(f"{name} failed for lead {lead_id}: {e}")
        self.db.update_lead_status(lead_id, "enriched")
        logger.info(f"Lead {lead_id} enriched successfully")

    def run(self):
        leads = self.db.get_leads_by_status("new")
        logger.info(f"Found {len(leads)} new leads to enrich")
        for lead in leads:
            self._enrich_single(lead)
        logger.info("Enrichment pipeline complete")

    def run_single(self, lead_id: str):
        lead = self.db.get_lead_by_id(lead_id)
        if not lead:
            logger.error(f"Lead {lead_id} not found")
            return
        self._enrich_single(lead)
