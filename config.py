# config.py
import os
from dotenv import load_dotenv

load_dotenv()

BRAND = {
    "accent_color": "#00D4AA",
    "dark_bg": "#1B2838",
    "text_color": "#1B2838",
    "subtle_color": "#64748B",
    "font": "Arial",
    "tagline": "YOUR GROWTH, UNLOCKED",
}

PITCH_MAP = {
    "no_website": (
        "You're building something customers love — but without a website you own, "
        "you're leaving money on the table and letting platforms control your reach."
    ),
    "no_social": (
        "Your competitors are building audiences on social media that you're missing. "
        "A consistent social presence turns browsers into buyers."
    ),
    "basic_website": (
        "Your online presence doesn't match the quality of your product. "
        "A modern, professional site builds trust and drives conversions."
    ),
    "no_seo": (
        "Customers are searching for exactly what you sell — but they can't find you. "
        "Basic SEO puts you in front of buyers who are already looking."
    ),
    "no_ads": (
        "There's untapped demand you could be capturing right now. "
        "Targeted advertising amplifies what's already working."
    ),
}

SCRAPER_DEFAULTS = {
    "min_reviews": 100,
    "rate_limit_min": 2,
    "rate_limit_max": 5,
    "target_industries": ["e-commerce", "retail/boutique", "crowdfunding/startup"],
    "target_counties": ["Wayne", "Oakland", "Macomb"],
}


def load_config():
    config = {}
    config["db_path"] = os.getenv("DB_PATH", os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "tkbs-crm", "tkbs-crm.db"
    ))
    config["tkbs_base_url"] = os.getenv("TKBS_BASE_URL", "https://turnkeymarketing.com/start")
    config["selenium_driver_path"] = os.getenv("SELENIUM_DRIVER_PATH", "")
    config["gmail_sender"] = os.getenv("GMAIL_SENDER", "")
    config["gmail_app_password"] = os.getenv("GMAIL_APP_PASSWORD", "")
    return config
