import os
import pytest
from unittest.mock import MagicMock, patch

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")

def read_fixture(filename):
    with open(os.path.join(FIXTURES_DIR, filename), "r") as f:
        return f.read()

def test_extract_names_from_team_page():
    from enrichment.contact_finder import ContactFinder
    finder = ContactFinder(db=MagicMock())
    html = read_fixture("team_page.html")
    contacts = finder.extract_contacts_from_page(html)
    names = [c["name"] for c in contacts]
    assert "Jane Smith" in names
    assert "Mike Brown" in names

def test_extract_roles():
    from enrichment.contact_finder import ContactFinder
    finder = ContactFinder(db=MagicMock())
    html = read_fixture("team_page.html")
    contacts = finder.extract_contacts_from_page(html)
    roles = {c["name"]: c["role"] for c in contacts}
    assert "Founder & CEO" in roles["Jane Smith"]

def test_extract_owner_from_etsy_profile():
    from enrichment.contact_finder import ContactFinder
    finder = ContactFinder(db=MagicMock())
    html = read_fixture("etsy_shop_page.html")
    contact = finder.extract_platform_contact(html, "etsy")
    assert contact["name"] == "Jane Smith"

def test_uses_registered_agent_for_county():
    from enrichment.contact_finder import ContactFinder
    finder = ContactFinder(db=MagicMock())
    lead = {"id": "uuid-123", "platform_source": "county_registry", "business_name": "Metro Boutique LLC"}
    contact = finder.build_county_contact("Sarah Johnson", lead["id"])
    assert contact["name"] == "Sarah Johnson"
    assert contact["role"] == "Registered Agent"

def test_stores_contacts_in_db():
    from enrichment.contact_finder import ContactFinder
    mock_db = MagicMock()
    finder = ContactFinder(db=mock_db)
    lead = {"id": "uuid-123", "website_url": "https://test.com", "platform_source": "etsy"}
    with patch.object(finder, "fetch_page", return_value=read_fixture("team_page.html")):
        finder.find_contacts(lead)
    assert mock_db.insert_contact.call_count >= 1

def test_handles_no_names_found():
    from enrichment.contact_finder import ContactFinder
    finder = ContactFinder(db=MagicMock())
    contacts = finder.extract_contacts_from_page("<html><body><p>Nothing here</p></body></html>")
    assert contacts == []
