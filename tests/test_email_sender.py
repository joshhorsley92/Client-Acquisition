import pytest
from unittest.mock import MagicMock, patch
from database.supabase_client import Database
from database.migrate import run_migration
from database.crm_bridge import CRM_TABLES_SQL
from outreach.email_sender import EmailSender


@pytest.fixture
def db():
    database = Database(":memory:")
    run_migration(database)
    for statement in CRM_TABLES_SQL.strip().split(";"):
        statement = statement.strip()
        if statement:
            database.conn.execute(statement + ";")
    database.conn.commit()
    # Create a deal for testing
    database.conn.execute("INSERT INTO companies (name) VALUES ('Test Co')")
    database.conn.execute(
        "INSERT INTO deals (company_id, stage, source) VALUES (1, 'lead', 'cold')"
    )
    database.conn.execute(
        "INSERT INTO contacts (name, email, company_id) VALUES ('Jane', 'jane@test.com', 1)"
    )
    database.conn.commit()
    yield database
    database.close()


def test_prepare_stores_in_email_messages(db):
    sender = EmailSender(db=db, config={})
    result = sender.prepare_email(
        deal_id=1, contact_id=1, to_email="jane@test.com",
        subject="Test Subject", body_html="<html><body>Hello</body></html>"
    )

    row = db.conn.execute("SELECT * FROM email_messages WHERE id = ?", (result["id"],)).fetchone()
    record = dict(row)
    assert record["direction"] == "outbound"
    assert record["sent_at"] is None
    assert record["tracking_pixel_id"] is not None
    assert record["to_email"] == "jane@test.com"


def test_prepare_creates_activity(db):
    sender = EmailSender(db=db, config={})
    sender.prepare_email(
        deal_id=1, contact_id=1, to_email="jane@test.com",
        subject="Test", body_html="<html><body>Hi</body></html>"
    )

    activities = db.conn.execute(
        "SELECT * FROM activities WHERE deal_id = 1 AND type = 'email'"
    ).fetchall()
    assert len(activities) == 1


def test_prepare_injects_tracking_pixel(db):
    sender = EmailSender(db=db, config={"tkbs_base_url": "https://turnkey.com"})
    result = sender.prepare_email(
        deal_id=1, contact_id=1, to_email="jane@test.com",
        subject="Test", body_html="<html><body>Hello</body></html>"
    )

    row = db.conn.execute("SELECT body_html FROM email_messages WHERE id = ?", (result["id"],)).fetchone()
    html = dict(row)["body_html"]
    assert "/api/email/track/" in html
    assert result["tracking_pixel_id"] in html


def test_can_send_false_no_creds():
    sender = EmailSender(db=MagicMock(), config={})
    assert sender.can_send() is False


def test_can_send_false_partial_creds():
    sender = EmailSender(db=MagicMock(), config={"gmail_sender": "a@b.com"})
    assert sender.can_send() is False


def test_can_send_true_with_creds():
    sender = EmailSender(db=MagicMock(), config={
        "gmail_sender": "sender@gmail.com",
        "gmail_app_password": "password123",
    })
    assert sender.can_send() is True


@patch("outreach.email_sender.smtplib.SMTP_SSL")
def test_send_mocked_smtp_success(mock_smtp_cls, db):
    mock_smtp = MagicMock()
    mock_smtp_cls.return_value.__enter__ = MagicMock(return_value=mock_smtp)
    mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)

    sender = EmailSender(db=db, config={
        "gmail_sender": "sender@gmail.com",
        "gmail_app_password": "password123",
    })
    result = sender.prepare_email(
        deal_id=1, contact_id=1, to_email="jane@test.com",
        subject="Test", body_html="<html><body>Hi</body></html>"
    )

    success = sender.send(result["id"])
    assert success is True

    row = db.conn.execute("SELECT sent_at FROM email_messages WHERE id = ?", (result["id"],)).fetchone()
    assert dict(row)["sent_at"] is not None


@patch("outreach.email_sender.smtplib.SMTP_SSL")
def test_send_failure_leaves_sent_at_null(mock_smtp_cls, db):
    mock_smtp_cls.side_effect = Exception("SMTP connection failed")

    sender = EmailSender(db=db, config={
        "gmail_sender": "sender@gmail.com",
        "gmail_app_password": "password123",
    })
    result = sender.prepare_email(
        deal_id=1, contact_id=1, to_email="jane@test.com",
        subject="Test", body_html="<html><body>Hi</body></html>"
    )

    success = sender.send(result["id"])
    assert success is False

    row = db.conn.execute("SELECT sent_at FROM email_messages WHERE id = ?", (result["id"],)).fetchone()
    assert dict(row)["sent_at"] is None
