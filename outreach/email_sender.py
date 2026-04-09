# outreach/email_sender.py
import uuid
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from database.crm_bridge import log_activity

logger = logging.getLogger(__name__)


class EmailSender:
    """Send and track outreach emails via the CRM's email_messages table."""

    def __init__(self, db, config: dict):
        self.db = db
        self.sender_email = config.get("gmail_sender", "")
        self.app_password = config.get("gmail_app_password", "")
        self.base_url = config.get("tkbs_base_url", "")

    def can_send(self) -> bool:
        """Check if Gmail credentials are configured."""
        return bool(self.sender_email and self.app_password)

    def prepare_email(self, deal_id: int, contact_id: int | None,
                      to_email: str, subject: str, body_html: str) -> dict:
        """Store email in CRM email_messages table with tracking pixel.

        Returns the email record dict including the generated id.
        """
        tracking_pixel_id = str(uuid.uuid4())

        # Inject tracking pixel before closing </body> tag
        pixel_img = f'<img src="{self.base_url}/api/email/track/{tracking_pixel_id}" width="1" height="1" style="display:none" />'
        if "</body>" in body_html:
            tracked_html = body_html.replace("</body>", f"{pixel_img}</body>")
        else:
            tracked_html = body_html + pixel_img

        cursor = self.db.conn.execute(
            """INSERT INTO email_messages
            (deal_id, contact_id, direction, subject, body_html, body_text,
             from_email, to_email, tracking_pixel_id)
            VALUES (?, ?, 'outbound', ?, ?, ?, ?, ?, ?)""",
            (deal_id, contact_id, subject, tracked_html, "",
             self.sender_email or "noreply@turnkeymarketing.com", to_email,
             tracking_pixel_id)
        )
        email_id = cursor.lastrowid

        # Log activity
        log_activity(self.db, deal_id, contact_id, "email",
                     f"Outreach email prepared: {subject}")

        self.db.conn.commit()

        return {
            "id": email_id,
            "deal_id": deal_id,
            "to_email": to_email,
            "subject": subject,
            "tracking_pixel_id": tracking_pixel_id,
            "sent": False,
        }

    def send(self, email_id: int) -> bool:
        """Send a prepared email via Gmail SMTP. Returns True on success."""
        if not self.can_send():
            logger.warning("Gmail credentials not configured, cannot send")
            return False

        row = self.db.conn.execute(
            "SELECT * FROM email_messages WHERE id = ?", (email_id,)
        ).fetchone()
        if not row:
            logger.error(f"Email {email_id} not found")
            return False

        record = dict(row)

        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = record.get("subject", "")
            msg["From"] = self.sender_email
            msg["To"] = record.get("to_email", "")

            html_part = MIMEText(record.get("body_html", ""), "html")
            msg.attach(html_part)

            with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
                server.login(self.sender_email, self.app_password)
                server.sendmail(self.sender_email, record["to_email"], msg.as_string())

            # Update sent_at
            self.db.conn.execute(
                "UPDATE email_messages SET sent_at = ? WHERE id = ?",
                (datetime.now().isoformat(), email_id)
            )
            self.db.conn.commit()
            logger.info(f"Email {email_id} sent to {record['to_email']}")
            return True

        except Exception as e:
            logger.error(f"Failed to send email {email_id}: {e}")
            return False

    def prepare_and_send(self, deal_id: int, contact_id: int | None,
                         to_email: str, subject: str, body_html: str) -> dict:
        """Prepare email and attempt to send if credentials available."""
        record = self.prepare_email(deal_id, contact_id, to_email, subject, body_html)
        if self.can_send():
            success = self.send(record["id"])
            record["sent"] = success
        return record
