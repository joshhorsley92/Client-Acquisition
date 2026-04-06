# tests/test_browser.py
from unittest.mock import patch, MagicMock


def test_create_stealth_browser_sets_options():
    """Test that browser creation doesn't crash (mocked)."""
    with patch("scrapers.browser.webdriver.Chrome") as mock_chrome:
        mock_chrome.return_value = MagicMock()
        from scrapers.browser import create_stealth_browser
        driver = create_stealth_browser()
        assert mock_chrome.called


def test_fetch_with_browser_returns_html():
    """Test browser fetch returns page source."""
    with patch("scrapers.browser.create_stealth_browser") as mock_create:
        mock_driver = MagicMock()
        mock_driver.page_source = "<html><body>Test</body></html>"
        mock_create.return_value = mock_driver
        from scrapers.browser import fetch_with_browser
        html = fetch_with_browser("https://example.com", wait_seconds=0)
        assert html is not None
        assert "Test" in html


def test_fetch_with_browser_handles_failure():
    """Test browser fetch returns None on error."""
    with patch("scrapers.browser.create_stealth_browser") as mock_create:
        mock_create.side_effect = Exception("No Chrome")
        from scrapers.browser import fetch_with_browser
        html = fetch_with_browser("https://example.com")
        assert html is None
