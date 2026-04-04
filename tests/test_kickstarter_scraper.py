import os
import pytest
from unittest.mock import MagicMock, patch

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")

def read_fixture(filename):
    with open(os.path.join(FIXTURES_DIR, filename), "r") as f:
        return f.read()

def test_parse_search_results():
    from scrapers.kickstarter import KickstarterScraper
    scraper = KickstarterScraper(db=MagicMock())
    html = read_fixture("kickstarter_search.html")
    projects = scraper.parse_search_page(html)
    assert len(projects) >= 2
    names = [p["business_name"] for p in projects]
    assert "Cool Product" in names
    assert "Awesome Gadget" in names

def test_filters_below_threshold():
    from scrapers.kickstarter import KickstarterScraper
    scraper = KickstarterScraper(db=MagicMock())
    html = read_fixture("kickstarter_search.html")
    projects = scraper.parse_search_page(html)
    names = [p["business_name"] for p in projects]
    assert "Tiny Thing" not in names

def test_parse_project_page():
    from scrapers.kickstarter import KickstarterScraper
    scraper = KickstarterScraper(db=MagicMock())
    html = read_fixture("kickstarter_project.html")
    details = scraper.parse_project_page(html)
    assert details["website_url"] == "https://coolproduct.com"
    assert details["creator_name"] == "John Creator"

def test_build_lead_dict():
    from scrapers.kickstarter import KickstarterScraper
    scraper = KickstarterScraper(db=MagicMock())
    project_data = {
        "business_name": "Cool Product",
        "project_url": "https://www.kickstarter.com/projects/creator1/cool-product",
        "review_count": 1200,
        "website_url": "https://coolproduct.com",
    }
    lead = scraper.build_lead_dict(project_data)
    assert lead["platform_source"] == "kickstarter"
    assert lead["platform_url"] == project_data["project_url"]
    assert lead["industry"] == "crowdfunding/startup"
    assert lead["status"] == "new"

def test_scrape_calls_upsert():
    from scrapers.kickstarter import KickstarterScraper
    mock_db = MagicMock()
    scraper = KickstarterScraper(db=mock_db)
    with patch.object(scraper, "fetch_page", return_value=read_fixture("kickstarter_search.html")):
        with patch.object(scraper, "fetch_page_detail", return_value=read_fixture("kickstarter_project.html")):
            scraper.scrape(max_pages=1)
    assert mock_db.upsert_lead.call_count >= 2

def test_handles_empty_results():
    from scrapers.kickstarter import KickstarterScraper
    scraper = KickstarterScraper(db=MagicMock())
    projects = scraper.parse_search_page("<html><body></body></html>")
    assert projects == []

@patch("scrapers.kickstarter.requests.get")
def test_handles_request_failure(mock_get):
    from scrapers.kickstarter import KickstarterScraper
    mock_get.side_effect = Exception("Connection error")
    scraper = KickstarterScraper(db=MagicMock())
    result = scraper.fetch_page("https://kickstarter.com/discover")
    assert result is None
