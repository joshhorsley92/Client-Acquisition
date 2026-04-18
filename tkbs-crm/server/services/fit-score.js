/**
 * Fit Score engine — computes a 0-100 qualification score for a CLIENT
 * based on ICP match, readiness signals, and engagement.
 *
 * v2: scoreDeal → scoreClient. The score applies to the business relationship,
 * not a specific engagement. Config source of truth: server/config/icp.json
 * (read fresh on each call — Joe edits live, no caching).
 */

const path = require('path');

const ICP_CONFIG_PATH = path.join(__dirname, '..', 'config', 'icp.json');

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

function parseRevenueFromText(text) {
  if (!text) return null;
  const s = String(text).toLowerCase();

  const mMatch = s.match(/\$?\s*(\d+(?:\.\d+)?)\s*(?:mm|m\b|million)/);
  if (mMatch) return parseFloat(mMatch[1]) * 1_000_000;

  const bMatch = s.match(/\$?\s*(\d+(?:\.\d+)?)\s*(?:b\b|billion)/);
  if (bMatch) return parseFloat(bMatch[1]) * 1_000_000_000;

  const kMatch = s.match(/\$?\s*(\d+(?:\.\d+)?)\s*(?:k\b|thousand)/);
  if (kMatch) return parseFloat(kMatch[1]) * 1_000;

  const dollarMatch = s.match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (dollarMatch) {
    const n = parseFloat(dollarMatch[1].replace(/,/g, ''));
    if (!isNaN(n) && n > 0) return n;
  }

  return null;
}

function resolveRevenueUsd(client) {
  if (!client) return null;
  if (client.annual_revenue_usd != null && !isNaN(Number(client.annual_revenue_usd))) {
    const n = Number(client.annual_revenue_usd);
    if (n > 0) return n;
  }
  if (client.revenue_estimate) {
    const parsed = parseRevenueFromText(client.revenue_estimate);
    if (parsed != null) return parsed;
  }
  if (client.notes) {
    const parsed = parseRevenueFromText(client.notes);
    if (parsed != null) return parsed;
  }
  return null;
}

function scoreIndustryMatch(client, icp, maxPoints, flags) {
  const haystack = [client && client.industry, client && client.notes]
    .filter(Boolean).join(' ');
  if (!haystack) return Math.round(maxPoints * 7 / 15);

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

  return Math.round(maxPoints * 7 / 15);
}

function scoreRevenueInRange(client, icp, maxPoints) {
  const range = icp.revenue_range || {};
  const min = Number(range.min_usd) || 0;
  const max = Number(range.max_usd) || Infinity;

  const revenue = resolveRevenueUsd(client);
  if (revenue == null) return Math.round(maxPoints / 2);
  if (revenue >= min && revenue <= max) return maxPoints;

  const lowerBand = min * 0.75;
  const upperBand = max * 1.25;
  if (revenue >= lowerBand && revenue <= upperBand) {
    return Math.round(maxPoints / 2);
  }
  return 0;
}

function scoreGeographicFit(client, icp, maxPoints) {
  const geo = icp.geographic_preference || {};
  const locSource = client && client.location ? String(client.location) : '';
  if (!locSource) return 0;

  const lcLoc = lc(locSource);

  if (lcLoc.indexOf('michigan') !== -1) return maxPoints;
  if (/\b(mi)\b/i.test(locSource)) return maxPoints;

  let matchedUsState = false;
  for (const name of US_STATE_NAMES) {
    if (lcLoc.indexOf(name) !== -1) {
      matchedUsState = true;
      break;
    }
  }
  if (!matchedUsState) {
    const tokens = locSource.split(/[\s,\.]+/).map((t) => t.trim().toUpperCase());
    for (const t of tokens) {
      if (t.length === 2 && US_STATES.has(t)) { matchedUsState = true; break; }
    }
  }

  if (matchedUsState) {
    return geo.national_ok ? Math.round(maxPoints * 3 / 5) : 0;
  }
  return 0;
}

function lookupMarketingSignals(db, client) {
  if (!client || !client.name) return null;
  try {
    const tbls = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('acq_marketing_signals', 'acq_leads')"
    ).all();
    const names = new Set(tbls.map((t) => t.name));
    if (!names.has('acq_marketing_signals')) return null;

    if (names.has('acq_leads')) {
      try {
        const row = db.prepare(`
          SELECT ms.* FROM acq_marketing_signals ms
          JOIN acq_leads al ON ms.lead_id = al.id
          WHERE LOWER(al.company_name) = LOWER(?)
          ORDER BY ms.id DESC LIMIT 1
        `).get(client.name);
        if (row) return row;
      } catch (e) {}
    }

    try {
      const row = db.prepare(`
        SELECT * FROM acq_marketing_signals
        WHERE LOWER(company_name) = LOWER(?)
        ORDER BY id DESC LIMIT 1
      `).get(client.name);
      if (row) return row;
    } catch (e) {}
  } catch (e) {}
  return null;
}

function scoreGreenFlags(icp, client, signals, textBlob, cap, flags) {
  let total = 0;
  const greenFlags = icp.green_flags || [];

  for (const f of greenFlags) {
    const id = f.id;
    const weight = Number(f.weight) || 0;
    let matched = false;

    if (id === 'product_with_weak_marketing') {
      const hasIndustry = client && client.industry;
      const quality = signals && signals.website_quality;
      if (hasIndustry && (quality == null || quality === 'basic')) matched = true;
    } else if (id === 'scaling_beyond_local') {
      if (containsAny(textBlob, ['scale', 'expand', 'grow'])) matched = true;
    } else if (id === 'needs_basic_assets') {
      if (signals) {
        if (Number(signals.has_website) === 0 || Number(signals.has_social_media) === 0) matched = true;
      }
    }

    if (matched) {
      total += weight;
      flags.green.push(id);
    }
  }

  return Math.min(cap, total);
}

function scoreRedFlags(icp, textBlob, cap, flags) {
  let total = 0;
  const redFlags = icp.red_flags || [];

  for (const f of redFlags) {
    const id = f.id;
    const weight = Number(f.weight) || 0;
    let matched = false;

    if (id === 'unclear_everything_cheap') {
      const cheapHit = containsAny(textBlob, ['cheapest', 'cheap', 'lowest price', 'can you do it for']);
      const everythingHit = containsAny(textBlob, ['everything', 'whole', 'full']);
      if (cheapHit && everythingHit) matched = true;
    }

    if (matched) {
      total += weight;
      flags.red.push(id);
    }
  }

  if (total < cap) total = cap;
  if (total > 0) total = 0;
  return total;
}

function scoreReadiness(signals, maxPoints) {
  if (!signals) {
    return {
      score: Math.round(maxPoints / 2),
      details: { note: 'no marketing signals data' },
    };
  }

  const details = {};
  let raw = 0;

  if (Number(signals.has_website) === 0) { details.no_website = 10; raw += 10; }
  if (Number(signals.has_social_media) === 0) { details.no_social = 8; raw += 8; }
  if (signals.website_quality === 'basic') { details.weak_quality = 6; raw += 6; }
  if (Number(signals.has_website) === 1 && Number(signals.has_seo) === 0) { details.no_seo = 4; raw += 4; }
  if (Number(signals.has_paid_ads) === 0) { details.no_paid_ads = 2; raw += 2; }

  const capped = Math.min(maxPoints, raw);
  return { score: capped, details };
}

function scoreEngagement(db, clientId, maxPoints) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM activities WHERE client_id = ?').get(clientId);
  const n = row ? Number(row.n) : 0;

  let score, bucket;
  if (n <= 2) { score = 0; bucket = '0-2'; }
  else if (n <= 5) { score = Math.round(maxPoints / 3); bucket = '3-5'; }
  else if (n <= 10) { score = Math.round(maxPoints * 2 / 3); bucket = '6-10'; }
  else { score = maxPoints; bucket = '11+'; }

  return { score, details: { activity_count: n, bucket } };
}

function scoreClient(db, clientId) {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
  if (!client) throw new Error(`Client ${clientId} not found`);

  const icp = loadIcp();
  const weights = icp.scoring_weights || { icp_match: 40, readiness_signals: 30, engagement: 30 };
  const icpBreakdownCfg = icp.icp_match_breakdown || {};

  const industryMax = icpBreakdownCfg.industry_match || 15;
  const revenueMax = icpBreakdownCfg.revenue_in_range || 10;
  const geoMax = icpBreakdownCfg.geographic_fit || 5;
  const greenCap = icpBreakdownCfg.green_flag_points_cap || 10;
  const redCap = icpBreakdownCfg.red_flag_penalty_cap || -15;

  const flags = { green: [], red: [] };

  // Pull any engagement notes as signal for green/red flag keyword detection
  const engagementNotes = db.prepare(
    'SELECT notes, source_detail FROM engagements WHERE client_id = ?'
  ).all(clientId);
  const engagementBlob = engagementNotes
    .map((e) => [e.notes, e.source_detail].filter(Boolean).join(' '))
    .filter(Boolean).join(' \n ');

  const textBlob = [client.notes, engagementBlob].filter(Boolean).join(' \n ');

  const industry_match = scoreIndustryMatch(client, icp, industryMax, flags);
  const revenue_in_range = scoreRevenueInRange(client, icp, revenueMax);
  const geographic_fit = scoreGeographicFit(client, icp, geoMax);

  const signals = lookupMarketingSignals(db, client);

  const green_flag_bonus = scoreGreenFlags(icp, client, signals, textBlob, greenCap, flags);
  const red_flag_penalty = scoreRedFlags(icp, textBlob, redCap, flags);

  const icpRaw = industry_match + revenue_in_range + geographic_fit + green_flag_bonus + red_flag_penalty;
  const icpScore = Math.max(0, icpRaw);

  const readiness = scoreReadiness(signals, weights.readiness_signals || 30);
  const engagement = scoreEngagement(db, clientId, weights.engagement || 30);

  const breakdown = {
    icp_match: {
      score: icpScore,
      max: weights.icp_match || 40,
      details: { industry_match, revenue_in_range, geographic_fit, green_flag_bonus, red_flag_penalty },
    },
    readiness_signals: { score: readiness.score, max: weights.readiness_signals || 30, details: readiness.details },
    engagement: { score: engagement.score, max: weights.engagement || 30, details: engagement.details },
  };

  let total = icpScore + readiness.score + engagement.score;
  total = Math.round(total);
  if (total < 0) total = 0;
  if (total > 100) total = 100;

  try {
    db.prepare(
      "UPDATE clients SET fit_score = ?, fit_score_breakdown = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(total, JSON.stringify({ breakdown, flags }), clientId);
  } catch (e) { /* best-effort */ }

  return { score: total, breakdown, flags };
}

module.exports = { scoreClient, parseRevenueFromText, loadIcp };
