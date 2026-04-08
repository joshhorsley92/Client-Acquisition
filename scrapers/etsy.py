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

    def extract_listing_urls_from_search(self, html: str) -> list[str]:
        """Extract product listing URLs from an Etsy search/category page.

        We'll visit individual listings to extract shop info,
        since shop links aren't directly on search pages.
        """
        soup = BeautifulSoup(html, "html.parser")
        listing_urls = []

        # Get listing URLs from cards with data-listing-id
        for card in soup.select("[data-listing-id]"):
            link = card.select_one("a[href*='/listing/']")
            if link:
                href = link.get("href", "").split("?")[0]
                if href and href not in listing_urls:
                    listing_urls.append(href)

        return listing_urls

    def extract_shop_from_listing(self, html: str) -> dict | None:
        """Extract shop name and URL from a product listing page."""
        import json
        soup = BeautifulSoup(html, "html.parser")

        # Look for shop name in JSON-LD
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string)
                if isinstance(data, dict) and data.get("@type") == "Product":
                    offers = data.get("offers", {})
                    seller = offers.get("seller", {}) if isinstance(offers, dict) else {}
                    if seller.get("name"):
                        return {
                            "shop_name": seller["name"],
                            "shop_url": seller.get("url", f"https://www.etsy.com/shop/{seller['name']}"),
                        }
            except (json.JSONDecodeError, TypeError):
                continue

        # Look for shop link pattern in page
        for link in soup.find_all("a", href=True):
            href = link["href"]
            if "/shop/" in href and "etsy.com" in href:
                parts = href.split("/shop/")
                if len(parts) == 2:
                    shop_name = parts[1].split("?")[0].split("/")[0]
                    if shop_name:
                        return {
                            "shop_name": shop_name,
                            "shop_url": f"https://www.etsy.com/shop/{shop_name}",
                        }

        return None

    def parse_shop_page_real(self, html: str) -> dict:
        """Parse a real Etsy shop page for shop name, review count, website, socials."""
        import json
        soup = BeautifulSoup(html, "html.parser")
        details = {
            "business_name": None,
            "review_count": 0,
            "rating": None,
            "website_url": None,
            "social_links": [],
            "owner_name": None,
        }

        # Shop name — look for prominent headings or meta tags
        og_title = soup.find("meta", property="og:title")
        if og_title:
            title = og_title.get("content", "")
            # Etsy titles are often "ShopName | Etsy" or "ShopName - Etsy"
            for sep in [" | ", " - ", " – "]:
                if sep in title:
                    details["business_name"] = title.split(sep)[0].strip()
                    break
            if not details["business_name"]:
                details["business_name"] = title.strip()

        if not details["business_name"]:
            title_tag = soup.find("title")
            if title_tag:
                title = title_tag.get_text(strip=True)
                for sep in [" | ", " - ", " – "]:
                    if sep in title:
                        details["business_name"] = title.split(sep)[0].strip()
                        break

        # Review count — look for text patterns like "X,XXX reviews" or "X sales"
        page_text = soup.get_text()
        review_match = re.search(r'([\d,]+)\s*(?:reviews|sales)', page_text, re.IGNORECASE)
        if review_match:
            count_str = review_match.group(1).replace(",", "")
            try:
                details["review_count"] = int(count_str)
            except ValueError:
                pass

        # Rating from JSON-LD
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string)
                if isinstance(data, dict):
                    rating_data = data.get("aggregateRating", {})
                    if rating_data:
                        details["rating"] = float(rating_data.get("ratingValue", 0))
                        if not details["review_count"]:
                            details["review_count"] = int(rating_data.get("reviewCount", 0))
            except (json.JSONDecodeError, TypeError, ValueError):
                continue

        # External links (website and social media)
        for link in soup.find_all("a", href=True):
            href = link["href"]
            if href.startswith("http") and "etsy.com" not in href:
                lower = href.lower()
                if any(s in lower for s in ["instagram.com", "facebook.com", "twitter.com",
                                            "tiktok.com", "pinterest.com"]):
                    details["social_links"].append(href)
                elif not details["website_url"] and not any(
                    s in lower for s in ["google.com", "youtube.com", "amazon.com",
                                          "paypal.com", "apple.com"]
                ):
                    details["website_url"] = href

        # Owner name
        for el in soup.find_all(string=re.compile(r"Owner|Maker|Creator", re.IGNORECASE)):
            parent = el.find_parent()
            if parent:
                text = parent.get_text(strip=True)
                name_match = re.search(r'(?:Owner|Maker|Creator)[:\s]+(.+?)(?:\s*$|\s*[,|])', text)
                if name_match:
                    details["owner_name"] = name_match.group(1).strip()
                    break

        # Fall back to fixture-format parsing
        if not details["business_name"]:
            fixture_details = self.parse_shop_page(html)
            details.update({k: v for k, v in fixture_details.items() if v})

        return details

    def scrape_real(self, max_pages: int = 3, categories: list[str] | None = None, headless: bool = True):
        """Scrape Etsy shops by browsing category pages.

        Strategy:
        1. Fetch category pages → extract product listing URLs
        2. Visit a sample of listings → extract shop name/URL from each
        3. Deduplicate shops
        4. Visit each unique shop page → get review count, website, socials
        5. Filter by min_reviews threshold, upsert qualifying shops
        """
        from scrapers.browser import BrowserSession

        if not categories:
            categories = ["handmade", "vintage", "craft_supplies"]

        logger.info("Starting real Etsy scrape with browser...")
        seen_shops = set()
        max_listings_per_category = 15

        with BrowserSession(headless=headless) as browser:
            for category in categories:
                url = f"https://www.etsy.com/c/{category}?explicit=1&order=most_relevant"
                logger.info(f"Scraping category: {category}")

                html = browser.fetch(url, wait_seconds=8)
                if not html:
                    logger.warning(f"Failed to fetch Etsy category: {category}")
                    continue

                listing_urls = self.extract_listing_urls_from_search(html)
                logger.info(f"Found {len(listing_urls)} listings in {category}, sampling {min(len(listing_urls), max_listings_per_category)}")

                # Sample listings to discover unique shops
                shop_map = {}
                for listing_url in listing_urls[:max_listings_per_category]:
                    self._rate_limit()
                    listing_html = browser.fetch(listing_url)
                    if not listing_html:
                        continue

                    shop_info = self.extract_shop_from_listing(listing_html)
                    if shop_info and shop_info["shop_url"] not in seen_shops:
                        shop_map[shop_info["shop_url"]] = shop_info["shop_name"]
                        seen_shops.add(shop_info["shop_url"])

                logger.info(f"Discovered {len(shop_map)} unique shops from {category}")

                # Visit each shop page for details
                for shop_url, shop_name in shop_map.items():
                    self._rate_limit()
                    shop_html = browser.fetch(shop_url)
                    if not shop_html:
                        continue

                    shop_data = self.parse_shop_page_real(shop_html)
                    shop_data["shop_url"] = shop_url
                    if not shop_data.get("business_name"):
                        shop_data["business_name"] = shop_name

                    if shop_data.get("review_count", 0) < self.min_reviews:
                        logger.info(f"Shop {shop_data['business_name']} has {shop_data.get('review_count', 0)} reviews (below {self.min_reviews}), skipping")
                        continue

                    lead = self.build_lead_dict(shop_data)
                    self.db.upsert_lead(lead)
                    logger.info(f"Upserted shop: {shop_data['business_name']} ({shop_data.get('review_count', 0)} reviews)")
