import re
import time
import random
import logging
import requests
from bs4 import BeautifulSoup
from config import SCRAPER_DEFAULTS

logger = logging.getLogger(__name__)

INDUSTRY_MAP = {
    "retail trade": "retail/boutique",
    "electronic commerce": "e-commerce",
    "e-commerce": "e-commerce",
    "retail": "retail/boutique",
    "boutique": "retail/boutique",
    "startup": "crowdfunding/startup",
}

SKIP_TYPES = {
    "legal services", "medical", "healthcare", "insurance",
    "accounting", "construction", "plumbing", "electrical",
}

class CountyRegistryScraper:
    BASE_URL = "https://cofs.lara.state.mi.us/SearchApi/Search/Search"

    def __init__(self, db):
        self.db = db
        self.counties = SCRAPER_DEFAULTS["target_counties"]
        self.headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        }

    def fetch_page(self, url: str) -> str | None:
        try:
            resp = requests.get(url, headers=self.headers, timeout=15)
            resp.raise_for_status()
            return resp.text
        except Exception as e:
            logger.warning(f"Failed to fetch {url}: {e}")
            return None

    def _matches_target_industry(self, business_type: str) -> bool:
        bt_lower = business_type.lower().strip()
        if bt_lower in SKIP_TYPES:
            return False
        return bt_lower in INDUSTRY_MAP

    def _map_industry(self, business_type: str) -> str:
        bt_lower = business_type.lower().strip()
        return INDUSTRY_MAP.get(bt_lower, "e-commerce")

    def parse_search_page(self, html: str) -> list[dict]:
        soup = BeautifulSoup(html, "html.parser")
        businesses = []
        for row in soup.select(".business-row"):
            name_el = row.select_one(".business-name")
            agent_el = row.select_one(".registered-agent")
            address_el = row.select_one(".address")
            date_el = row.select_one(".filing-date")
            type_el = row.select_one(".business-type")
            if not name_el:
                continue
            business_type = type_el.get_text(strip=True) if type_el else ""
            if not self._matches_target_industry(business_type):
                continue
            businesses.append({
                "business_name": name_el.get_text(strip=True),
                "registered_agent": agent_el.get_text(strip=True) if agent_el else None,
                "address": address_el.get_text(strip=True) if address_el else None,
                "filing_date": date_el.get_text(strip=True) if date_el else None,
                "business_type": business_type,
            })
        return businesses

    def build_lead_dict(self, biz_data: dict, county: str) -> dict:
        return {
            "business_name": biz_data["business_name"],
            "platform_source": "county_registry",
            "platform_url": f"michigan-lara://{biz_data['business_name']}",
            "industry": self._map_industry(biz_data["business_type"]),
            "location": county,
            "status": "new",
        }

    def _rate_limit(self):
        delay = random.uniform(SCRAPER_DEFAULTS["rate_limit_min"], SCRAPER_DEFAULTS["rate_limit_max"])
        time.sleep(delay)

    def scrape(self):
        logger.info("Starting county registry scrape...")
        for county in self.counties:
            logger.info(f"Scraping {county} County...")
            url = f"{self.BASE_URL}?county={county}"
            html = self.fetch_page(url)
            if not html:
                logger.warning(f"Failed to fetch {county} County registry")
                continue
            businesses = self.parse_search_page(html)
            logger.info(f"Found {len(businesses)} matching businesses in {county} County")
            for biz in businesses:
                lead = self.build_lead_dict(biz, county=county)
                self.db.upsert_lead(lead)
                logger.info(f"Upserted lead: {biz['business_name']}")
            self._rate_limit()

    def parse_search_page_real(self, html: str) -> list[dict]:
        """Parse real Michigan LARA search results."""
        soup = BeautifulSoup(html, "html.parser")
        businesses = []

        # Strategy 1: Look for table-based results (common in government sites)
        for table in soup.find_all("table"):
            rows = table.find_all("tr")
            for row in rows[1:]:  # Skip header row
                cells = row.find_all("td")
                if len(cells) >= 3:
                    name = cells[0].get_text(strip=True)
                    biz_type = ""
                    agent = ""
                    address = ""
                    filing_date = ""

                    for i, cell in enumerate(cells):
                        text = cell.get_text(strip=True).lower()
                        if i == 0:
                            name = cell.get_text(strip=True)
                        elif "llc" in text or "inc" in text or "corp" in text:
                            pass  # Part of name usually
                        elif any(t in text for t in ["active", "inactive", "dissolved"]):
                            pass  # Status

                    if name and not name.lower().startswith("entity"):
                        businesses.append({
                            "business_name": name,
                            "registered_agent": agent or None,
                            "address": address or None,
                            "filing_date": filing_date or None,
                            "business_type": biz_type or "Unknown",
                        })

        # Strategy 2: Look for div-based card layout
        if not businesses:
            for card in soup.select("[class*='result'], [class*='entity'], [class*='business']"):
                name_el = card.select_one("[class*='name'], h3, h4, a")
                if name_el:
                    businesses.append({
                        "business_name": name_el.get_text(strip=True),
                        "registered_agent": None,
                        "address": None,
                        "filing_date": None,
                        "business_type": "Unknown",
                    })

        # Strategy 3: Fall back to fixture format
        if not businesses:
            businesses = self.parse_search_page(html)

        return businesses

    def scrape_real(self):
        """Scrape Michigan LARA business registry using browser."""
        from scrapers.browser import fetch_with_browser

        logger.info("Starting real Michigan LARA scrape with browser...")
        base_url = "https://mibusinessregistry.lara.state.mi.us/search/business"

        html = fetch_with_browser(base_url, wait_seconds=5)
        if not html:
            logger.error("Failed to fetch Michigan LARA search page")
            return

        # Log what we see so we can refine selectors
        soup = BeautifulSoup(html, "html.parser")
        forms = soup.find_all("form")
        logger.info(f"Found {len(forms)} forms on LARA page")
        for form in forms:
            logger.info(f"Form action: {form.get('action')}, method: {form.get('method')}")
            inputs = form.find_all("input")
            for inp in inputs:
                logger.info(f"  Input: name={inp.get('name')}, type={inp.get('type')}")

        logger.info(
            "LARA scraping requires manual inspection of the live site to determine form parameters. "
            "Run with --debug to see form structure, then update scraper accordingly."
        )
