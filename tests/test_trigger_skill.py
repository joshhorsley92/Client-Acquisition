import pytest
from unittest.mock import patch, MagicMock
from database.crm_bridge import _is_cli_available, _interpolate_prompt


def test_is_cli_available_true():
    with patch('database.crm_bridge.subprocess.run') as mock_run:
        mock_run.return_value = MagicMock(returncode=0)
        assert _is_cli_available() is True


def test_is_cli_available_false_not_found():
    with patch('database.crm_bridge.subprocess.run', side_effect=FileNotFoundError):
        assert _is_cli_available() is False


def test_is_cli_available_false_nonzero():
    with patch('database.crm_bridge.subprocess.run') as mock_run:
        mock_run.return_value = MagicMock(returncode=1)
        assert _is_cli_available() is False


def test_interpolate_prompt_basic():
    template = "Build analysis for {company} in {location}"
    context = {"company": "Acme Corp", "location": "Detroit"}
    assert _interpolate_prompt(template, context) == "Build analysis for Acme Corp in Detroit"


def test_interpolate_prompt_missing_field_preserved():
    template = "Build for {company}, {unknown_field}"
    context = {"company": "Acme"}
    result = _interpolate_prompt(template, context)
    assert "Acme" in result
    assert "{unknown_field}" in result


def test_interpolate_prompt_empty_template():
    assert _interpolate_prompt("", {"company": "Acme"}) == ""
