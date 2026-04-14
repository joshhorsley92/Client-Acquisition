/**
 * Fit Score engine — computes a 0-100 qualification score for a deal
 * based on ICP match, readiness signals, and engagement.
 *
 * Config source of truth: server/config/icp.json (read fresh on each call —
 * Joe edits live, no caching).
 */

const path = require('path');

const ICP_CONFIG_PATH = path.join(__dirname, '..', 'config', 'icp.json');

// US states + DC (49 + DC — we treat MI specially, so "other US" = remaining 49 + DC).
const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC',
]);

const US_STATE_NAMES = new Set([
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado',
  'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho',
  'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine',
  'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi',
  'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey',
  'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio',
  'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina',
  'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia',
  'washington', 'west virginia', 'wisconsin', 'wyoming', 'district of columbia',
]);

function loadIcp() {
  // Force fresh read — Joe edits live and expects effect immediately.
  delete require.cache[require.resolve(ICP_CONFIG_PATH)];
  return require(ICP_CONFIG_PATH);
}

function lc(s) {
  return (s == null ? '' : String(s)).toLowerCase();
}

function containsAny(haystack, needles) {
  const h = lc(haystack);
  if (!h) return false;
  for (const n of needles) {
    if (n && h.indexOf(lc(n)) !== -1) return true;
  }
  return false;
}

/**
 * Attempt to extract a USD revenue figure from free text.
 * Handles: "$5M", "5 million", "$500,000", "$1.2m", "2.5MM".
 * Returns a number (USD) or null.
 */
function parseRevenueFromText(text) {
  if (!text) return null;
  const s = String(text).toLowerCase();

  // $XM / $X.Ym / $X MM — million notation
  const mMatch = s.match(/\$?\s*(\d+(?:\.\d+)?)\s*(?:mm|m\b|million)/);
  if (mMatch) return parseFloat(mMatch[1]) * 1_000_000;

  // $X billion — clamp to a big number
  const bMatch = s.match(/\$?\s*(\d+(?:\.\d+)?)\s*(?:b\b|billion)/);
  if (bMatch) return parseFloat(bMatch[1]) * 1_000_000_000;

  // $X K / X,000 / plain "$500,000"
  const kMatch = s.match(/\$?\s*(\d+(?:\.\d+)?)\s*(?:k\b|thousand)/);
  if (kMatch) return parseFloat(kMatch[1]) * 1_000;

  const dollarMatch = s.match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (dollarMatch) {
    const n = parseFloat(dollarMatch[1].replace(/,/g, ''));
    if (!isNaN(n) && n > 0) return n;
  }

  return null;
}

function resolveRevenueUsd(company) {
  if (!company) return null;
  // Prefer explicit numeric field if it exists
  if (company.annual_revenue_usd != null && !isNaN(Number(company.annual_revenue_usd))) {
    const n = Number(company.annual_revenue_usd);
    if (n > 0) return n;
  }
  // revenue_estimate is TEXT in our schema — parse it
  if (company.revenue_estimate) {
    const parsed = parseRevenueFromText(company.revenue_estimate);
    if (parsed != null) return parsed;
  }
  // Description / notes fallback
  if (company.description) {
    const parsed = parseRevenueFromText(company.description);
    if (parsed != null) return parsed;
  }
  if (company.notes) {
    const parsed = parseRevenueFromText(company.notes);
    if (parsed != null) return parsed;
  }
  return null;
}

function scoreIndustryMatch(company, icp, maxPoints, flags) {
  const haystack = [company && company.industry, company && company.description, company && company.notes]
    .filter(Boolean).join(' ');
  if (!haystack) return Math.round(maxPoints * 7 / 15); // ~7 default "unknown"

  const excluded = (icp.target_industries && icp.target_industries.excluded) || [];
  for (const kw of excluded) {
    if (kw && lc(haystack).indexOf(lc(kw)) !== -1) {
      flags.red.push('industry_excluded');
      return 0;
    }
  }

  const included = (icp.target_industries && icp.target_industries.included) || [];
  for (const kw of included) {
    if (kw && lc(haystack).indexOf(lc(kw)) !== -1) {
      return maxPoints;
    }
  }

  // Neither matched — treat as partial/unknown
  return Math.round(maxPoints * 7 / 15);
}

function scoreRevenueInRange(company, icp, maxPoints) {
  const range = icp.revenue_range || {};
  const min = Number(range.min_usd) || 0;
  const max = Number(range.max_usd) || Infinity;

  const revenue = resolveRevenueUsd(company);
  if (revenue == null) {
    // No data — neutral half-credit (spec: default 5 when maxPoints is 10)
    return Math.round(maxPoints / 2);
  }

  if (revenue >= min && revenue <= max) return maxPoints;

  const lowerBand = min * 0.75;
  const upperBand = max * 1.25;
  if (revenue >= lowerBand && revenue <= upperBand) {
    return Math.round(maxPoints / 2);
  }
  return 0;
}

function scoreGeographicFit(company, icp, maxPoints) {
  const geo = icp.geographic_preference || {};
  const locSource = [company && company.location, company && company.state]
    .filter(Boolean).join(' ');
  if (!locSource) return 0;

  const lcLoc = lc(locSource);

  // Michigan detection: "Michigan" or standalone "MI" token
  if (lcLoc.indexOf('michigan') !== -1) return maxPoints;
  if (/\b(mi)\b/i.test(locSource)) return maxPoints;

  // Other US state?
  let matchedUsState = false;
  // name match
  for (const name of US_STATE_NAMES) {
    if (lcLoc.indexOf(name) !== -1) {
      matchedUsState = true;
      break;
    }
  }
  if (!matchedUsState) {
    // abbreviation match — tokenize by whitespace / comma / period
    const tokens = String(locSource).split(/[\s,\.]+/).map(t => t.trim().toUpperCase());
    for (const t of tokens) {
      if (t.length === 2 && US_STATES.has(t)) { matchedUsState = true; break; }
    }
  }

  if (matchedUsState) {
    return geo.national_ok ? Math.round(maxPoints * 3 / 5) : 0;
  }
  return 0;
}

/**
 * Marketing signals lookup:
 * We have a Python-side `acq_marketing_signals` table bridged via `acq_leads`,
 * joined to Node `companies` by name. If the tables don't exist in this DB,
 * or no match is found, return null (caller applies neutral default).
 */
function lookupMarketingSignals(db, company) {
  if (!company || !company.name) return null;
  try {
    // Detect presence of the acq_* tables in this DB
    const tbls = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('acq_marketing_signals', 'acq_leads')"
    ).all();
    const names = new Set(tbls.map(t => t.name));
    if (!names.has('acq_marketing_signals')) return null;

    if (names.has('acq_leads')) {
      // Join through acq_leads.company_name (or similar) if column exists
      try {
        const row = db.prepare(`
          SELECT ms.* FROM acq_marketing_signals ms
          JOIN acq_leads al ON ms.lead_id = al.id
          WHERE LOWER(al.company_name) = LOWER(?)
          ORDER BY ms.id DESC LIMIT 1
        `).get(company.name);
        if (row) return row;
      } catch (e) { /* schema mismatch — fall through */ }
    }

    // Fallback: try company_name directly on signals table
    try {
      const row = db.prepare(`
        SELECT * FROM acq_marketing_signals
        WHERE LOWER(company_name) = LOWER(?)
        ORDER BY id DESC LIMIT 1
      `).get(company.name);
      if (row) return row;
    } catch (e) { /* no such column — ignore */ }
  } catch (e) {
    // Any unexpected error — treat as no signals
  }
  return null;
}

function scoreGreenFlags(icp, company, signals, dealTextBlob, cap, flags) {
  let total = 0;
  const greenFlags = icp.green_flags || [];

  for (const f of greenFlags) {
    const id = f.id;
    const weight = Number(f.weight) || 0;
    let matched = false;

    if (id === 'product_with_weak_marketing') {
      const hasIndustry = company && company.industry;
      const quality = signals && signals.website_quality;
      if (hasIndustry && (quality == null || quality === 'basic')) {
        matched = true;
      }
    } else if (id === 'scaling_beyond_local') {
      if (containsAny(dealTextBlob, ['scale', 'expand', 'grow'])) {
        matched = true;
      }
    } else if (id === 'needs_basic_assets') {
      if (signals) {
        if (Number(signals.has_website) === 0 || Number(signals.has_social_media) === 0) {
          matched = true;
        }
      }
    }

    if (matched) {
      total += weight;
      flags.green.push(id);
    }
  }

  return Math.min(cap, total);
}

function scoreRedFlags(icp, dealTextBlob, cap, flags) {
  // cap is negative (e.g. -15) — sum matched weights and floor at cap
  let total = 0;
  const redFlags = icp.red_flags || [];

  for (const f of redFlags) {
    const id = f.id;
    const weight = Number(f.weight) || 0;
    let matched = false;

    if (id === 'unclear_everything_cheap') {
      const cheapHit = containsAny(dealTextBlob, [
        'cheapest', 'cheap', 'lowest price', 'can you do it for',
      ]);
      const everythingHit = containsAny(dealTextBlob, ['everything', 'whole', 'full']);
      if (cheapHit && everythingHit) matched = true;
    }

    if (matched) {
      total += weight;
      flags.red.push(id);
    }
  }

  // cap is negative; floor means "don't go more negative than cap"
  if (total < cap) total = cap;
  if (total > 0) total = 0; // safety — red flags should never be positive
  return total;
}

function scoreReadiness(signals, maxPoints) {
  if (!signals) {
    return {
      score: Math.round(maxPoints / 2), // neutral default 15/30
      details: { note: 'no marketing signals data' },
    };
  }

  const details = {};
  let raw = 0;

  if (Number(signals.has_website) === 0) {
    details.no_website = 10;
    raw += 10;
  }
  if (Number(signals.has_social_media) === 0) {
    details.no_social = 8;
    raw += 8;
  }
  if (signals.website_quality === 'basic') {
    details.weak_quality = 6;
    raw += 6;
  }
  if (Number(signals.has_website) === 1 && Number(signals.has_seo) === 0) {
    details.no_seo = 4;
    raw += 4;
  }
  if (Number(signals.has_paid_ads) === 0) {
    details.no_paid_ads = 2;
    raw += 2;
  }

  const capped = Math.min(maxPoints, raw);
  return { score: capped, details };
}

function scoreEngagement(db, dealId, maxPoints) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM activities WHERE deal_id = ?').get(dealId);
  const n = row ? Number(row.n) : 0;

  let score, bucket;
  if (n <= 2) { score = 0; bucket = '0-2'; }
  else if (n <= 5) { score = Math.round(maxPoints / 3); bucket = '3-5'; }
  else if (n <= 10) { score = Math.round(maxPoints * 2 / 3); bucket = '6-10'; }
  else { score = maxPoints; bucket = '11+'; }

  return { score, details: { activity_count: n, bucket } };
}

/**
 * Main entry point.
 * @param {import('better-sqlite3').Database} db
 * @param {number} dealId
 * @returns {{ score: number, breakdown: object, flags: { green: string[], red: string[] } }}
 */
function scoreDeal(db, dealId) {
  const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(dealId);
  if (!deal) throw new Error(`Deal ${dealId} not found`);

  const company = deal.company_id
    ? db.prepare('SELECT * FROM companies WHERE id = ?').get(deal.company_id)
    : null;

  const icp = loadIcp();
  const weights = icp.scoring_weights || { icp_match: 40, readiness_signals: 30, engagement: 30 };
  const icpBreakdownCfg = icp.icp_match_breakdown || {};

  const industryMax = icpBreakdownCfg.industry_match || 15;
  const revenueMax = icpBreakdownCfg.revenue_in_range || 10;
  const geoMax = icpBreakdownCfg.geographic_fit || 5;
  const greenCap = icpBreakdownCfg.green_flag_points_cap || 10;
  const redCap = icpBreakdownCfg.red_flag_penalty_cap || -15;

  const flags = { green: [], red: [] };

  // Blob of free-text for keyword-based signal detection
  const dealTextBlob = [
    deal.call_notes, deal.research_findings, deal.objections_noted,
    deal.pricing_notes, deal.source_detail, deal.notes,
    company && company.description, company && company.notes,
  ].filter(Boolean).join(' \n ');

  const industry_match = scoreIndustryMatch(company, icp, industryMax, flags);
  const revenue_in_range = scoreRevenueInRange(company, icp, revenueMax);
  const geographic_fit = scoreGeographicFit(company, icp, geoMax);

  const signals = lookupMarketingSignals(db, company);

  const green_flag_bonus = scoreGreenFlags(icp, company, signals, dealTextBlob, greenCap, flags);
  const red_flag_penalty = scoreRedFlags(icp, dealTextBlob, redCap, flags);

  const icpRaw = industry_match + revenue_in_range + geographic_fit + green_flag_bonus + red_flag_penalty;
  const icpScore = Math.max(0, icpRaw);

  const readiness = scoreReadiness(signals, weights.readiness_signals || 30);
  const engagement = scoreEngagement(db, dealId, weights.engagement || 30);

  const breakdown = {
    icp_match: {
      score: icpScore,
      max: weights.icp_match || 40,
      details: {
        industry_match,
        revenue_in_range,
        geographic_fit,
        green_flag_bonus,
        red_flag_penalty,
      },
    },
    readiness_signals: {
      score: readiness.score,
      max: weights.readiness_signals || 30,
      details: readiness.details,
    },
    engagement: {
      score: engagement.score,
      max: weights.engagement || 30,
      details: engagement.details,
    },
  };

  let total = icpScore + readiness.score + engagement.score;
  total = Math.round(total);
  if (total < 0) total = 0;
  if (total > 100) total = 100;

  // Persist (compute-once-cache pattern)
  try {
    db.prepare('UPDATE deals SET fit_score = ?, fit_score_breakdown = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(total, JSON.stringify({ breakdown, flags }), dealId);
  } catch (e) {
    // If schema is out of date in an unexpected env, don't block the score.
  }

  return { score: total, breakdown, flags };
}

module.exports = { scoreDeal, parseRevenueFromText, loadIcp };
