from outreach.pitch import generate_pitch_points


def test_no_website_pitch():
    signals = {"has_website": False, "has_social_media": True, "website_quality": "none", "has_seo": False, "has_paid_ads": False}
    pitches = generate_pitch_points(signals)
    assert any("leaving money on the table" in p.lower() for p in pitches)


def test_no_social_pitch():
    signals = {"has_website": True, "has_social_media": False, "website_quality": "professional", "has_seo": True, "has_paid_ads": True}
    pitches = generate_pitch_points(signals)
    assert any("competitors" in p.lower() for p in pitches)


def test_basic_website_pitch():
    signals = {"has_website": True, "has_social_media": True, "website_quality": "basic", "has_seo": True, "has_paid_ads": True}
    pitches = generate_pitch_points(signals)
    assert any("doesn't match" in p.lower() for p in pitches)


def test_no_seo_pitch():
    signals = {"has_website": True, "has_social_media": True, "website_quality": "professional", "has_seo": False, "has_paid_ads": True}
    pitches = generate_pitch_points(signals)
    assert any("searching" in p.lower() for p in pitches)


def test_no_ads_pitch():
    signals = {"has_website": True, "has_social_media": True, "website_quality": "professional", "has_seo": True, "has_paid_ads": False}
    pitches = generate_pitch_points(signals)
    assert any("untapped demand" in p.lower() for p in pitches)


def test_multiple_signals_combine():
    signals = {"has_website": False, "has_social_media": False, "website_quality": "none", "has_seo": False, "has_paid_ads": False}
    pitches = generate_pitch_points(signals)
    assert len(pitches) >= 3


def test_strong_profile_minimal_pitch():
    signals = {"has_website": True, "has_social_media": True, "website_quality": "professional", "has_seo": True, "has_paid_ads": True}
    pitches = generate_pitch_points(signals)
    assert len(pitches) >= 1


def test_returns_list_of_strings():
    signals = {"has_website": True, "has_social_media": False, "website_quality": "basic", "has_seo": False, "has_paid_ads": False}
    pitches = generate_pitch_points(signals)
    assert isinstance(pitches, list)
    assert all(isinstance(p, str) for p in pitches)
