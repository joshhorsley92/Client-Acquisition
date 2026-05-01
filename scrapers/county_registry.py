import re
import time
import random
import logging
import requests
from bs4 import BeautifulSoup
from config import SCRAPER_DEFAULTS

logger = logging.getLogger(__name__)

INDUSTRY_MAP = {
    # Retail
    "retail trade": "retail/boutique",
    "retail": "retail/boutique",
    "boutique": "retail/boutique",
    "specialty retail": "retail/boutique",
    "apparel": "retail/boutique",
    # Contractor / trade services (Joe's ICP — Michigan trades + home services)
    "construction": "contractor_services",
    "general contractor": "contractor_services",
    "contractor": "contractor_services",
    "contracting": "contractor_services",
    "plumbing": "contractor_services",
    "electrical": "contractor_services",
    "hvac": "contractor_services",
    "roofing": "contractor_services",
    "landscaping": "contractor_services",
    "remodeling": "contractor_services",
    "home services": "contractor_services",
    "home improvement": "contractor_services",
    # Kept for back-compat with existing leads but de-prioritized in CRM ICP
    "electronic commerce": "e-commerce",
    "e-commerce": "e-commerce",
    "startup": "crowdfunding/startup",
}

# TKBS does not target these industries — Joe excluded them from ICP because
# they have specialized marketing channels we don't serve well.
SKIP_TYPES = {
    "legal services", "medical", "healthcare", "insurance", "accounting",
}

class CountyRegistryScraper:
    BASE_URL = "https://cofs.lara.state.mi.us/SearchApi/Search/Search"

    def __init__(self, db):
        self.db = db
        self.counties = SCRAPER_DEFAULTS["target_counties"]
        # Industry filter — only keep leads whose mapped category appears here.
        # Defaults from config; override via TKBS_INDUSTRIES env var.
        self.target_industries = set(SCRAPER_DEFAULTS["target_industries"])
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
        if bt_lower not in INDUSTRY_MAP:
            return False
        # Honor the run-time industry filter (set by TKBS_INDUSTRIES env var).
        return INDUSTRY_MAP[bt_lower] in self.target_industries

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

    def scrape_real(self, headless: bool = True):
        """Scrape Michigan LARA business registry using browser.

        In visible mode, you can solve the Cloudflare CAPTCHA manually,
        then the scraper will parse the results.
        """
        from scrapers.browser import BrowserSession
        import time as _time

        logger.info("Starting real Michigan LARA scrape with browser...")
        base_url = "https://mibusinessregistry.lara.state.mi.us/search/business"

        with BrowserSession(headless=headless) as browser:
            html = browser.fetch(base_url, wait_seconds=5)
            if not html:
                logger.error("Failed to fetch Michigan LARA search page")
                return

            # Check if we hit Cloudflare
            if "Just a moment" in html or "cf-turnstile" in html:
                if headless:
                    logger.error("LARA has Cloudflare protection. Run with --visible to solve CAPTCHA manually.")
                    return
                else:
                    logger.info("Cloudflare detected. Please solve the CAPTCHA in the browser window...")
                    # Wait for user to solve CAPTCHA (poll for page change)
                    for _ in range(60):  # Wait up to 60 seconds
                        _time.sleep(2)
                        html = browser.driver.page_source
                        if "Just a moment" not in html and "cf-turnstile" not in html:
                            logger.info("CAPTCHA solved! Continuing...")
                            break
                    else:
                        logger.error("CAPTCHA not solved in time.")
                        return

            # Log the page structure for debugging
            soup = BeautifulSoup(html, "html.parser")
            title = soup.find("title")
            logger.info(f"Page title: {title.get_text(strip=True) if title else 'no title'}")

            inputs = soup.find_all("input")
            logger.info(f"Found {len(inputs)} input elements")
            for inp in inputs[:10]:
                logger.info(f"  Input: name={inp.get('name')} type={inp.get('type')} placeholder={inp.get('placeholder', '')}")

            logger.info(
                "LARA portal loaded. To complete scraping, the search form parameters need to be "
                "identified from the live page. Use --visible mode to interact with the form manually."
            )
