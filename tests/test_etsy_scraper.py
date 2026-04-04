import os
import pytest
from unittest.mock import MagicMock, patch
from bs4 import BeautifulSoup

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")

def read_fixture(filename):
    with open(os.path.join(FIXTURES_DIR, filename), "r") as f:
        return f.read()

def test_parse_search_results():
    from scrapers.etsy import EtsyScraper
    scraper = EtsyScraper(db=MagicMock())
    html = read_fixture("etsy_search_results.html")
    shops = scraper.parse_search_page(html)
    assert len(shops) >= 2
    names = [s["business_name"] for s in shops]
    assert "Great Shop One" in names
    assert "Great Shop Two" in names

def test_filters_below_threshold():
    from scrapers.etsy import EtsyScraper
    scraper = EtsyScraper(db=MagicMock())
    html = read_fixture("etsy_search_results.html")
    shops = scraper.parse_search_page(html)
    names = [s["business_name"] for s in shops]
    assert "Small Shop" not in names

def test_parse_shop_about_page():
    from scrapers.etsy import EtsyScraper
    scraper = EtsyScraper(db=MagicMock())
    html = read_fixture("etsy_shop_page.html")
    details = scraper.parse_shop_page(html)
    assert details["website_url"] == "https://greatshopone.com"
    assert "instagram.com" in str(details.get("social_links", []))

def test_build_lead_dict():
    from scrapers.etsy import EtsyScraper
    scraper = EtsyScraper(db=MagicMock())
    shop_data = {
        "business_name": "Test Shop",
        "shop_url": "https://www.etsy.com/shop/TestShop",
        "review_count": 200,
        "rating": 4.7,
        "website_url": "https://testshop.com",
    }
    lead = scraper.build_lead_dict(shop_data)
    assert lead["platform_source"] == "etsy"
    assert lead["platform_url"] == "https://www.etsy.com/shop/TestShop"
    assert lead["business_name"] == "Test Shop"
    assert lead["review_count"] == 200
    assert lead["status"] == "new"

def test_scrape_calls_upsert():
    from scrapers.etsy import EtsyScraper
    mock_db = MagicMock()
    scraper = EtsyScraper(db=mock_db)
    with patch.object(scraper, "fetch_page", return_value=read_fixture("etsy_search_results.html")):
        with patch.object(scraper, "fetch_page_detail", return_value=read_fixture("etsy_shop_page.html")):
            scraper.scrape(max_pages=1)
    assert mock_db.upsert_lead.call_count >= 2

@patch("scrapers.etsy.time.sleep")
def test_rate_limiting(mock_sleep):
    from scrapers.etsy import EtsyScraper
    scraper = EtsyScraper(db=MagicMock())
    with patch.object(scraper, "fetch_page", return_value=read_fixture("etsy_search_results.html")):
        with patch.object(scraper, "fetch_page_detail", return_value=read_fixture("etsy_shop_page.html")):
            scraper.scrape(max_pages=1)
    assert mock_sleep.call_count > 0

def test_handles_empty_results():
    from scrapers.etsy import EtsyScraper
    scraper = EtsyScraper(db=MagicMock())
    shops = scraper.parse_search_page("<html><body></body></html>")
    assert shops == []

@patch("scrapers.etsy.requests.get")
def test_handles_request_failure(mock_get):
    from scrapers.etsy import EtsyScraper
    mock_get.side_effect = Exception("Connection error")
    scraper = EtsyScraper(db=MagicMock())
    result = scraper.fetch_page("https://etsy.com/search")
    assert result is None
