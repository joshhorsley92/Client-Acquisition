import os
import pytest
from unittest.mock import MagicMock, patch

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")

def read_fixture(filename):
    with open(os.path.join(FIXTURES_DIR, filename), "r") as f:
        return f.read()

def test_parse_search_results():
    from scrapers.county_registry import CountyRegistryScraper
    scraper = CountyRegistryScraper(db=MagicMock())
    html = read_fixture("county_search_results.html")
    businesses = scraper.parse_search_page(html)
    assert len(businesses) >= 2
    names = [b["business_name"] for b in businesses]
    assert "Metro Boutique LLC" in names
    assert "Detroit Online Goods Inc" in names

def test_filters_by_business_type():
    from scrapers.county_registry import CountyRegistryScraper
    scraper = CountyRegistryScraper(db=MagicMock())
    html = read_fixture("county_search_results.html")
    businesses = scraper.parse_search_page(html)
    names = [b["business_name"] for b in businesses]
    assert "Smith Law Office" not in names

def test_build_lead_dict():
    from scrapers.county_registry import CountyRegistryScraper
    scraper = CountyRegistryScraper(db=MagicMock())
    biz_data = {
        "business_name": "Metro Boutique LLC",
        "registered_agent": "Sarah Johnson",
        "address": "123 Main St, Detroit, MI 48201",
        "filing_date": "2020-03-15",
        "business_type": "Retail Trade",
    }
    lead = scraper.build_lead_dict(biz_data, county="Wayne")
    assert lead["platform_source"] == "county_registry"
    assert lead["location"] == "Wayne"
    assert lead["industry"] == "retail/boutique"
    assert lead["status"] == "new"

def test_handles_multiple_counties():
    from scrapers.county_registry import CountyRegistryScraper
    mock_db = MagicMock()
    scraper = CountyRegistryScraper(db=mock_db)
    with patch.object(scraper, "fetch_page", return_value=read_fixture("county_search_results.html")) as mock_fetch:
        scraper.scrape()
        assert mock_fetch.call_count >= 3

def test_handles_empty_results():
    from scrapers.county_registry import CountyRegistryScraper
    scraper = CountyRegistryScraper(db=MagicMock())
    businesses = scraper.parse_search_page("<html><body></body></html>")
    assert businesses == []

@patch("scrapers.county_registry.requests.get")
def test_handles_request_failure(mock_get):
    from scrapers.county_registry import CountyRegistryScraper
    mock_get.side_effect = Exception("Connection error")
    scraper = CountyRegistryScraper(db=MagicMock())
    result = scraper.fetch_page("https://michigan.gov/lara")
    assert result is None
