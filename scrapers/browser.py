# scrapers/browser.py
import logging
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

logger = logging.getLogger(__name__)


def create_stealth_browser(headless: bool = True) -> webdriver.Chrome:
    """Create a Chrome browser with anti-detection measures."""
    options = Options()
    if headless:
        options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--disable-extensions")
    options.add_argument("--disable-infobars")
    options.add_argument(
        "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)

    driver = webdriver.Chrome(options=options)

    # Remove webdriver flag
    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
        "source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
    })

    return driver


def fetch_with_browser(url: str, wait_seconds: int = 5) -> str | None:
    """Fetch a page using a new Selenium browser, return HTML or None on failure."""
    driver = None
    try:
        driver = create_stealth_browser()
        driver.get(url)
        time.sleep(wait_seconds)
        html = driver.page_source
        return html
    except Exception as e:
        logger.warning(f"Browser fetch failed for {url}: {e}")
        return None
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass


class BrowserSession:
    """Reusable browser session for scraping multiple pages efficiently."""

    def __init__(self, headless: bool = True):
        self.driver = create_stealth_browser(headless=headless)

    def fetch(self, url: str, wait_seconds: int = 5) -> str | None:
        """Fetch a page, return HTML or None on failure."""
        try:
            self.driver.get(url)
            time.sleep(wait_seconds)
            return self.driver.page_source
        except Exception as e:
            logger.warning(f"Browser fetch failed for {url}: {e}")
            # Try to recover by navigating to blank page
            try:
                self.driver.get("about:blank")
            except Exception:
                pass
            return None

    def close(self):
        """Close the browser."""
        try:
            self.driver.quit()
        except Exception:
            pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
