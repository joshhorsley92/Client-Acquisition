from urllib.parse import urlencode
import qrcode
from PIL import Image


class QRGenerator:
    def __init__(self, base_url: str):
        self.base_url = base_url

    def generate_utm_url(self, lead_id: str, source: str = "mailer") -> str:
        params = urlencode({
            "utm_source": source,
            "utm_medium": "direct" if source == "mailer" else "email",
            "utm_campaign": "acq",
            "utm_content": lead_id,
        })
        return f"{self.base_url}?{params}"

    def generate_qr_image(self, url: str) -> Image.Image:
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=4,
        )
        qr.add_data(url)
        qr.make(fit=True)
        return qr.make_image(fill_color="black", back_color="white").convert("RGB")
