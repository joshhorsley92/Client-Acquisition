from config import PITCH_MAP


def generate_pitch_points(signals: dict) -> list[str]:
    pitches = []
    if not signals.get("has_website"):
        pitches.append(PITCH_MAP["no_website"])
    if not signals.get("has_social_media"):
        pitches.append(PITCH_MAP["no_social"])
    if signals.get("website_quality") in ("basic", "decent"):
        pitches.append(PITCH_MAP["basic_website"])
    if not signals.get("has_seo"):
        pitches.append(PITCH_MAP["no_seo"])
    if not signals.get("has_paid_ads"):
        pitches.append(PITCH_MAP["no_ads"])
    if not pitches:
        pitches.append(
            "You've built a strong digital presence — but even the best can be optimized. "
            "We help businesses like yours squeeze more revenue from what's already working."
        )
    return pitches
