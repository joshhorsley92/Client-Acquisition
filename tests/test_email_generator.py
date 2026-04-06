import pytest
from unittest.mock import MagicMock
from bs4 import BeautifulSoup

@pytest.fixture
def sample_lead():
    return {"id": "uuid-123", "business_name": "Great Shop One", "platform_source": "etsy", "review_count": 250}

@pytest.fixture
def sample_contact():
    return {"name": "Jane Smith", "role": "Owner", "email": "jane@greatshop.com"}

@pytest.fixture
def sample_signals():
    return {"has_website": True, "has_social_media": False, "website_quality": "basic", "has_seo": False, "has_paid_ads": False}

def test_generates_valid_html(sample_lead, sample_contact, sample_signals):
    from outreach.generator import OutreachGenerator
    gen = OutreachGenerator(db=MagicMock(), base_url="https://turnkey.com/start")
    result = gen.generate_email(sample_lead, sample_contact, sample_signals)
    soup = BeautifulSoup(result, "html.parser")
    assert soup.find("html") is not None

def test_contains_inline_css(sample_lead, sample_contact, sample_signals):
    from outreach.generator import OutreachGenerator
    gen = OutreachGenerator(db=MagicMock(), base_url="https://turnkey.com/start")
    result = gen.generate_email(sample_lead, sample_contact, sample_signals)
    assert "<link" not in result
    assert "style=" in result

def test_contains_business_name(sample_lead, sample_contact, sample_signals):
    from outreach.generator import OutreachGenerator
    gen = OutreachGenerator(db=MagicMock(), base_url="https://turnkey.com/start")
    result = gen.generate_email(sample_lead, sample_contact, sample_signals)
    assert "Great Shop One" in result

def test_contains_utm_tracked_links(sample_lead, sample_contact, sample_signals):
    from outreach.generator import OutreachGenerator
    gen = OutreachGenerator(db=MagicMock(), base_url="https://turnkey.com/start")
    result = gen.generate_email(sample_lead, sample_contact, sample_signals)
    assert "utm_source=email" in result
    assert "utm_campaign=acq" in result

def test_uses_brand_colors(sample_lead, sample_contact, sample_signals):
    from outreach.generator import OutreachGenerator
    gen = OutreachGenerator(db=MagicMock(), base_url="https://turnkey.com/start")
    result = gen.generate_email(sample_lead, sample_contact, sample_signals)
    assert "#00D4AA" in result
    assert "#1B2838" in result

def test_handles_missing_contact_name(sample_lead, sample_signals):
    from outreach.generator import OutreachGenerator
    gen = OutreachGenerator(db=MagicMock(), base_url="https://turnkey.com/start")
    result = gen.generate_email(sample_lead, None, sample_signals)
    assert "Business Owner" in result
