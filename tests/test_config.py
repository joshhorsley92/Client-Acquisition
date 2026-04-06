# tests/test_config.py
import os
import pytest


def test_load_config_defaults():
    from config import load_config
    cfg = load_config()
    assert "db_path" in cfg
    assert "tkbs_base_url" in cfg
    assert cfg["tkbs_base_url"] == "https://turnkeymarketing.com/start"


def test_load_config_with_env_override(monkeypatch):
    monkeypatch.setenv("DB_PATH", "/custom/path.db")
    monkeypatch.setenv("TKBS_BASE_URL", "https://custom.com/start")
    from config import load_config
    cfg = load_config()
    assert cfg["db_path"] == "/custom/path.db"
    assert cfg["tkbs_base_url"] == "https://custom.com/start"


def test_brand_constants():
    from config import BRAND
    assert BRAND["accent_color"] == "#00D4AA"
    assert BRAND["dark_bg"] == "#1B2838"
    assert BRAND["text_color"] == "#1B2838"
    assert BRAND["subtle_color"] == "#64748B"
    assert BRAND["font"] == "Arial"
    assert BRAND["tagline"] == "YOUR GROWTH, UNLOCKED"


def test_pitch_mapping():
    from config import PITCH_MAP
    assert "no_website" in PITCH_MAP
    assert "no_social" in PITCH_MAP
    assert "basic_website" in PITCH_MAP
    assert "no_seo" in PITCH_MAP
    assert "no_ads" in PITCH_MAP


def test_scraper_defaults():
    from config import SCRAPER_DEFAULTS
    assert SCRAPER_DEFAULTS["min_reviews"] == 100
    assert SCRAPER_DEFAULTS["rate_limit_min"] > 0
    assert SCRAPER_DEFAULTS["rate_limit_max"] > SCRAPER_DEFAULTS["rate_limit_min"]
