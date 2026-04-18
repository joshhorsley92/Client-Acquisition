"""
Enrich a single known business from name + website.

Designed as a thin CLI entry point for the Node CRM to spawn. Does NOT touch
the acq_leads/acq_marketing_signals tables — all output goes to stdout as a
single JSON document. The Node side writes the result into clients.enrichment_data.

Usage:
    python enrichment/enrich_one.py --name "Acme Co" --url https://acme.example
    python enrichment/enrich_one.py --url https://acme.example
    python enrichment/enrich_one.py --name "Acme Co"          # metadata-only, no web fetch

Exit codes:
    0 — success (JSON on stdout, even if some fields empty)
    2 — bad arguments
    3 — neither name nor url provided
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import datetime, timezone
from urllib.parse import urlparse

# Make the project root importable regardless of how this file is launched.
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

# Route all Python logging to stderr so stdout stays a clean JSON channel.
logging.basicConfig(
    stream=sys.stderr,
    level=logging.WARNING,
    format="%(levelname)s %(name)s: %(message)s",
)

from bs4 import BeautifulSoup  # noqa: E402
from enrichment.email_finder import EmailFinder  # noqa: E402
from enrichment.signal_analyzer import SignalAnalyzer, SOCIAL_PLATFORMS  # noqa: E402


def normalize_url(url: str) -> str:
    """Add https:// if the user gave us a bare domain."""
    url = url.strip()
    if not url:
        return url
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url


def extract_social_links(html: str) -> dict[str, str]:
    """Map platform name -> first matching URL found in the page."""
    soup = BeautifulSoup(html, "html.parser")
    links: dict[str, str] = {}
    for a in soup.find_all("a", href=True):
        href = a["href"]
        href_lc = href.lower()
        for domain, platform in SOCIAL_PLATFORMS.items():
            if domain in href_lc and platform not in links:
                links[platform] = href if href.startswith("http") else ""
    return {k: v for k, v in links.items() if v}


def compute_confidence(result: dict) -> float:
    """Rough 0.0-1.0 signal-density score used by the UI to badge results."""
    score = 0.0
    if result.get("has_website"):
        score += 0.2
    if result.get("emails"):
        score += 0.3
    if result.get("social_platforms"):
        score += 0.2
    if result.get("website_quality") in ("decent", "professional"):
        score += 0.2
    if result.get("has_seo"):
        score += 0.1
    return round(min(1.0, score), 2)


def enrich(name: str | None, url: str | None) -> dict:
    """Run the enrichment pipeline and return a result dict."""
    result: dict = {
        "name": name,
        "website_url": None,
        "emails": [],
        "social_links": {},
        "social_platforms": [],
        "website_quality": None,
        "has_website": False,
        "has_seo": None,
        "has_paid_ads": None,
        "sources": [],
        "errors": [],
        "confidence": 0.0,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
    }

    if not url:
        result["errors"].append("no_website_url")
        return result

    url = normalize_url(url)
    result["website_url"] = url

    email_finder = EmailFinder(db=None)
    signal_analyzer = SignalAnalyzer(db=None)

    html = signal_analyzer.fetch_page(url)
    if html is None:
        result["errors"].append("fetch_failed")
        result["confidence"] = compute_confidence(result)
        return result

    result["has_website"] = True
    result["sources"].append("website_homepage")

    # Signal analysis — all pure methods, no DB writes
    try:
        result["social_platforms"] = signal_analyzer.find_social_platforms(html)
        result["social_links"] = extract_social_links(html)
        result["website_quality"] = signal_analyzer.assess_website_quality(html)
        result["has_seo"] = signal_analyzer.check_seo(html)
        result["has_paid_ads"] = signal_analyzer.check_paid_ads(html)
    except Exception as e:
        result["errors"].append(f"signal_analysis_error: {e}")

    # Email harvest — homepage + any /contact, /about, /team pages
    try:
        emails: set[str] = set()
        emails.update(email_finder.extract_emails(html))
        contact_pages = email_finder.find_contact_pages(html, url)
        for page_url in contact_pages[:4]:  # cap page visits
            page_html = email_finder.fetch_page(page_url)
            if page_html:
                emails.update(email_finder.extract_emails(page_html))
                result["sources"].append(f"contact_page:{urlparse(page_url).path}")
        result["emails"] = sorted(emails)
    except Exception as e:
        result["errors"].append(f"email_harvest_error: {e}")

    result["confidence"] = compute_confidence(result)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", type=str, default=None, help="Business name (for logging/context)")
    parser.add_argument("--url", type=str, default=None, help="Website URL (bare domain accepted)")
    args = parser.parse_args()

    if not args.name and not args.url:
        print(json.dumps({"status": "error", "error": "at least one of --name or --url is required"}))
        return 3

    try:
        result = enrich(args.name, args.url)
        result["status"] = "ok"
        print(json.dumps(result))
        return 0
    except Exception as e:
        print(json.dumps({"status": "error", "error": str(e)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
