from PIL import Image
from outreach.qr_generator import QRGenerator


def test_generate_utm_url_mailer():
    gen = QRGenerator(base_url="https://turnkey.com/start")
    url = gen.generate_utm_url("lead-uuid-123", source="mailer")
    assert "utm_source=mailer" in url
    assert "utm_campaign=acq" in url
    assert "utm_content=lead-uuid-123" in url
    assert url.startswith("https://turnkey.com/start")


def test_generate_utm_url_email():
    gen = QRGenerator(base_url="https://turnkey.com/start")
    url = gen.generate_utm_url("lead-uuid-123", source="email")
    assert "utm_source=email" in url


def test_generate_qr_image():
    gen = QRGenerator(base_url="https://turnkey.com/start")
    img = gen.generate_qr_image("https://turnkey.com/start?utm_source=mailer")
    assert isinstance(img, Image.Image)


def test_qr_dimensions():
    gen = QRGenerator(base_url="https://turnkey.com/start")
    img = gen.generate_qr_image("https://turnkey.com/start?test=1")
    width, height = img.size
    assert width >= 200
    assert height >= 200
