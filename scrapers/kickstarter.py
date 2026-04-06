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
        """Parse real Kickstarter discovery page."""
        import json
        soup = BeautifulSoup(html, "html.parser")
        projects = []

        # Strategy 1: Look for data in script tags (React initial state)
        for script in soup.find_all("script"):
            text = script.string or ""
            if "window.__PRELOADED_STATE__" in text or "initial_state" in text.lower():
                try:
                    # Extract JSON from assignment
                    start = text.index("{")
                    end = text.rindex("}") + 1
                    data = json.loads(text[start:end])
                    # Navigate to project list
                    project_list = (
                        data.get("discover", {}).get("projects", []) or
                        data.get("projects", []) or
                        data.get("data", {}).get("projects", [])
                    )
                    for proj in project_list:
                        backer_count = proj.get("backers_count", 0)
                        if backer_count >= self.min_reviews:
                            projects.append({
                                "business_name": proj.get("name", ""),
                                "project_url": proj.get("urls", {}).get("web", {}).get("project", "")
                                    or f"https://www.kickstarter.com/projects/{proj.get('creator', {}).get('slug', '')}/{proj.get('slug', '')}",
                                "review_count": backer_count,
                            })
                except (json.JSONDecodeError, ValueError, TypeError):
                    continue

        # Strategy 2: Look for project card data attributes
        if not projects:
            for card in soup.select("[data-project], [class*='project-card']"):
                name_el = card.select_one("h3, h2, [class*='project-title'], [class*='name']")
                backer_el = card.select_one("[class*='backer'], [class*='supporter']")
                if not name_el:
                    continue
                name = name_el.get_text(strip=True)
                link = card.select_one("a[href*='/projects/']")
                url = link.get("href", "") if link else ""
                if url and not url.startswith("http"):
                    url = f"https://www.kickstarter.com{url}"

                backer_count = 0
                if backer_el:
                    backer_text = backer_el.get_text(strip=True)
                    backer_count = int(re.sub(r"[^\d]", "", backer_text) or 0)

                if backer_count >= self.min_reviews:
                    projects.append({
                        "business_name": name,
                        "project_url": url,
                        "review_count": backer_count,
                    })

        # Strategy 3: Fall back to fixture format
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

    def scrape_real(self, max_pages: int = 3, categories: list[str] | None = None):
        """Scrape Kickstarter using browser-based fetching."""
        from scrapers.browser import fetch_with_browser

        if not categories:
            categories = ["design", "technology", "fashion"]

        logger.info("Starting real Kickstarter scrape with browser...")

        for category in categories:
            url = f"https://www.kickstarter.com/discover/advanced?category_id={category}&sort=popularity"
            logger.info(f"Scraping category: {category}")

            html = fetch_with_browser(url, wait_seconds=8)
            if not html:
                logger.warning(f"Failed to fetch Kickstarter category: {category}")
                continue

            projects = self.parse_search_page_real(html)
            logger.info(f"Found {len(projects)} projects in {category}")

            for project in projects:
                self._rate_limit()
                if project.get("project_url"):
                    detail_html = fetch_with_browser(project["project_url"])
                    if detail_html:
                        details = self.parse_project_page_real(detail_html)
                        project.update(details)

                lead = self.build_lead_dict(project)
                self.db.upsert_lead(lead)
                logger.info(f"Upserted lead: {project.get('business_name', 'Unknown')}")
