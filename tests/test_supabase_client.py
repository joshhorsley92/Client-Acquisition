import pytest
from unittest.mock import MagicMock, patch, call


@pytest.fixture
def mock_supabase():
    with patch("database.supabase_client.create_client") as mock_create:
        mock_client = MagicMock()
        mock_create.return_value = mock_client
        yield mock_client


@pytest.fixture
def db(mock_supabase):
    from database.supabase_client import SupabaseDB
    return SupabaseDB("https://test.supabase.co", "test-key")


def test_get_client_returns_instance(db, mock_supabase):
    assert db.client is mock_supabase


def test_upsert_lead_new(db, mock_supabase):
    lead = {
        "business_name": "Test Shop",
        "platform_source": "etsy",
        "platform_url": "https://etsy.com/shop/test",
        "industry": "e-commerce",
        "review_count": 150,
        "status": "new",
    }
    mock_table = MagicMock()
    mock_supabase.table.return_value = mock_table
    mock_table.upsert.return_value = mock_table
    mock_table.execute.return_value = MagicMock(data=[lead])

    db.upsert_lead(lead)

    mock_supabase.table.assert_called_with("acq_leads")
    mock_table.upsert.assert_called_once()
    call_args = mock_table.upsert.call_args
    assert call_args[1].get("on_conflict") == "platform_source,platform_url"


def test_insert_contact(db, mock_supabase):
    contact = {
        "lead_id": "some-uuid",
        "name": "Jane Doe",
        "role": "Owner",
        "email": "jane@test.com",
        "source": "website",
    }
    mock_table = MagicMock()
    mock_supabase.table.return_value = mock_table
    mock_table.insert.return_value = mock_table
    mock_table.execute.return_value = MagicMock(data=[contact])

    db.insert_contact(contact)

    mock_supabase.table.assert_called_with("acq_lead_contacts")
    mock_table.insert.assert_called_once()


def test_insert_marketing_signals(db, mock_supabase):
    signals = {
        "lead_id": "some-uuid",
        "has_website": True,
        "has_social_media": False,
        "website_quality": "basic",
        "has_seo": False,
        "has_paid_ads": False,
    }
    mock_table = MagicMock()
    mock_supabase.table.return_value = mock_table
    mock_table.upsert.return_value = mock_table
    mock_table.execute.return_value = MagicMock(data=[signals])

    db.upsert_marketing_signals(signals)

    mock_supabase.table.assert_called_with("acq_marketing_signals")


def test_log_outreach(db, mock_supabase):
    log = {
        "lead_id": "some-uuid",
        "type": "mailer",
        "utm_code": "acq_123",
        "qr_url": "https://turnkey.com/start?utm_content=123",
    }
    mock_table = MagicMock()
    mock_supabase.table.return_value = mock_table
    mock_table.insert.return_value = mock_table
    mock_table.execute.return_value = MagicMock(data=[log])

    db.log_outreach(log)

    mock_supabase.table.assert_called_with("acq_outreach_log")
    mock_table.insert.assert_called_once()


def test_get_leads_by_status(db, mock_supabase):
    mock_table = MagicMock()
    mock_supabase.table.return_value = mock_table
    mock_table.select.return_value = mock_table
    mock_table.eq.return_value = mock_table
    mock_table.execute.return_value = MagicMock(data=[
        {"business_name": "Shop A", "status": "new"},
        {"business_name": "Shop B", "status": "new"},
    ])

    results = db.get_leads_by_status("new")

    assert len(results) == 2
    mock_table.eq.assert_called_with("status", "new")


def test_update_lead_status(db, mock_supabase):
    mock_table = MagicMock()
    mock_supabase.table.return_value = mock_table
    mock_table.update.return_value = mock_table
    mock_table.eq.return_value = mock_table
    mock_table.execute.return_value = MagicMock(data=[{}])

    db.update_lead_status("some-uuid", "enriched")

    mock_table.update.assert_called_once()
    update_data = mock_table.update.call_args[0][0]
    assert update_data["status"] == "enriched"
    assert "updated_at" in update_data


def test_get_lead_by_id(db, mock_supabase):
    mock_table = MagicMock()
    mock_supabase.table.return_value = mock_table
    mock_table.select.return_value = mock_table
    mock_table.eq.return_value = mock_table
    mock_table.single.return_value = mock_table
    mock_table.execute.return_value = MagicMock(data={"id": "some-uuid", "business_name": "Test"})

    result = db.get_lead_by_id("some-uuid")

    assert result["business_name"] == "Test"


def test_get_signals_for_lead(db, mock_supabase):
    mock_table = MagicMock()
    mock_supabase.table.return_value = mock_table
    mock_table.select.return_value = mock_table
    mock_table.eq.return_value = mock_table
    mock_table.single.return_value = mock_table
    mock_table.execute.return_value = MagicMock(data={"has_website": False})

    result = db.get_signals_for_lead("some-uuid")

    mock_supabase.table.assert_called_with("acq_marketing_signals")
    assert result["has_website"] is False


def test_get_contacts_for_lead(db, mock_supabase):
    mock_table = MagicMock()
    mock_supabase.table.return_value = mock_table
    mock_table.select.return_value = mock_table
    mock_table.eq.return_value = mock_table
    mock_table.execute.return_value = MagicMock(data=[
        {"name": "Jane", "email": "jane@test.com"}
    ])

    result = db.get_contacts_for_lead("some-uuid")

    assert len(result) == 1


def test_get_stats(db, mock_supabase):
    mock_table = MagicMock()
    mock_supabase.table.return_value = mock_table
    mock_table.select.return_value = mock_table
    mock_table.execute.return_value = MagicMock(data=[
        {"status": "new"}, {"status": "new"}, {"status": "enriched"}
    ])

    stats = db.get_stats()

    assert stats["new"] == 2
    assert stats["enriched"] == 1


def test_no_delete_methods_exist(db):
    """Verify the DB wrapper never exposes a delete method."""
    public_methods = [m for m in dir(db) if not m.startswith("_")]
    for method in public_methods:
        assert "delete" not in method.lower()
