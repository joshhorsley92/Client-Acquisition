/**
 * Seed a fake "ideal client" deal using Wren & Ivy Boutique — a fictional
 * client pulled from TKBS role-play docs. Fleshes out every
 * section of the system so Joe can see what a close-to-ideal client looks
 * like end-to-end.
 *
 * Target Fit Score: ~80 (High fit).
 * Idempotent: clears existing Wren & Ivy rows before inserting.
 *
 * Usage: node scripts/seed-wren-ivy.js
 */

const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'tkbs-crm.db');
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

const COMPANY_NAME = 'Wren & Ivy Boutique';

// ============================================================================
// Ensure admin users exist — Josh + Joe — so both can log in on a fresh clone
// ============================================================================

function ensureAdmins() {
  const admins = [
    { name: 'Joe Zolinski',  email: 'joe@tkbsmarketing.com'  },
    { name: 'Josh Horsley',  email: 'josh@tkbsmarketing.com' },
  ];
  const devPassword = 'changeme';
  const hash = bcrypt.hashSync(devPassword, 10);

  let ownerId = null;
  for (const a of admins) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(a.email);
    if (existing) {
      if (!ownerId) ownerId = existing.id;
      continue;
    }
    const result = db.prepare(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
    ).run(a.name, a.email, hash, 'admin');
    if (!ownerId) ownerId = result.lastInsertRowid;
    console.log(`  created admin: ${a.email} (password: ${devPassword} — change on first login)`);
  }
  return ownerId || 1;
}

// ============================================================================
// Clean slate — delete any existing Wren & Ivy data so the script is idempotent
// ============================================================================

function wipeExisting() {
  const existing = db.prepare('SELECT id FROM companies WHERE name = ?').get(COMPANY_NAME);
  if (existing) {
    const companyId = existing.id;
    // Find deals to clean up related tables
    const deals = db.prepare('SELECT id FROM deals WHERE company_id = ?').all(companyId).map((r) => r.id);
    for (const dealId of deals) {
      db.prepare('DELETE FROM activities WHERE deal_id = ?').run(dealId);
      db.prepare('DELETE FROM tasks WHERE deal_id = ?').run(dealId);
      db.prepare('DELETE FROM call_recordings WHERE deal_id = ?').run(dealId);
      db.prepare('DELETE FROM deals WHERE id = ?').run(dealId);
    }
    db.prepare('DELETE FROM contacts WHERE company_id = ?').run(companyId);
    db.prepare('DELETE FROM companies WHERE id = ?').run(companyId);
    console.log(`  cleaned up existing Wren & Ivy data (company id ${companyId})`);
  }

  // Also clean acq_* rows if the tables exist
  try {
    const leads = db.prepare("SELECT id FROM acq_leads WHERE business_name = ?").all(COMPANY_NAME).map((r) => r.id);
    for (const lid of leads) {
      db.prepare('DELETE FROM acq_marketing_signals WHERE lead_id = ?').run(lid);
      db.prepare('DELETE FROM acq_lead_contacts WHERE lead_id = ?').run(lid);
      db.prepare('DELETE FROM acq_leads WHERE id = ?').run(lid);
    }
    if (leads.length) console.log(`  cleaned up ${leads.length} acq_* row(s)`);
  } catch (e) { /* tables may not exist — fine */ }
}

// ============================================================================
// Ensure acq_* tables exist — fit-score uses them for readiness signals
// ============================================================================

function ensureAcqTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS acq_leads (
      id TEXT PRIMARY KEY,
      business_name TEXT,
      platform_source TEXT,
      platform_url TEXT,
      industry TEXT,
      location TEXT,
      website_url TEXT,
      review_count INTEGER,
      status TEXT DEFAULT 'new',
      company_name TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS acq_lead_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT REFERENCES acq_leads(id) ON DELETE CASCADE,
      name TEXT,
      email TEXT,
      role TEXT,
      source TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS acq_marketing_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT REFERENCES acq_leads(id) ON DELETE CASCADE,
      has_website INTEGER,
      has_social_media INTEGER,
      social_platforms TEXT,
      website_quality TEXT,
      has_seo INTEGER,
      has_paid_ads INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

// ============================================================================
// Insert company, contact, deal
// ============================================================================

function seedCompanyContactDeal(ownerId) {
  // Company. Revenue $780K (in ICP range), industry includes "retail" (ICP match),
  // notes has "scale"/"grow" keywords (green flag), Charlotte NC (national_ok → 3/5).
  const companyInsert = db.prepare(`
    INSERT INTO companies (
      name, industry, location, website, employee_count, type,
      revenue_estimate, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
  const companyResult = companyInsert.run(
    COMPANY_NAME,
    'Women\'s Fashion Retail',
    'Charlotte, NC',
    'https://wrenandivyboutique.com',
    '1-5 employees',
    'B2C',
    '$780,000',
    'Curated women\'s fashion boutique in Charlotte\'s NoDa neighborhood. Second-generation family-owned, ~$780K annual retail revenue. Serving professional women 28-55 with elevated everyday pieces (not occasion wear). Philosophy: hand-picked, not algorithm-picked. Owner Megan Torres personally curates every piece. Looking to scale online presence and grow beyond walk-in traffic. Platform: Shopify. 2,800 Instagram followers. No email infrastructure. No paid ads experience beyond unsuccessful boosted posts.'
  );
  const companyId = companyResult.lastInsertRowid;
  console.log(`  company: Wren & Ivy Boutique (id=${companyId})`);

  // Contact: Megan Torres (owner)
  const contactResult = db.prepare(`
    INSERT INTO contacts (company_id, name, email, phone, role, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    companyId,
    'Megan Torres',
    'megan@wrenandivyboutique.com',
    '(704) 555-0182',
    'Owner',
    'Engaged owner, spends time thinking about her customers. Prepared for calls, pushes back constructively. Needs structure/guidance but open to learning. Operates solo at the shop.'
  );
  const contactId = contactResult.lastInsertRowid;
  console.log(`  contact: Megan Torres (id=${contactId})`);

  // Deal — Discovery Call stage with full details
  const dealResult = db.prepare(`
    INSERT INTO deals (
      contact_id, company_id, stage, source, source_detail,
      estimated_value, package_type, services_discussed,
      pricing_notes, call_notes, research_findings, owner_id,
      stage_entered_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-5 days'), datetime('now', '-12 days'), datetime('now'))
  `).run(
    contactId,
    companyId,
    'discovery_call',
    'referral',
    'Referred by existing client (Charlotte lifestyle blogger)',
    4500,
    'launch',
    JSON.stringify(['landing_page', 'email_sequence', 'meta_ads', 'lead_magnet']),
    'Quoted Launch plan at $3,000 + $1,500 for first 90 days of managed ad spend setup. Megan budgeted $900/month for ads ($30/day).',
    `30-minute discovery call on day-8. Second-generation owner, shop is 4 years old, doing ~$780K/yr in-store. She wants to scale online — targeting $3K/month online revenue in 90 days, $10K/month as long-term goal. No email list (has 4K emails sitting in Gmail), no paid ads experience beyond failed boosted posts. Shopify site is template-default, minimal SEO. Wants lead magnet + welcome sequence + Meta ads. Two customer avatars: Styled Sarah (28-42) and Elevated Evelyn (42-55). Strong brand clarity — knows her tone, messaging do's/don'ts, aspirational competitors. Budget-conscious ($30/day for ads is modest but deliberate). Concerned about customer service capacity if traffic spikes.`,
    'Website: basic Shopify template, functional but uncurated. Social: Instagram 2.8K followers (active), Facebook dormant, no TikTok/Pinterest. SEO: no meta descriptions, no blog, no schema markup. Ads: no live campaigns; previously burned ~$2K on boosted posts with zero tracking. In-store reputation is excellent (4.9 stars, 210+ Google reviews). Aspirational competitors: Anthropologie, Madewell, Free People.',
    ownerId
  );
  const dealId = dealResult.lastInsertRowid;
  console.log(`  deal: #${dealId} (stage=discovery_call, $4,500)`);

  return { companyId, contactId, dealId };
}

// ============================================================================
// Activities — 11+ to hit max engagement (30/30 pts)
// ============================================================================

function seedActivities(dealId, contactId, ownerId) {
  const activities = [
    { type: 'system',  content: 'Deal created from inbound referral', days_ago: 12 },
    { type: 'email',   content: 'Sent intro email — 15-min discovery call request', days_ago: 11 },
    { type: 'email',   content: 'Megan replied — interested, sent availability', days_ago: 10 },
    { type: 'meeting', content: 'Discovery call scheduled for day-8', days_ago: 10 },
    { type: 'call',    content: 'Discovery call completed (30 min). Took detailed notes on avatars, budget, goals.', days_ago: 8 },
    { type: 'email',   content: 'Sent follow-up — Launch plan overview + case study (boutique $2K→$10K online)', days_ago: 7 },
    { type: 'email',   content: 'Megan replied — clarifying questions about ad spend trajectory', days_ago: 6 },
    { type: 'email',   content: 'Replied with month-by-month spend breakdown + success metrics', days_ago: 6 },
    { type: 'note',    content: 'Research: reviewed her Shopify site, Instagram engagement, Google reviews. Strong in-person rep.', days_ago: 5 },
    { type: 'meeting', content: 'Proposal walkthrough scheduled for day-2', days_ago: 4 },
    { type: 'call',    content: 'Proposal walkthrough (45 min) — Megan wants to move forward. Ready to sign.', days_ago: 2 },
    { type: 'note',    content: 'Brand Profile extracted from discovery call transcript — 100% complete, ready to feed the Automations flow for proposal generation.', days_ago: 1 },
  ];

  const insert = db.prepare(`
    INSERT INTO activities (deal_id, contact_id, type, content, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', ?))
  `);

  for (const a of activities) {
    insert.run(dealId, contactId, a.type, a.content, ownerId, `-${a.days_ago} days`);
  }

  console.log(`  ${activities.length} activities created (engagement: 11+ bucket)`);
}

// ============================================================================
// acq_* rows — needed so fit-score finds marketing signals
// ============================================================================

function seedAcqSignals() {
  const leadId = 'seed-wren-ivy-001';

  db.prepare(`
    INSERT INTO acq_leads (
      id, business_name, company_name, platform_source, platform_url,
      industry, location, website_url, review_count, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    leadId, COMPANY_NAME, COMPANY_NAME, 'referral', null,
    "Women's Fashion Retail", 'Charlotte, NC', 'https://wrenandivyboutique.com',
    210, 'enriched'
  );

  db.prepare(`
    INSERT INTO acq_marketing_signals (
      lead_id, has_website, has_social_media, social_platforms,
      website_quality, has_seo, has_paid_ads
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    leadId, 1, 1, JSON.stringify(['instagram', 'facebook']),
    'basic', 0, 0
  );

  console.log('  acq_marketing_signals seeded (website=basic, no SEO, no paid ads)');
}

// ============================================================================
// Call recording with transcript + extracted & approved Brand Profile
// ============================================================================

const DISCOVERY_TRANSCRIPT = `Josh: Thanks for jumping on, Megan. Before we dive in — tell me about Wren & Ivy.

Megan: Yeah, so we're a women's boutique in Charlotte, specifically in the NoDa neighborhood. I opened four years ago. It started really small — I was buying pieces I loved and selling them out of a friend's pop-up — and it turned into a real store. We do curated modern women's fashion and accessories, mostly for everyday wear. Not occasion stuff, not prom dresses. Real-life pieces.

Josh: What kind of customer comes in the door?

Megan: Honestly two types. There's what I call my Styled Sarah — she's late twenties to early forties, works a professional job, makes seventy-five plus, and she's tired of wearing the same thing as everyone at the grocery store. She's overwhelmed by online shopping. She doesn't want to spend an hour getting dressed in the morning. She wants pieces that just work. Then there's my Elevated Evelyn, and she's older, maybe forty-two to fifty-five, more disposable income, more loyal once you win her. She shops for herself and for gifts for her daughters. She's my best spender, honestly.

Josh: What are they frustrated by?

Megan: Big-box uniformity. The Targets, the Old Navys — everybody in the city is wearing the same thing. They also don't trust big online retailers because they can't try stuff on, and they've been burned by cheap pieces that fall apart. The third thing — and this one took me a while to see — is confidence. They come in and say "I don't know if I can pull this off" or "I'm not sure if this is really my style." They want someone to guide them.

Josh: What do they want instead?

Megan: Someone to do the hunting for them. That's the whole premise of Wren & Ivy. Hand-picked, not algorithm-picked. I'm in the store. I know them. I know what they bought last time.

Josh: What's the brand supposed to feel like?

Megan: Warm, confident, knowing. Like the friend who has amazing style and tells you where she got everything — and doesn't make you feel bad for not already knowing. I hate — hate — brands that talk at you. "SHOP NOW! ONLY THREE LEFT!" That's not us.

Josh: So what does that translate to in writing?

Megan: Short sentences. Curated but not pretentious — we'd say "hand-picked" before "curated" any day of the week. We use "you." We avoid girl-boss hustle language. We never do urgency or scarcity. No "limited time offer." That cheapens it. If I have to guilt you into buying, I've already failed.

Josh: Tagline?

Megan: "Curated for women who know what they love." It's on our signage, our bags, our emails when I send them — which I barely do, which is part of why I'm here.

Josh: Colors? Fonts? Visual direction?

Megan: I'd call it warm neutrals and natural tones. Our store walls are warm cream, and we have a deep sage accent — it's like a muted green, kind of like a twenty-D-three-six or something close. Sometimes a rust-terracotta accent. Fonts — my signage uses Lora for headers, and we use Inter for everything else. Editorial and warm, not minimalist-cold.

Josh: What are you hoping TKBS does for you?

Megan: Honestly, everything I can't do. I need a lead magnet — we've talked about a seasonal capsule wardrobe checklist, spring-summer first. I need an email welcome sequence — I have four thousand emails from in-store purchases sitting in Gmail and doing nothing. I need Meta ads that don't waste my money. My goal is three thousand dollars a month online by the end of ninety days, and ten thousand a month eventually. That's the vision. I'm ready to invest if the plan makes sense.

Josh: Got it. I'll put together the Launch plan for you this week.

Megan: Thanks, Josh. I really needed someone who actually gets this stuff.`;

const BRAND_PROFILE = {
  business_name: 'Wren & Ivy Boutique',
  industry: "Women's Fashion & Accessories — Boutique Retail",
  business_description: "Curated women's fashion boutique in Charlotte's NoDa neighborhood. Hand-picked elevated everyday pieces for professional women. Owner-operated by Megan Torres since 2022.",
  website_url: 'https://wrenandivyboutique.com',
  phone: '(704) 555-0182',
  location_city: 'Charlotte',
  location_state: 'NC',
  years_in_business: 4,
  revenue_streams: 'Primary: in-store retail (~$780K/yr). Secondary: growing Shopify online store (target $3K/month within 90 days, $10K/month long-term).',
  customer_avatar: {
    name: 'Styled Sarah',
    age_range: '28-42',
    gender: 'female',
    occupation: 'Working professional, $75K+ household income',
    pain_points: [
      'Big-box stores where everyone wears the same thing',
      'Overwhelmed by online shopping',
      "Doesn't have time to put together outfits",
      "Lacks confidence — 'I'm not sure if this is really my style'",
      'Burned by cheap pieces that fall apart',
    ],
    goals: [
      'Look put-together without extensive effort',
      'Find unique pieces that reflect personal taste',
      'Build a versatile wardrobe of quality items',
      'Shop from someone who understands her aesthetic',
    ],
    objections: [
      'Fear of wasting money on pieces they won\'t wear',
      'Skeptical of online-only shopping without trying items on',
    ],
    where_online: ['Instagram', 'Pinterest', 'Local Charlotte lifestyle accounts', 'Kinfolk / Cup of Jo / Magnolia'],
  },
  brand_personality: {
    traits: ['curated', 'warm', 'confident', 'knowing', 'approachable'],
    mood: 'welcoming and editorial — like a trusted friend with great taste',
    formality_level: 'neutral',
    keywords: ['hand-picked', 'elevated everyday', 'quality over quantity', 'local', 'personal'],
  },
  visual_identity: {
    primary_color: '#2D3A36',
    secondary_color: '#F5EFE0',
    accent_color: '#B5623A',
    neutral_color: '#E8E1D4',
    heading_font: 'Lora',
    body_font: 'Inter',
    style_keywords: ['editorial', 'warm', 'natural', 'uncluttered', 'modern but timeless'],
  },
  brand_voice: {
    tone: ['warm', 'confident', 'knowing', 'conversational'],
    dos: [
      'Sound like a knowledgeable friend',
      "Use 'you' frequently",
      'Short, specific sentences',
      'Reference real-life wear scenarios (coffee, dinner, weekends)',
      'Acknowledge customer\'s good taste',
    ],
    donts: [
      'Urgency or scarcity tactics ("Only 3 left!")',
      'Girl-boss or hustle language',
      'Generic fashion phrases ("ultimate experience")',
      'Overuse of emojis or exclamation points',
      'Compete on price',
    ],
    sample_phrases: [
      'Hand-picked, not algorithm-picked',
      'Elevated everyday',
      'For women who already have taste',
      'Someone to do the hunting for you',
    ],
    tagline: 'Curated for women who know what they love.',
  },
};

const SIDECAR = {
  business_name: { confidence: 1.0, source_quote: "we're a women's boutique in Charlotte, specifically in the NoDa neighborhood" },
  industry: { confidence: 0.95, source_quote: 'curated modern women\'s fashion and accessories, mostly for everyday wear' },
  business_description: { confidence: 0.9, source_quote: 'I opened four years ago … curated modern women\'s fashion and accessories, mostly for everyday wear' },
  website_url: { confidence: 0.5, source_quote: null },
  phone: { confidence: 0.5, source_quote: null },
  location_city: { confidence: 1.0, source_quote: "we're a women's boutique in Charlotte" },
  location_state: { confidence: 0.95, source_quote: 'Charlotte' },
  years_in_business: { confidence: 1.0, source_quote: 'I opened four years ago' },
  revenue_streams: { confidence: 0.85, source_quote: 'My goal is three thousand dollars a month online by the end of ninety days, and ten thousand a month eventually' },
  'customer_avatar.name': { confidence: 1.0, source_quote: "what I call my Styled Sarah" },
  'customer_avatar.age_range': { confidence: 0.95, source_quote: "she's late twenties to early forties" },
  'customer_avatar.gender': { confidence: 0.95, source_quote: "women's boutique" },
  'customer_avatar.occupation': { confidence: 0.9, source_quote: "works a professional job, makes seventy-five plus" },
  'customer_avatar.pain_points': { confidence: 0.95, source_quote: "Big-box uniformity … they've been burned by cheap pieces that fall apart … confidence" },
  'customer_avatar.goals': { confidence: 0.9, source_quote: "Someone to do the hunting for them" },
  'customer_avatar.where_online': { confidence: 0.75, source_quote: null },
  'brand_personality.traits': { confidence: 0.95, source_quote: 'Warm, confident, knowing' },
  'brand_personality.mood': { confidence: 0.9, source_quote: 'Like the friend who has amazing style and tells you where she got everything' },
  'brand_personality.formality_level': { confidence: 0.85, source_quote: null },
  'brand_personality.keywords': { confidence: 0.9, source_quote: 'Hand-picked, not algorithm-picked' },
  'visual_identity.primary_color': { confidence: 0.8, source_quote: "deep sage accent — it's like a muted green, kind of like a twenty-D-three-six" },
  'visual_identity.secondary_color': { confidence: 0.85, source_quote: 'Our store walls are warm cream' },
  'visual_identity.accent_color': { confidence: 0.85, source_quote: 'Sometimes a rust-terracotta accent' },
  'visual_identity.heading_font': { confidence: 1.0, source_quote: 'my signage uses Lora for headers' },
  'visual_identity.body_font': { confidence: 1.0, source_quote: 'we use Inter for everything else' },
  'visual_identity.style_keywords': { confidence: 0.85, source_quote: 'Editorial and warm, not minimalist-cold' },
  'brand_voice.tone': { confidence: 0.95, source_quote: 'Warm, confident, knowing' },
  'brand_voice.dos': { confidence: 0.9, source_quote: 'Short sentences … We use "you"' },
  'brand_voice.donts': { confidence: 1.0, source_quote: "We never do urgency or scarcity. No 'limited time offer.'" },
  'brand_voice.sample_phrases': { confidence: 0.85, source_quote: 'Hand-picked, not algorithm-picked' },
  'brand_voice.tagline': { confidence: 1.0, source_quote: '"Curated for women who know what they love." It\'s on our signage' },
};

function seedCallRecording(dealId, contactId, ownerId) {
  const extractionPayload = {
    profile: BRAND_PROFILE,
    sidecar: SIDECAR,
    excluded_fields: [],
    edited_fields: [],
    completion_percent: 100,
    extracted_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // yesterday
    reviewed_at: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),       // 20h ago
    reviewed_by: ownerId,
    model: 'claude-opus-4-6',
    usage: { input_tokens: 1840, output_tokens: 732 },
    duration_ms: 18400,
  };

  const result = db.prepare(`
    INSERT INTO call_recordings (
      deal_id, contact_id, call_date, duration_minutes,
      audio_path, audio_original_name, audio_size_bytes,
      transcript, transcript_source, notes,
      extracted_profile_json, review_status,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-8 days'), datetime('now'))
  `).run(
    dealId, contactId,
    new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    30,
    null, null, null, // no audio file (we're seeding, not uploading)
    DISCOVERY_TRANSCRIPT,
    'pasted',
    'Great discovery call — Megan is clear on her brand, has realistic expectations, and is ready to move.',
    JSON.stringify(extractionPayload),
    'approved',
    ownerId
  );

  console.log(`  call recording: id=${result.lastInsertRowid} (transcript + 100% Brand Profile, approved)`);
  return result.lastInsertRowid;
}

// ============================================================================
// Compute the fit score explicitly so we can show Joe the exact value
// ============================================================================

function computeAndReport(dealId) {
  const { scoreDeal } = require('../server/services/fit-score');
  const result = scoreDeal(db, dealId);
  console.log('');
  console.log('=== Fit Score ===');
  console.log(`  Total: ${result.score}/100`);
  console.log(`  ICP Match: ${result.breakdown.icp_match.score}/${result.breakdown.icp_match.max}`);
  console.log(`    industry: ${result.breakdown.icp_match.details.industry_match}`);
  console.log(`    revenue:  ${result.breakdown.icp_match.details.revenue_in_range}`);
  console.log(`    geo:      ${result.breakdown.icp_match.details.geographic_fit}`);
  console.log(`    greens:   +${result.breakdown.icp_match.details.green_flag_bonus} ${JSON.stringify(result.flags.green)}`);
  console.log(`    reds:     ${result.breakdown.icp_match.details.red_flag_penalty} ${JSON.stringify(result.flags.red)}`);
  console.log(`  Readiness: ${result.breakdown.readiness_signals.score}/${result.breakdown.readiness_signals.max}`);
  console.log(`    ${JSON.stringify(result.breakdown.readiness_signals.details)}`);
  console.log(`  Engagement: ${result.breakdown.engagement.score}/${result.breakdown.engagement.max} (${result.breakdown.engagement.details.activity_count} activities, bucket ${result.breakdown.engagement.details.bucket})`);
  console.log('');
  return result.score;
}

// ============================================================================
// Run
// ============================================================================

console.log('Seeding Wren & Ivy Boutique (ideal-client example)...');
console.log('');

const ownerId = ensureAdmins();
wipeExisting();
ensureAcqTables();

const tx = db.transaction(() => {
  const { companyId, contactId, dealId } = seedCompanyContactDeal(ownerId);
  seedActivities(dealId, contactId, ownerId);
  seedAcqSignals();
  seedCallRecording(dealId, contactId, ownerId);
  return { companyId, contactId, dealId };
});

const { dealId } = tx();
const finalScore = computeAndReport(dealId);

console.log(`Done. Deal ID = ${dealId}. Fit Score = ${finalScore}.`);
console.log('Open http://localhost:5173 → Pipeline → Discovery Call column.');
console.log('');

db.close();
