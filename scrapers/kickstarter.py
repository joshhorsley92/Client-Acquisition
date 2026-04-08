import re
import time
import random
import logging
import requests
from bs4 import BeautifulSoup
from config import SCRAPER_DEFAULTS

logger = logging.getLogger(__name__)

class KickstarterScraper:
    BASE_SEARCH_URL = "https://www.kickstarter.com/discover"

    def __init__(self, db):
        self.db = db
        self.min_reviews = SCRAPER_DEFAULTS["min_reviews"]
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

    def fetch_page_detail(self, url: str) -> str | None:
        return self.fetch_page(url)

    def parse_search_page(self, html: str) -> list[dict]:
        soup = BeautifulSoup(html, "html.parser")
        projects = []
        for card in soup.select(".project-card"):
            name_el = card.select_one(".project-name")
            backer_el = card.select_one(".backer-count")
            if not name_el or not backer_el:
                continue
            backer_text = backer_el.get_text(strip=True)
            backer_count = int(re.sub(r"[^\d]", "", backer_text) or 0)
            if backer_count < self.min_reviews:
                continue
            project_url = card.get("data-project-url", "")
            projects.append({
                "business_name": name_el.get_text(strip=True),
                "project_url": project_url,
                "review_count": backer_count,
            })
        return projects

    def parse_project_page(self, html: str) -> dict:
        soup = BeautifulSoup(html, "html.parser")
        details = {"website_url": None, "creator_name": None}
        website_link = soup.select_one(".website-link")
        if website_link:
            details["website_url"] = website_link.get("href")
        creator_el = soup.select_one(".creator-name")
        if creator_el:
            details["creator_name"] = creator_el.get_text(strip=True)
        return details

    def build_lead_dict(self, project_data: dict) -> dict:
        return {
            "business_name": project_data["business_name"],
            "platform_source": "kickstarter",
            "platform_url": project_data["project_url"],
            "industry": "crowdfunding/startup",
            "review_count": project_data["review_count"],
            "website_url": project_data.get("website_url"),
            "status": "new",
        }

    def _rate_limit(self):
        delay = random.uniform(SCRAPER_DEFAULTS["rate_limit_min"], SCRAPER_DEFAULTS["rate_limit_max"])
        time.sleep(delay)

    def scrape(self, max_pages: int = 5):
        logger.info("Starting Kickstarter scrape...")
        search_html = self.fetch_page(self.BASE_SEARCH_URL)
        if not search_html:
            logger.error("Failed to fetch Kickstarter search page")
            return
        projects = self.parse_search_page(search_html)
        logger.info(f"Found {len(projects)} projects above {self.min_reviews} backers")
        for project in projects:
            self._rate_limit()
            detail_html = self.fetch_page_detail(project["project_url"])
            if detail_html:
                details = self.parse_project_page(detail_html)
                project.update(details)
            lead = self.build_lead_dict(project)
            self.db.upsert_lead(lead)
            logger.info(f"Upserted lead: {project['business_name']}")

    def parse_search_page_real(self, html: str) -> list[dict]:
        """Parse real Kickstarter discovery page.

        Kickstarter embeds full project JSON in data-project attributes
        on card elements, including name, backers_count, creator, URLs.
        """
        import json
        soup = BeautifulSoup(html, "html.parser")
        projects = []

        # Strategy 1: Parse JSON from data-project attributes (most reliable)
        for card in soup.select("[data-project]"):
            try:
                data = json.loads(card.get("data-project", "{}"))
                backer_count = data.get("backers_count", 0)
                if backer_count < self.min_reviews:
                    continue

                project_url = (
                    data.get("urls", {}).get("web", {}).get("project", "")
                    or f"https://www.kickstarter.com/projects/{data.get('slug', '')}"
                )
                creator = data.get("creator", {})
                creator_name = creator.get("name") if isinstance(creator, dict) else str(creator)

                projects.append({
                    "business_name": data.get("name", ""),
                    "project_url": project_url,
                    "review_count": backer_count,
                    "creator_name": creator_name,
                })
            except (json.JSONDecodeError, TypeError, ValueError):
                continue

        # Strategy 2: Fall back to fixture format
        if not projects:
            projects = self.parse_search_page(html)

        return projects

    def parse_project_page_real(self, html: str) -> dict:
        """Parse real Kickstarter project page."""
        import json
        soup = BeautifulSoup(html, "html.parser")
        details = {"website_url": None, "creator_name": None}

        # Look for creator info in JSON-LD or page data
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string)
                if isinstance(data, dict):
                    creator = data.get("creator", {})
                    if creator:
                        details["creator_name"] = creator.get("name")
            except (json.JSONDecodeError, TypeError):
                continue

        # Look for creator section
        if not details["creator_name"]:
            creator_el = soup.select_one("[class*='creator'] [class*='name'], .creator-name")
            if creator_el:
                details["creator_name"] = creator_el.get_text(strip=True)

        # Look for external website links
        for link in soup.find_all("a", href=True):
            href = link["href"]
            if href.startswith("http") and "kickstarter.com" not in href:
                lower = href.lower()
                if not any(s in lower for s in ["facebook.com", "twitter.com", "instagram.com", "youtube.com"]):
                    details["website_url"] = href
                    break

        # Fall back to fixture format
        if not details["website_url"] and not details["creator_name"]:
            fixture_details = self.parse_project_page(html)
            details.update({k: v for k, v in fixture_details.items() if v})

        return details

    def scrape_real(self, max_pages: int = 3, categories: list[str] | None = None, headless: bool = True):
        """Scrape Kickstarter using browser-based fetching.

        The discover page embeds full project JSON in data-project attributes,
        so we can get name, backers, creator, and URL from the search page alone
        without visiting each project's detail page.
        """
        from scrapers.browser import BrowserSession
        import time as _time

        if not categories:
            categories = ["design", "technology", "fashion"]

        logger.info("Starting real Kickstarter scrape with browser...")

        with BrowserSession(headless=headless) as browser:
            for category in categories:
                url = f"https://www.kickstarter.com/discover/advanced?category_id={category}&sort=popularity"
                logger.info(f"Scraping category: {category}")

                # Longer wait between categories to avoid triggering CAPTCHAs
                html = browser.fetch(url, wait_seconds=10)
                if not html:
                    logger.warning(f"Failed to fetch Kickstarter category: {category}")
                    continue

                # Check for CAPTCHA
                if "recaptcha" in html.lower() or "challenge" in html.lower():
                    if not headless:
                        logger.info("CAPTCHA detected. Please solve it in the browser window...")
                        for _ in range(60):
                            _time.sleep(2)
                            html = browser.driver.page_source
                            if "recaptcha" not in html.lower():
                                logger.info("CAPTCHA solved!")
                                break

                projects = self.parse_search_page_real(html)
                logger.info(f"Found {len(projects)} projects in {category}")

                # The discover page already has all the data we need (name, backers, creator, URL)
                # No need to visit each project page — saves time and avoids CAPTCHA triggers
                for project in projects:
                    lead = self.build_lead_dict(project)
                    self.db.upsert_lead(lead)
                    logger.info(f"Upserted lead: {project.get('business_name', 'Unknown')} ({project.get('review_count', 0)} backers)")

                # Wait between categories to be respectful
                if category != categories[-1]:
                    delay = random.uniform(8, 15)
                    logger.info(f"Waiting {delay:.0f}s before next category...")
                    _time.sleep(delay)
