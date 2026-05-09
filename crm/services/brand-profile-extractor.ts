// Brand Profile extractor — calls Claude with a strict JSON schema and
// returns the structured profile + a per-field sidecar (confidence + source
// quote) so the user can review extractions during call review.
//
// Pure function. No DB dependencies. Imported by /api/calls/[id]/extract-brand-profile.

import Anthropic from '@anthropic-ai/sdk';

export const BRAND_PROFILE_SCHEMA = {
  type: 'object',
  properties: {
    business_name: { type: ['string', 'null'] },
    industry: { type: ['string', 'null'] },
    business_description: { type: ['string', 'null'] },
    website_url: { type: ['string', 'null'] },
    phone: { type: ['string', 'null'] },
    location_city: { type: ['string', 'null'] },
    location_state: { type: ['string', 'null'] },
    years_in_business: { type: ['integer', 'null'] },
    revenue_streams: { type: ['string', 'null'] },
    customer_avatar: {
      type: 'object',
      properties: {
        name: { type: ['string', 'null'] },
        age_range: { type: ['string', 'null'] },
        gender: { type: ['string', 'null'] },
        occupation: { type: ['string', 'null'] },
        pain_points: { type: 'array', items: { type: 'string' } },
        goals: { type: 'array', items: { type: 'string' } },
        objections: { type: 'array', items: { type: 'string' } },
        where_online: { type: 'array', items: { type: 'string' } },
      },
    },
    brand_personality: {
      type: 'object',
      properties: {
        traits: { type: 'array', items: { type: 'string' } },
        mood: { type: ['string', 'null'] },
        formality_level: { type: ['string', 'null'], enum: ['casual', 'neutral', 'formal', null] },
        keywords: { type: 'array', items: { type: 'string' } },
      },
    },
    visual_identity: {
      type: 'object',
      properties: {
        primary_color: { type: ['string', 'null'] },
        secondary_color: { type: ['string', 'null'] },
        accent_color: { type: ['string', 'null'] },
        neutral_color: { type: ['string', 'null'] },
        heading_font: { type: ['string', 'null'] },
        body_font: { type: ['string', 'null'] },
        style_keywords: { type: 'array', items: { type: 'string' } },
      },
    },
    brand_voice: {
      type: 'object',
      properties: {
        tone: { type: 'array', items: { type: 'string' } },
        dos: { type: 'array', items: { type: 'string' } },
        donts: { type: 'array', items: { type: 'string' } },
        sample_phrases: { type: 'array', items: { type: 'string' } },
        tagline: { type: ['string', 'null'] },
      },
    },
  },
};

const TRANSCRIPT_TASK = `Your task:
1. Read the transcript carefully.
2. Extract ONLY information that the prospect (or speakers on their behalf) actually stated or strongly implied.
3. For any field not discussed or not inferable, leave it null (scalars) or [] (arrays). DO NOT invent, guess, or fill placeholder values.
4. Output valid JSON matching the exact schema below.`;

const WEBSITE_TASK = `Your task:
1. Read the website content carefully (this is page text + structured fragments extracted from the homepage and any /about or /contact pages of the prospect's website).
2. Extract ONLY information that the website actually states or strongly implies. Marketing copy is fair game; promotional puffery is not (e.g., "industry-leading" is not a brand_personality trait).
3. For any field the website doesn't substantiate, leave it null (scalars) or [] (arrays). DO NOT invent, guess, or fill placeholder values.
4. source_quote, when used, must be a verbatim substring of the supplied website content.
5. Output valid JSON matching the exact schema below.`;

const buildSystemPrompt = (source: 'transcript' | 'website') => `You are extracting a Brand Profile from a ${source === 'transcript' ? 'sales call transcript' : "prospect's website content"} for TKBS, a marketing agency. The Brand Profile will be used to generate marketing materials for the prospect.

${source === 'transcript' ? TRANSCRIPT_TASK : WEBSITE_TASK}

## Output format

Return a single JSON object with three top-level keys:

1. \`profile\` — the extracted Brand Profile in the shape below.
2. \`sidecar\` — a parallel object with the same field paths, where each leaf value is either \`null\` (if field wasn't extracted) OR an object \`{ "confidence": 0.0-1.0, "source_quote": "verbatim quote from source" }\`.
3. \`basic_fields\` — basic CRM-level facts that aren't part of the Brand Profile schema:
   - \`type\`: one of "B2B", "B2C", or null. B2C if the customer-facing site sells to consumers; B2B if it sells to businesses.
   - \`employee_count\`: a string range like "1-5", "10-25", "50-100", or null. Use a range, not an exact number, unless explicitly stated.
   - \`revenue_estimate\`: a string like "$500K", "$2M", or null. Only include if the website states/implies revenue, otherwise null.
   - \`location_city\`, \`location_state\`: strings extracted from any address shown on the site, or null.
   - \`primary_contact_name\`, \`primary_contact_role\`: extracted from the homepage / about / team / contact pages if a single primary contact is identifiable; otherwise null.
   - \`primary_email\`, \`primary_phone\`: a single best contact channel from the site, or null.

## Brand Profile schema

\`\`\`json
${JSON.stringify(BRAND_PROFILE_SCHEMA, null, 2)}
\`\`\`

## Field notes

- **business_name**: legal or doing-business-as name the prospect used
- **industry**: broad category (e.g. "Women's Fashion", "Home Services", "B2B SaaS")
- **customer_avatar.pain_points**: problems the prospect's customers have (not problems the prospect has)
- **customer_avatar.goals**: what the prospect's customers want to achieve
- **brand_personality.traits**: 3-5 adjectives describing the prospect's brand (e.g. "bold", "approachable", "expert")
- **brand_personality.formality_level**: one of "casual", "neutral", "formal", or null
- **visual_identity.primary_color**: hex code (e.g. "#1B2838") only if explicitly stated; null otherwise
- **brand_voice.tone**: tone adjectives (e.g. "warm", "direct", "authoritative")
- **brand_voice.dos / donts**: writing rules (e.g. dos: ["use inclusive language"], donts: ["corporate jargon"])

## Confidence rubric

- 0.9-1.0: stated explicitly and unambiguously
- 0.7-0.9: strongly implied with specific context
- 0.5-0.7: plausible inference from multiple hints
- 0.3-0.5: weak signal, worth flagging for review
- Below 0.3: don't extract (leave null)

## Critical rules

- Output ONLY the JSON object. No markdown code fences, no prose, no explanation.
- source_quote must be a VERBATIM substring of the source content, not a paraphrase.
- If the source is empty or clearly unrelated to a business, return profile with all nulls/empty arrays and basic_fields with all nulls.`;

const MODEL = 'claude-opus-4-6';
const MAX_TOKENS = 4096;

export interface ExtractionResult {
  profile: Record<string, unknown>;
  sidecar: Record<string, unknown>;
  basic_fields?: Record<string, unknown>;
  usage: unknown;
  model: string;
}

export type ExtractionSource = 'transcript' | 'website';

export class NoApiKeyError extends Error {
  code = 'NO_API_KEY';
}

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new NoApiKeyError('ANTHROPIC_API_KEY not set');
  return new Anthropic({ apiKey });
}

export async function extractBrandProfile(
  content: string,
  options: { model?: string; source?: ExtractionSource } = {},
): Promise<ExtractionResult> {
  if (!content || !content.trim()) {
    throw new Error('Content is empty');
  }
  if (content.length < 50) {
    throw new Error('Content too short to extract meaningful data (minimum 50 chars)');
  }

  const client = getClient();
  const model = options.model || MODEL;
  const source: ExtractionSource = options.source || 'transcript';

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: 'text',
        text: buildSystemPrompt(source),
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `${source === 'transcript' ? 'Transcript' : 'Website content'}:\n\n${content}\n\nReturn the JSON now.`,
      },
    ],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('')
    .trim();

  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/, '')
    .trim();

  let parsed: {
    profile?: Record<string, unknown>;
    sidecar?: Record<string, unknown>;
    basic_fields?: Record<string, unknown>;
  };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Claude returned invalid JSON. First 200 chars: ${cleaned.slice(0, 200)}`);
  }
  if (!parsed.profile || typeof parsed.profile !== 'object') {
    throw new Error('Claude output missing required "profile" key');
  }

  return {
    profile: parsed.profile,
    sidecar: parsed.sidecar || {},
    basic_fields: parsed.basic_fields,
    usage: response.usage,
    model: response.model,
  };
}

export function computeCompletion(profile: any): number {
  if (!profile) return 0;
  const checks = [
    !!profile.business_name,
    !!profile.industry,
    !!profile.customer_avatar?.name,
    (profile.customer_avatar?.pain_points?.length || 0) > 0,
    (profile.brand_personality?.traits?.length || 0) > 0,
    !!profile.visual_identity?.primary_color,
    (profile.brand_voice?.tone?.length || 0) > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
