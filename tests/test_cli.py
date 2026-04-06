import pytest
from unittest.mock import MagicMock, patch
from click.testing import CliRunner

@pytest.fixture
def runner():
    return CliRunner()

@pytest.fixture
def mock_env(monkeypatch):
    monkeypatch.setenv("DB_PATH", ":memory:")
    monkeypatch.setenv("TKBS_BASE_URL", "https://turnkey.com/start")

@patch("main.Database")
@patch("main.EtsyScraper")
def test_scrape_etsy_command(mock_scraper_cls, mock_db_cls, runner, mock_env):
    mock_scraper = MagicMock()
    mock_scraper_cls.return_value = mock_scraper
    from main import cli
    result = runner.invoke(cli, ["scrape", "etsy"])
    assert result.exit_code == 0
    mock_scraper.scrape.assert_called_once()

@patch("main.Database")
@patch("main.KickstarterScraper")
def test_scrape_kickstarter_command(mock_scraper_cls, mock_db_cls, runner, mock_env):
    mock_scraper = MagicMock()
    mock_scraper_cls.return_value = mock_scraper
    from main import cli
    result = runner.invoke(cli, ["scrape", "kickstarter"])
    assert result.exit_code == 0
    mock_scraper.scrape.assert_called_once()

@patch("main.Database")
@patch("main.CountyRegistryScraper")
def test_scrape_county_command(mock_scraper_cls, mock_db_cls, runner, mock_env):
    mock_scraper = MagicMock()
    mock_scraper_cls.return_value = mock_scraper
    from main import cli
    result = runner.invoke(cli, ["scrape", "county"])
    assert result.exit_code == 0
    mock_scraper.scrape.assert_called_once()

@patch("main.Database")
@patch("main.EnrichmentPipeline")
def test_enrich_command(mock_pipeline_cls, mock_db_cls, runner, mock_env):
    mock_pipeline = MagicMock()
    mock_pipeline_cls.return_value = mock_pipeline
    from main import cli
    result = runner.invoke(cli, ["enrich"])
    assert result.exit_code == 0
    mock_pipeline.run.assert_called_once()

@patch("main.Database")
@patch("main.EnrichmentPipeline")
def test_enrich_with_lead_id(mock_pipeline_cls, mock_db_cls, runner, mock_env):
    mock_pipeline = MagicMock()
    mock_pipeline_cls.return_value = mock_pipeline
    from main import cli
    result = runner.invoke(cli, ["enrich", "--lead-id", "uuid-123"])
    assert result.exit_code == 0
    mock_pipeline.run_single.assert_called_with("uuid-123")

@patch("main.Database")
@patch("main.OutreachGenerator")
def test_generate_by_status(mock_gen_cls, mock_db_cls, runner, mock_env):
    mock_db = MagicMock()
    mock_db_cls.return_value = mock_db
    mock_db.get_leads_by_status.return_value = [{"id": "uuid-1"}, {"id": "uuid-2"}]
    mock_gen = MagicMock()
    mock_gen_cls.return_value = mock_gen
    mock_gen.generate_for_lead.return_value = {"mailer": "path.docx"}
    from main import cli
    result = runner.invoke(cli, ["generate", "--status", "enriched"])
    assert result.exit_code == 0
    assert mock_gen.generate_for_lead.call_count == 2

@patch("main.Database")
def test_stats_command(mock_db_cls, runner, mock_env):
    mock_db = MagicMock()
    mock_db_cls.return_value = mock_db
    mock_db.get_stats.return_value = {"new": 5, "enriched": 3, "contacted": 1}
    from main import cli
    result = runner.invoke(cli, ["stats"])
    assert result.exit_code == 0
    assert "new" in result.output
