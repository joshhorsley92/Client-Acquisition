import os
import pytest
from unittest.mock import MagicMock, patch

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")

def read_fixture(filename):
    with open(os.path.join(FIXTURES_DIR, filename), "r") as f:
        return f.read()

def test_detects_has_website():
    from enrichment.signal_analyzer import SignalAnalyzer
    analyzer = SignalAnalyzer(db=MagicMock())
    with patch.object(analyzer, "fetch_page", return_value="<html></html>"):
        result = analyzer.check_website("https://greatshop.com")
    assert result is True

def test_detects_no_website():
    from enrichment.signal_analyzer import SignalAnalyzer
    analyzer = SignalAnalyzer(db=MagicMock())
    result = analyzer.check_website(None)
    assert result is False

def test_finds_social_media_links():
    from enrichment.signal_analyzer import SignalAnalyzer
    analyzer = SignalAnalyzer(db=MagicMock())
    html = read_fixture("website_professional.html")
    platforms = analyzer.find_social_platforms(html)
    assert "instagram" in platforms
    assert "facebook" in platforms
    assert "tiktok" in platforms

def test_no_social_media():
    from enrichment.signal_analyzer import SignalAnalyzer
    analyzer = SignalAnalyzer(db=MagicMock())
    html = read_fixture("website_basic.html")
    platforms = analyzer.find_social_platforms(html)
    assert platforms == []

def test_website_quality_professional():
    from enrichment.signal_analyzer import SignalAnalyzer
    analyzer = SignalAnalyzer(db=MagicMock())
    html = read_fixture("website_professional.html")
    quality = analyzer.assess_website_quality(html)
    assert quality == "professional"

def test_website_quality_basic():
    from enrichment.signal_analyzer import SignalAnalyzer
    analyzer = SignalAnalyzer(db=MagicMock())
    html = read_fixture("website_basic.html")
    quality = analyzer.assess_website_quality(html)
    assert quality == "basic"

def test_detects_seo_signals():
    from enrichment.signal_analyzer import SignalAnalyzer
    analyzer = SignalAnalyzer(db=MagicMock())
    html = read_fixture("website_professional.html")
    has_seo = analyzer.check_seo(html)
    assert has_seo is True

def test_detects_no_seo():
    from enrichment.signal_analyzer import SignalAnalyzer
    analyzer = SignalAnalyzer(db=MagicMock())
    html = read_fixture("website_basic.html")
    has_seo = analyzer.check_seo(html)
    assert has_seo is False

def test_detects_google_ads():
    from enrichment.signal_analyzer import SignalAnalyzer
    analyzer = SignalAnalyzer(db=MagicMock())
    html = read_fixture("website_professional.html")
    has_ads = analyzer.check_paid_ads(html)
    assert has_ads is True

def test_detects_no_ads():
    from enrichment.signal_analyzer import SignalAnalyzer
    analyzer = SignalAnalyzer(db=MagicMock())
    html = read_fixture("website_basic.html")
    has_ads = analyzer.check_paid_ads(html)
    assert has_ads is False

def test_stores_signals_in_db():
    from enrichment.signal_analyzer import SignalAnalyzer
    mock_db = MagicMock()
    analyzer = SignalAnalyzer(db=mock_db)
    lead = {"id": "uuid-123", "website_url": "https://greatshop.com"}
    with patch.object(analyzer, "fetch_page", return_value=read_fixture("website_professional.html")):
        analyzer.analyze(lead)
    mock_db.upsert_marketing_signals.assert_called_once()
    call_data = mock_db.upsert_marketing_signals.call_args[0][0]
    assert call_data["lead_id"] == "uuid-123"
    assert call_data["has_website"] is True
