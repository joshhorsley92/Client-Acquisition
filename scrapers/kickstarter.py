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
