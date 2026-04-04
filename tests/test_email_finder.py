import os
import pytest
from unittest.mock import MagicMock, patch

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")

def read_fixture(filename):
    with open(os.path.join(FIXTURES_DIR, filename), "r") as f:
        return f.read()

def test_extract_emails_from_mailto():
    from enrichment.email_finder import EmailFinder
    finder = EmailFinder(db=MagicMock())
    html = read_fixture("contact_page.html")
    emails = finder.extract_emails(html)
    assert "hello@greatshop.com" in emails

def test_extract_emails_from_text():
    from enrichment.email_finder import EmailFinder
    finder = EmailFinder(db=MagicMock())
    html = read_fixture("contact_page.html")
    emails = finder.extract_emails(html)
    assert "wholesale@greatshop.com" in emails
    assert "jane@greatshop.com" in emails

def test_deduplicates_emails():
    from enrichment.email_finder import EmailFinder
    finder = EmailFinder(db=MagicMock())
    html = '<p>test@a.com and <a href="mailto:test@a.com">test@a.com</a></p>'
    emails = finder.extract_emails(html)
    assert emails.count("test@a.com") == 1

def test_filters_invalid_emails():
    from enrichment.email_finder import EmailFinder
    finder = EmailFinder(db=MagicMock())
    html = read_fixture("contact_page.html")
    emails = finder.extract_emails(html)
    assert "user@.com" not in emails

def test_filters_generic_emails():
    from enrichment.email_finder import EmailFinder
    finder = EmailFinder(db=MagicMock())
    html = read_fixture("contact_page.html")
    emails = finder.extract_emails(html, skip_generic=True)
    assert "noreply@greatshop.com" not in emails

def test_find_contact_pages():
    from enrichment.email_finder import EmailFinder
    finder = EmailFinder(db=MagicMock())
    html = read_fixture("contact_page.html")
    pages = finder.find_contact_pages(html, "https://greatshop.com")
    urls = [p for p in pages]
    assert "https://greatshop.com/about" in urls
    assert "https://greatshop.com/contact" in urls
    assert "https://greatshop.com/team" in urls

def test_stores_contacts_in_db():
    from enrichment.email_finder import EmailFinder
    mock_db = MagicMock()
    finder = EmailFinder(db=mock_db)
    lead = {"id": "uuid-123", "website_url": "https://greatshop.com"}
    with patch.object(finder, "fetch_page", return_value=read_fixture("contact_page.html")):
        finder.find_emails(lead)
    assert mock_db.insert_contact.call_count >= 1

def test_handles_no_website():
    from enrichment.email_finder import EmailFinder
    mock_db = MagicMock()
    finder = EmailFinder(db=mock_db)
    lead = {"id": "uuid-123", "website_url": None}
    finder.find_emails(lead)
    mock_db.insert_contact.assert_not_called()

@patch("enrichment.email_finder.requests.get")
def test_handles_request_failure(mock_get):
    from enrichment.email_finder import EmailFinder
    mock_get.side_effect = Exception("Connection error")
    mock_db = MagicMock()
    finder = EmailFinder(db=mock_db)
    lead = {"id": "uuid-123", "website_url": "https://deadsite.com"}
    finder.find_emails(lead)
    mock_db.insert_contact.assert_not_called()
