import re
import logging
import requests
from urllib.parse import urljoin
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

EMAIL_REGEX = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
GENERIC_PREFIXES = {"noreply", "no-reply", "donotreply", "mailer-daemon", "postmaster"}
CONTACT_PATHS = {"about", "contact", "team", "our-team", "about-us", "contact-us"}

class EmailFinder:
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

    def extract_emails(self, html: str, skip_generic: bool = True) -> list[str]:
        soup = BeautifulSoup(html, "html.parser")
        found = set()
        for link in soup.select("a[href^='mailto:']"):
            href = link.get("href", "")
            email = href.replace("mailto:", "").split("?")[0].strip()
            if email:
                found.add(email.lower())
        text = soup.get_text()
        for match in EMAIL_REGEX.findall(text):
            found.add(match.lower())
        valid = []
        for email in found:
            parts = email.split("@")
            if len(parts) != 2 or not parts[1] or "." not in parts[1]:
                continue
            if parts[1].startswith(".") or parts[1].endswith("."):
                continue
            if skip_generic and parts[0] in GENERIC_PREFIXES:
                continue
            valid.append(email)
        return sorted(set(valid))

    def find_contact_pages(self, html: str, base_url: str) -> list[str]:
        soup = BeautifulSoup(html, "html.parser")
        pages = []
        for link in soup.find_all("a", href=True):
            href = link["href"]
            path = href.strip("/").lower()
            if path in CONTACT_PATHS:
                full_url = urljoin(base_url, href)
                pages.append(full_url)
        return pages

    def find_emails(self, lead: dict):
        website_url = lead.get("website_url")
        if not website_url:
            logger.info(f"Lead {lead['id']} has no website, skipping email finder")
            return
        html = self.fetch_page(website_url)
        if not html:
            return
        all_emails = set()
        all_emails.update(self.extract_emails(html))
        contact_pages = self.find_contact_pages(html, website_url)
        for page_url in contact_pages:
            page_html = self.fetch_page(page_url)
            if page_html:
                all_emails.update(self.extract_emails(page_html))
        for email in all_emails:
            self.db.insert_contact({
                "lead_id": lead["id"],
                "email": email,
                "source": "website",
            })
        logger.info(f"Found {len(all_emails)} emails for lead {lead['id']}")
