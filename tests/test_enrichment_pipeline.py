import pytest
from unittest.mock import MagicMock, patch, call

def test_enrich_fetches_new_leads():
    from enrichment.pipeline import EnrichmentPipeline
    mock_db = MagicMock()
    mock_db.get_leads_by_status.return_value = [
        {"id": "uuid-1", "website_url": "https://a.com", "platform_source": "etsy"},
        {"id": "uuid-2", "website_url": "https://b.com", "platform_source": "kickstarter"},
    ]
    pipeline = EnrichmentPipeline(db=mock_db)
    with patch.object(pipeline, "_enrich_single"):
        pipeline.run()
    mock_db.get_leads_by_status.assert_called_with("new")

def test_enrich_single_lead():
    from enrichment.pipeline import EnrichmentPipeline
    mock_db = MagicMock()
    mock_db.get_lead_by_id.return_value = {"id": "uuid-1", "website_url": "https://a.com", "platform_source": "etsy"}
    pipeline = EnrichmentPipeline(db=mock_db)
    with patch.object(pipeline, "_enrich_single") as mock_enrich:
        pipeline.run_single("uuid-1")
    mock_enrich.assert_called_once()

def test_enrich_calls_all_modules():
    from enrichment.pipeline import EnrichmentPipeline
    mock_db = MagicMock()
    pipeline = EnrichmentPipeline(db=mock_db)
    lead = {"id": "uuid-1", "website_url": "https://a.com", "platform_source": "etsy"}
    with patch.object(pipeline.email_finder, "find_emails") as mock_email, \
         patch.object(pipeline.contact_finder, "find_contacts") as mock_contact, \
         patch.object(pipeline.signal_analyzer, "analyze") as mock_signal:
        pipeline._enrich_single(lead)
    mock_email.assert_called_once_with(lead)
    mock_contact.assert_called_once_with(lead)
    mock_signal.assert_called_once_with(lead)

def test_enrich_updates_status():
    from enrichment.pipeline import EnrichmentPipeline
    mock_db = MagicMock()
    pipeline = EnrichmentPipeline(db=mock_db)
    lead = {"id": "uuid-1", "website_url": "https://a.com", "platform_source": "etsy"}
    with patch.object(pipeline.email_finder, "find_emails"), \
         patch.object(pipeline.contact_finder, "find_contacts"), \
         patch.object(pipeline.signal_analyzer, "analyze"):
        pipeline._enrich_single(lead)
    mock_db.update_lead_status.assert_called_with("uuid-1", "enriched")

def test_enrich_handles_partial_failure():
    from enrichment.pipeline import EnrichmentPipeline
    mock_db = MagicMock()
    pipeline = EnrichmentPipeline(db=mock_db)
    lead = {"id": "uuid-1", "website_url": "https://a.com", "platform_source": "etsy"}
    with patch.object(pipeline.email_finder, "find_emails", side_effect=Exception("fail")), \
         patch.object(pipeline.contact_finder, "find_contacts"), \
         patch.object(pipeline.signal_analyzer, "analyze"):
        pipeline._enrich_single(lead)
    mock_db.update_lead_status.assert_called_with("uuid-1", "enriched")
