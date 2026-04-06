import re
import logging
import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

SOCIAL_PLATFORMS = {
    "instagram.com": "instagram",
    "facebook.com": "facebook",
    "twitter.com": "twitter",
    "x.com": "twitter",
    "tiktok.com": "tiktok",
    "linkedin.com": "linkedin",
    "youtube.com": "youtube",
    "pinterest.com": "pinterest",
}

class SignalAnalyzer:
    def __init__(self, db):
        self.db = db
        self.headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        }

    def fetch_page(self, url: str) -> str | None:
        try:
            resp = requests.get(url, headers=self.headers, timeout=10)
            resp.raise_for_status()
            return resp.text
        except Exception as e:
            logger.warning(f"Failed to fetch {url}: {e}")
            return None

    def check_website(self, url: str | None) -> bool:
        if not url:
            return False
        result = self.fetch_page(url)
        return result is not None

    def find_social_platforms(self, html: str) -> list[str]:
        soup = BeautifulSoup(html, "html.parser")
        found = set()
        for link in soup.find_all("a", href=True):
            href = link["href"].lower()
            for domain, platform in SOCIAL_PLATFORMS.items():
                if domain in href:
                    found.add(platform)
        return sorted(found)

    def assess_website_quality(self, html: str) -> str:
        soup = BeautifulSoup(html, "html.parser")
        score = 0
        viewport = soup.find("meta", attrs={"name": "viewport"})
        if viewport:
            score += 1
        meta_desc = soup.find("meta", attrs={"name": "description"})
        if meta_desc and meta_desc.get("content"):
            score += 1
        title = soup.find("title")
        if title and len(title.get_text(strip=True)) > 5:
            score += 1
        images = soup.find_all("img")
        if images:
            with_alt = sum(1 for img in images if img.get("alt"))
            if with_alt / len(images) > 0.5:
                score += 1
        if score >= 3:
            return "professional"
        elif score >= 1:
            return "decent"
        else:
            return "basic"

    def check_seo(self, html: str) -> bool:
        soup = BeautifulSoup(html, "html.parser")
        has_meta_desc = bool(soup.find("meta", attrs={"name": "description"}))
        title = soup.find("title")
        has_title = bool(title and len(title.get_text(strip=True)) > 10)
        images = soup.find_all("img")
        has_alt = any(img.get("alt") for img in images) if images else False
        return has_meta_desc and has_title and has_alt

    def check_paid_ads(self, html: str) -> bool:
        indicators = [
            "googletagmanager.com/gtag", "google-analytics.com", "googleads",
            "AW-", "fbq(", "facebook.com/tr", "connect.facebook.net",
        ]
        html_lower = html.lower()
        return any(indicator.lower() in html_lower for indicator in indicators)

    def analyze(self, lead: dict):
        lead_id = lead["id"]
        website_url = lead.get("website_url")
        has_website = self.check_website(website_url)
        html = None
        social_platforms = []
        website_quality = "none"
        has_seo = False
        has_paid_ads = False
        if has_website and website_url:
            html = self.fetch_page(website_url)
            if html:
                social_platforms = self.find_social_platforms(html)
                website_quality = self.assess_website_quality(html)
                has_seo = self.check_seo(html)
                has_paid_ads = self.check_paid_ads(html)
        signals = {
            "lead_id": lead_id,
            "has_website": has_website,
            "has_social_media": len(social_platforms) > 0,
            "social_platforms": social_platforms,
            "website_quality": website_quality,
            "has_seo": has_seo,
            "has_paid_ads": has_paid_ads,
        }
        self.db.upsert_marketing_signals(signals)
        logger.info(f"Analyzed signals for lead {lead_id}: quality={website_quality}")
