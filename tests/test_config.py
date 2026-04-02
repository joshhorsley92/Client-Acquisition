import os
import pytest


def test_load_config_with_required_vars(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_KEY", "test-key")
    monkeypatch.setenv("TKBS_BASE_URL", "https://turnkey.com/start")

    from config import load_config
    cfg = load_config()

    assert cfg["supabase_url"] == "https://test.supabase.co"
    assert cfg["supabase_key"] == "test-key"
    assert cfg["tkbs_base_url"] == "https://turnkey.com/start"


def test_load_config_missing_required_var(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_KEY", raising=False)
    monkeypatch.delenv("TKBS_BASE_URL", raising=False)

    from config import load_config
    with pytest.raises(ValueError, match="SUPABASE_URL"):
        load_config()


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
