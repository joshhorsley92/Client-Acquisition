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

function buildPrompt(type, engagement, client) {
  const e = engagement || {};
  const c = client || {};

  const context = `
PROSPECT CONTEXT:
- Client: ${c.name || 'unknown'}
- Primary contact: ${c.primary_contact_name || 'unknown'} (${c.email || 'no email'})
- Location: ${c.location || 'unknown'}
- Industry: ${c.industry || 'unknown'}
- Type: ${c.type || 'unknown'}
- Website: ${c.website || 'none found'}
- Engagement status: ${e.status || 'unknown'}
- Source: ${e.source || 'unknown'}${e.source_detail ? ` — ${e.source_detail}` : ''}
- Package type: ${e.package_type || 'undecided'}
- Estimated value: $${e.estimated_value || 0}
- Engagement notes: ${e.notes || 'none'}
- Client notes: ${c.notes || 'none'}
`;

  switch (type) {
    case 'proposal_content':
      return HORMOZI_PREAMBLE + context + `
Generate a proposal for ${c.name}.

Structure it around the Value Equation:
1. Where they are today — mirror back their own words on the current state.
2. Where they'll be in 90 days — their dream outcome, made tangible.
3. What we'll deliver, in plain language, each tied to the gap it closes.
4. First 30-day milestones.
5. Investment — price, terms, what's included, what's not.
6. Risk reversal — what we commit to.

Tone: specific, confident, consultative. Avoid generic marketing language.`;

    case 'followup_emails':
      return HORMOZI_PREAMBLE + context + `
Generate a post-proposal follow-up sequence for ${c.primary_contact_name || 'the contact'} at ${c.name}.

Follow Hormozi's follow-up methodology — NEVER send "just checking in." Every touchpoint must provide value.
- Day 1: Thank-you + recap. Reinforce dream outcome. Reference one specific thing from the call.
- Day 4: Value insight or quick tip. End with "any questions about the proposal?"
- Day 10: Value bomb — competitor insight, industry stat. "I came across this and thought of ${c.name}."
- Day 21: Break-up email. Gracious walk-away. Creates pattern interrupt.

Output each email with: subject line, body, and send timing.`;

    case 'objection_scripts':
      return HORMOZI_PREAMBLE + context + `
Generate objection handling scripts customized to ${c.primary_contact_name || 'the contact'} at ${c.name}.

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

/**
 * Maps an engagement's current status to suggested prompt types.
 */
function getPromptTypesForStatus(status) {
  switch (status) {
    case 'working': return ['followup_emails', 'objection_scripts'];
    case 'proposal': return ['proposal_content', 'followup_emails'];
    default: return ['generic'];
  }
}

module.exports = { buildPrompt, getPromptTypesForStatus };
