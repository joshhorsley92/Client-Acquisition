import re
import time
import random
import logging
import requests
from bs4 import BeautifulSoup
from config import SCRAPER_DEFAULTS

logger = logging.getLogger(__name__)

class EtsyScraper:
    BASE_SEARCH_URL = "https://www.etsy.com/search"

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
        shops = []
        for card in soup.select(".shop-card"):
            name_el = card.select_one(".shop-name")
            review_el = card.select_one(".review-count")
            rating_el = card.select_one(".rating")
            if not name_el or not review_el:
                continue
            review_text = review_el.get_text(strip=True)
            review_count = int(re.sub(r"[^\d]", "", review_text) or 0)
            if review_count < self.min_reviews:
                continue
            shop_url = card.get("data-shop-url", "")
            rating = float(rating_el.get_text(strip=True)) if rating_el else None
            shops.append({
                "business_name": name_el.get_text(strip=True),
                "shop_url": shop_url,
                "review_count": review_count,
                "rating": rating,
            })
        return shops

    def parse_shop_page(self, html: str) -> dict:
        soup = BeautifulSoup(html, "html.parser")
        details = {"website_url": None, "social_links": []}
        website_link = soup.select_one(".website-link")
        if website_link:
            details["website_url"] = website_link.get("href")
        for link in soup.select(".social-link"):
            href = link.get("href", "")
            if href:
                details["social_links"].append(href)
        owner_el = soup.select_one(".shop-owner")
        if owner_el:
            text = owner_el.get_text(strip=True)
            details["owner_name"] = text.replace("Owner:", "").strip()
        return details

    def build_lead_dict(self, shop_data: dict) -> dict:
        return {
            "business_name": shop_data["business_name"],
            "platform_source": "etsy",
            "platform_url": shop_data["shop_url"],
            "industry": "e-commerce",
            "review_count": shop_data["review_count"],
            "rating": shop_data.get("rating"),
            "website_url": shop_data.get("website_url"),
            "status": "new",
        }

    def _rate_limit(self):
        delay = random.uniform(
            SCRAPER_DEFAULTS["rate_limit_min"],
            SCRAPER_DEFAULTS["rate_limit_max"],
        )
        time.sleep(delay)

    def scrape(self, max_pages: int = 5):
        logger.info("Starting Etsy scrape...")
        search_html = self.fetch_page(self.BASE_SEARCH_URL)
        if not search_html:
            logger.error("Failed to fetch Etsy search page")
            return
        shops = self.parse_search_page(search_html)
        logger.info(f"Found {len(shops)} shops above {self.min_reviews} reviews")
        for shop in shops:
            self._rate_limit()
            detail_html = self.fetch_page_detail(shop["shop_url"])
            if detail_html:
                details = self.parse_shop_page(detail_html)
                shop.update(details)
            lead = self.build_lead_dict(shop)
            self.db.upsert_lead(lead)
            logger.info(f"Upserted lead: {shop['business_name']}")
