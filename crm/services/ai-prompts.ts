// Prompt builders for the Automations + engagement-generation flows.
// Pure functions — no DB, no Anthropic calls. Ported verbatim from the
// prototype's services/ai-prompts.js.

import {
  formatPackages, normalizePackages, packageDisplayName,
  summarizePackagePricing,
  type EngagementPackage,
} from '@/lib/engagement-options';

const HORMOZI_PREAMBLE = `You are a sales copywriter following Alex Hormozi's methodology. Apply these principles to everything you write:

VALUE EQUATION — Every piece must address all four variables:
- Dream Outcome: What the prospect actually wants (not services, but results — "a full calendar," "predictable growth")
- Perceived Likelihood: Why they should believe it'll work (proof, specificity, guarantees)
- Time Delay: How fast they'll see results (emphasize early wins, collapse perceived waiting)
- Effort & Sacrifice: How little they have to do ("done for you" framing)

KEY RULES:
1. Lead with value, not features. Describe what they GET, not what you DO.
2. Specificity beats generics. Use their actual business name, industry, location, and situation.
3. Dream outcome language. Not "digital marketing" but "a predictable system that fills your calendar."
4. Proof over promises. Back claims with case studies, metrics, or guarantees.
5. Small CTAs first. First contact asks for a conversation, not a purchase.
6. Never "just checking in." Every follow-up provides value.
7. Risk reversal through bold guarantees.
8. Scarcity must be real. "We onboard 5 clients/month because quality requires it."
9. Never discount. Adjust scope instead.
10. The break-up creates urgency. Final follow-up is a gracious walk-away.

`;

export type PromptType =
  | 'proposal_content'
  | 'followup_emails'
  | 'objection_scripts'
  | 'generic';

export interface ClientLike {
  name?: string;
  primary_contact_name?: string;
  email?: string;
  phone?: string;
  role?: string;
  location?: string;
  industry?: string;
  type?: string;
  website?: string;
  notes?: string;
}

// Resolved contact passed in from the route. When the engagement has its
// own contact_id set, this represents that contact; otherwise it's the
// client's primary. ClientLike's contact fields are still read as a
// fallback for callers that don't pass a resolved ContactLike.
export interface ContactLike {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
}

export interface EngagementLike {
  status?: string;
  source?: string;
  source_detail?: string;
  packages?: Array<EngagementPackage | string> | unknown[];
  estimated_value?: number;
  monthly_recurring_value?: number;
  contract_months?: number | null;
  notes?: string;
}

// Render selected packages with their per-line-item pricing + scope notes.
// Each line includes the price + frequency when set, so Claude can write a
// proposal that itemizes hybrid deals naturally
//   - Ad Copy: $500/month — 5 ads/month for FB & IG
//   - Landing Page: $2,000 one-time — Single LP w/ form
function buildPackagesSection(packages: EngagementPackage[]): string {
  if (packages.length === 0) return 'undecided';
  return packages
    .map((p) => {
      const name = packageDisplayName(p);
      const pricePart = (() => {
        const price = Number(p.unit_price ?? 0);
        if (!(price > 0)) return '';
        const freq = p.pricing_type === 'monthly' ? '/month' : ' one-time';
        return ` — $${price.toLocaleString()}${freq}`;
      })();
      const detailsPart = p.details ? ` — ${p.details}` : '';
      return `- ${name}${pricePart}${detailsPart}`;
    })
    .join('\n');
}

export type BrandProfileLike =
  | { profile?: Record<string, any> }
  | Record<string, any>
  | null
  | undefined;

function buildBrandProfileSection(profile: Record<string, any>): string {
  const safe = (v: any) =>
    v == null || v === '' ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);
  const rows: Array<[string, string | null]> = [
    ['Business description', safe(profile.business_description)],
    ['Customer avatar', safe(profile.customer_avatar)],
    ['Brand personality', safe(profile.brand_personality)],
    ['Brand voice', safe(profile.brand_voice)],
    ['Visual identity', safe(profile.visual_identity)],
    ['Revenue streams', safe(profile.revenue_streams)],
    ['Years in business', safe(profile.years_in_business)],
    [
      'Location',
      [safe(profile.location_city), safe(profile.location_state)].filter(Boolean).join(', ') || null,
    ],
  ].filter(([, v]) => v) as Array<[string, string | null]>;
  if (rows.length === 0) return '';
  return (
    '\nBRAND PROFILE (from the discovery call):\n' +
    rows.map(([k, v]) => `- ${k}: ${v}`).join('\n') +
    '\n'
  );
}

export function buildPrompt(
  type: PromptType | string,
  engagement?: EngagementLike | null,
  client?: ClientLike | null,
  brandProfile?: BrandProfileLike,
  contact?: ContactLike | null,
): string {
  const e: EngagementLike = engagement || {};
  const c: ClientLike = client || {};
  const ct: ContactLike = contact || {};
  // Fall back to the legacy client cache fields when no resolved contact
  // is supplied — keeps older callers working unchanged.
  const contactName = ct.name || c.primary_contact_name || 'unknown';
  const contactEmail = ct.email || c.email || 'no email';
  const contactPhone = ct.phone || c.phone || '';
  const contactRole = ct.role || c.role || '';
  const bp: Record<string, any> | null =
    brandProfile && (brandProfile as any).profile ? (brandProfile as any).profile : (brandProfile as any) || null;

  const normalizedPackages = normalizePackages(e.packages);
  const packagesLabel = formatPackages(normalizedPackages) || 'undecided';
  const packagesSection = buildPackagesSection(normalizedPackages);
  const { one_time_total, monthly_total } = summarizePackagePricing(normalizedPackages);
  // Prefer the package-derived totals; fall back to engagement-level fields
  // if no package prices are set yet (early entry, manual overrides).
  const setupTotal = one_time_total > 0 ? one_time_total : Number(e.estimated_value || 0);
  const mrrTotal = monthly_total > 0 ? monthly_total : Number(e.monthly_recurring_value || 0);
  const contractMonths = e.contract_months ?? null;
  const investmentLines = [
    setupTotal > 0 ? `- Setup (one-time): $${setupTotal.toLocaleString()}` : null,
    mrrTotal > 0
      ? `- Monthly retainer: $${mrrTotal.toLocaleString()}/month${contractMonths ? ` for ${contractMonths} months` : ' (open-ended)'}`
      : null,
  ].filter(Boolean).join('\n') || '- Pricing TBD — engagement created without prices set';

  const context = `
PROSPECT CONTEXT:
- Client: ${c.name || 'unknown'}
- Contact: ${contactName} (${contactEmail})${contactRole ? ` — ${contactRole}` : ''}${contactPhone ? ` — ${contactPhone}` : ''}
- Location: ${c.location || 'unknown'}
- Industry: ${c.industry || 'unknown'}
- Type: ${c.type || 'unknown'}
- Website: ${c.website || 'none found'}
- Engagement status: ${e.status || 'unknown'}
- Source: ${e.source || 'unknown'}${e.source_detail ? ` — ${e.source_detail}` : ''}
- Engagement notes: ${e.notes || 'none'}
- Client notes: ${c.notes || 'none'}

SELECTED SERVICES (with pricing and scope notes):
${packagesSection}

INVESTMENT TOTALS:
${investmentLines}
${bp ? buildBrandProfileSection(bp) : ''}`;

  switch (type) {
    case 'proposal_content':
      return HORMOZI_PREAMBLE + context + `
Generate a complete proposal document for ${c.name} in well-formatted Markdown.
Apply the Value Equation throughout — every section should speak to at least
one of Dream Outcome, Perceived Likelihood, Time Delay, or Effort & Sacrifice.

${bp ? `GROUND THE PROPOSAL IN THE BRAND PROFILE ABOVE. Use the customer avatar,
brand voice, and pain-point language their discovery call surfaced. Mirror
their words, not ours.` : `No brand profile yet — lean harder on the engagement
notes and the client profile above.`}

Structure (use Markdown headings):

# Proposal for ${c.name}
Short opening paragraph that names the dream outcome in their own words.

## Where you are today
Mirror back the current-state picture from the brand profile / notes — problems,
constraints, what isn't working. Be specific.

## Where you'll be in 90 days
The dream outcome, made tangible and time-bound. What will be measurably
different? Reference the customer avatar's "moment of need" if the brand
profile surfaced one.

## What we'll deliver
Bullet list. Each deliverable in one plain-language line, tied to the gap it
closes. Group by phase if helpful.

## First 30-day milestones
Concrete, week-by-week if possible.

## Investment
Use the SELECTED SERVICES + INVESTMENT TOTALS above as the pricing source
of truth. Structure this section as TWO clearly separated subsections
when both setup and monthly amounts are non-zero — never blend them
into a single number.

**Setup (one-time)** — ${setupTotal > 0 ? `$${setupTotal.toLocaleString()}` : 'TBD'}
List the one-time line items from SELECTED SERVICES. Each item gets one
plain-language description tying it to the gap it closes. Weave any scope
notes into the description rather than pasting them verbatim.

**Monthly retainer** — ${mrrTotal > 0 ? `$${mrrTotal.toLocaleString()}/month${contractMonths ? ` for ${contractMonths} months` : ' (open-ended)'}` : 'not part of this engagement'}
${mrrTotal > 0 ? `List the monthly line items from SELECTED SERVICES the same way. If a contract length is set, include it. Make the recurring nature obvious — "$X/month" not "$X total".` : 'Skip this subsection entirely.'}

**Total over the contract**${contractMonths && mrrTotal > 0 ? ` (${contractMonths} months)` : ''}: ${(() => {
  if (mrrTotal === 0) return setupTotal > 0 ? `$${setupTotal.toLocaleString()}` : 'TBD';
  if (contractMonths) return `$${(setupTotal + mrrTotal * contractMonths).toLocaleString()}`;
  return `$${setupTotal.toLocaleString()} + $${mrrTotal.toLocaleString()}/month`;
})()}

Be explicit about what's included AND what's deliberately not (e.g.,
"ad spend not included", "hosting separate") so there's no ambiguity.
Selected services for this engagement: ${packagesLabel}.

## Risk reversal
Exactly what we commit to. Specific, not vague.

## Next step
A single, clear call to action (sign, kickoff date, etc.).

Tone: specific, confident, consultative. Avoid generic marketing language.
Output Markdown only — no commentary before or after.`;

    case 'followup_emails':
      return HORMOZI_PREAMBLE + context + `
Generate a post-proposal follow-up sequence for ${ct.name || c.primary_contact_name || 'the contact'} at ${c.name}.

Follow Hormozi's follow-up methodology — NEVER send "just checking in." Every touchpoint must provide value.
- Day 1: Thank-you + recap. Reinforce dream outcome. Reference one specific thing from the call.
- Day 4: Value insight or quick tip. End with "any questions about the proposal?"
- Day 10: Value bomb — competitor insight, industry stat. "I came across this and thought of ${c.name}."
- Day 21: Break-up email. Gracious walk-away. Creates pattern interrupt.

Output each email with: subject line, body, and send timing.`;

    case 'objection_scripts':
      return HORMOZI_PREAMBLE + context + `
Generate objection handling scripts customized to ${ct.name || c.primary_contact_name || 'the contact'} at ${c.name}.

For each common objection (price, timing, trust, DIY, need to think), follow Hormozi's framework:
1. Validate the concern.
2. Diagnose which Value Equation variable is actually unresolved.
3. Respond with specificity to ${c.industry || 'their industry'}.
4. Re-ask for the close.

Make all scripts specific to ${c.name}'s industry, size, and known context.`;

    default:
      return HORMOZI_PREAMBLE + context + `
Generate sales content for the "${e.status || 'working'}" stage of an engagement with ${c.name}.
Apply the Value Equation. Be specific to their business.`;
  }
}

export function getPromptTypesForStatus(status?: string): PromptType[] {
  switch (status) {
    case 'working':
      return ['followup_emails', 'objection_scripts'];
    case 'proposal':
      return ['proposal_content', 'followup_emails'];
    default:
      return ['generic'];
  }
}
