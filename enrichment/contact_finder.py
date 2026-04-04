import logging
import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

class ContactFinder:
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

    def extract_contacts_from_page(self, html: str) -> list[dict]:
        soup = BeautifulSoup(html, "html.parser")
        contacts = []
        for member in soup.select(".team-member"):
            name_el = member.select_one(".member-name")
            role_el = member.select_one(".member-role")
            if not name_el:
                continue
            contacts.append({
                "name": name_el.get_text(strip=True),
                "role": role_el.get_text(strip=True) if role_el else "Unknown",
            })
        return contacts

    def extract_platform_contact(self, html: str, platform: str) -> dict | None:
        soup = BeautifulSoup(html, "html.parser")
        if platform == "etsy":
            owner_el = soup.select_one(".shop-owner")
            if owner_el:
                name = owner_el.get_text(strip=True).replace("Owner:", "").strip()
                return {"name": name, "role": "Owner"}
        elif platform == "kickstarter":
            creator_el = soup.select_one(".creator-name")
            if creator_el:
                return {"name": creator_el.get_text(strip=True), "role": "Creator"}
        return None

    def build_county_contact(self, agent_name: str, lead_id: str) -> dict:
        return {
            "lead_id": lead_id,
            "name": agent_name,
            "role": "Registered Agent",
            "source": "county_registry",
        }

    def find_contacts(self, lead: dict):
        website_url = lead.get("website_url")
        lead_id = lead["id"]
        if website_url:
            html = self.fetch_page(website_url)
            if html:
                contacts = self.extract_contacts_from_page(html)
                for contact in contacts:
                    self.db.insert_contact({
                        "lead_id": lead_id,
                        "name": contact["name"],
                        "role": contact["role"],
                        "source": "website",
                    })
                logger.info(f"Found {len(contacts)} contacts for lead {lead_id}")
