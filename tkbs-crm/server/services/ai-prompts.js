const HORMOZI_PREAMBLE = `You are a sales copywriter following Alex Hormozi's methodology. Apply these principles to everything you write:

VALUE EQUATION — Every piece must address all four variables:
- Dream Outcome: What the prospect actually wants (not services, but results — "a full calendar," "predictable growth")
- Perceived Likelihood: Why they should believe it'll work (proof, specificity, guarantees)
- Time Delay: How fast they'll see results (emphasize early wins, collapse perceived waiting)
- Effort & Sacrifice: How little they have to do ("done for you" framing)

KEY RULES:
1. Lead with value, not features. Describe what they GET, not what you DO.
2. Specificity beats generics. Use their actual business name, industry, location, and situation. Never say "businesses like yours."
3. Dream outcome language. Not "digital marketing" but "a predictable system that fills your calendar without you lifting a finger."
4. Proof over promises. Back claims with case studies, metrics, or guarantees. Use industry benchmarks with sources if no case study exists yet.
5. Small CTAs first. First contact asks for a conversation, not a purchase.
6. Never "just checking in." Every follow-up provides value.
7. Risk reversal through bold guarantees.
8. Scarcity must be real. "We onboard 5 clients/month because quality requires it."
9. Never discount. Adjust scope instead.
10. The break-up creates urgency. Final follow-up is a gracious walk-away.

`;

function buildPrompt(type, deal, contact, company) {
  const isWarm = deal.source === 'referral' || deal.source === 'content';
  const warmCold = isWarm ? 'warm' : 'cold';
  const referrer = deal.source_detail || '';

  const context = `
PROSPECT CONTEXT:
- Contact: ${contact.name} (${contact.email || 'no email'})
- Company: ${company.name}
- Location: ${company.location || 'unknown'}
- Industry: ${company.industry || 'unknown'}
- Type: ${company.type || 'unknown'}
- Website: ${company.website || 'none found'}
- Source: ${deal.source || 'unknown'} ${referrer ? `— ${referrer}` : ''}
- Known gaps: ${deal.research_findings || 'none documented'}
- Services we'd recommend: ${deal.services_discussed || '[]'}
- Package type: ${deal.package_type || 'undecided'}
- Estimated value: $${deal.estimated_value || 0}/mo
- Call notes: ${deal.call_notes || 'none'}
- Objections noted: ${deal.objections_noted || 'none'}
`;

  switch (type) {
    case 'outreach_emails':
      return HORMOZI_PREAMBLE + context + `
Generate a ${warmCold} outreach email sequence for ${contact.name} at ${company.name}.
${isWarm && referrer ? `This is a warm referral from ${referrer}. Lead with the personal connection.` : ''}

Apply the Value Equation to every email. Follow Hormozi's outreach methodology:
- Email 1: Lead with a specific, genuine observation about their business. Provide an insight or value upfront. End with a small ask (10-min call). No pitch.
- Email 2 (day 3): Different angle. Share a relevant result from a similar business. Keep the CTA soft.
- Email 3 (day 7): Value bomb — offer a free audit or specific recommendations. Make it about THEM.
- Email 4 (day 14): Direct but respectful check-in. Reference previous value shared.
- Email 5 (day 21): Break-up email. "I'm going to stop reaching out, but if anything changes, I'm here."

Tone: Consultative, confident, not pushy. Willingness to walk away is the most powerful frame.

Output each email with: subject line, body, and send timing.`;

    case 'outreach_call':
      return HORMOZI_PREAMBLE + context + `
Generate a ${warmCold} outreach call script for calling ${contact.name} at ${company.name}.

Follow Alex Hormozi's CLOSER framework:
1. CLARIFY — Open with a brief, human intro. Ask what's going on with their marketing. Let them talk. Listen.
2. LABEL — Reflect back what you heard. Name the problem clearly. Get them to agree: "Is that fair?"
3. OVERVIEW — Ask what they've tried before. What worked? What didn't? Why do they think it failed?
4. SELL THE SOLUTION — Present the approach in 3 simple steps. Sell the "what" and "why" before the "who."
5. EXPLAIN CONCERNS — Proactively address likely objections:
   - Price: "If you KNEW it would work, would the price still be an issue?" → restack proof and guarantee
   - Trust: "You SHOULD be skeptical. That's why we [guarantee]." → stack proof
   - Timing: "What specifically do you need to think about?" → surface the real objection
   - DIY: "The question isn't whether you can — it's whether you should."
6. REINFORCE — Ask for the close. Reinforce the decision immediately. Move to next steps.

Include conditional branches: if they say X, respond with Y.
Format call scripts using these Markdown conventions so the CRM can render them as a stepper:
- Use "## Step: STEP_NAME" for each CLOSER step
- Use "### If: \\"prospect objection\\"" for conditional branches within a step
Tone: Curious, consultative, confident. Ask more than you tell.`;

    case 'followup_emails':
      return HORMOZI_PREAMBLE + context + `
Generate a post-proposal follow-up email sequence for ${contact.name} at ${company.name}.

Follow Hormozi's follow-up methodology — NEVER send "just checking in." Every touchpoint must provide value.
- Day 1: Thank-you + recap what was discussed. Reinforce dream outcome. Mention one specific thing from the call that showed you listened.
- Day 4: Check-in with value. Share a relevant insight, quick tip, or case study result. End with: "Any questions about the proposal?"
- Day 10: Value bomb. Send something genuinely useful — a competitor insight, an industry stat. Position it as "I came across this and thought of ${company.name}."
- Day 21: Break-up email. Gracious walk-away. Creates pattern interrupt.

${deal.objections_noted ? `IMPORTANT — weave responses to these objections into the emails:
${deal.objections_noted}
- Price concern → Day 4 email should include ROI framing and cost-of-inaction
- Trust concern → Day 4 email should include proof/case study
- Timing concern → Day 10 email should include urgency framing` : ''}

Output each email with: subject line, body, and send timing.`;

    case 'objection_scripts':
      return HORMOZI_PREAMBLE + context + `
Generate objection handling scripts customized to ${contact.name} at ${company.name}.

For each objection, follow Hormozi's framework — objections are unresolved concerns in the Value Equation:

1. "Too expensive" / Price:
   - Diagnose: value problem or cash problem?
   - If value: "If you KNEW it would work, would the price still be an issue?" → restack proof, guarantee, ROI math specific to ${company.industry || 'their industry'}
   - If cash: Adjust scope. NEVER discount.
   - Cost of inaction: "What's it costing you right now to NOT have a steady stream of clients?"

2. "I need to think about it" / Stall:
   - "What specifically do you need to think about?"
   - Two Decisions reframe: "Do you want [dream outcome]? And who are you going to do it with?"

3. "I've been burned before" / Trust:
   - Validate: "You SHOULD be skeptical."
   - Differentiate with specifics about how TKBS is different
   - Proof stack: guarantee, metrics, case study

4. "Not the right time":
   - "When would be? What changes between now and then?"
   - Cost of waiting: "Every month without the system is X potential clients missed"

5. "I can do it myself":
   - "You absolutely could. Is your time better spent running ${company.name} or learning Facebook ads?"

After handling each objection, always re-ask for the close.
Make all scripts specific to ${company.name}'s industry, size, and stated goals.`;

    default:
      return HORMOZI_PREAMBLE + context + `
Generate sales content for the "${deal.stage}" stage of the pipeline for ${contact.name} at ${company.name}.
Apply the Value Equation to everything. Be specific to their business.`;
  }
}

/**
 * Maps a deal's current stage to the appropriate prompt type(s).
 */
function getPromptTypesForStage(stage) {
  switch (stage) {
    case 'outreach': return ['outreach_emails', 'outreach_call'];
    case 'discovery_call': return ['outreach_call'];
    case 'follow_up': return ['followup_emails', 'objection_scripts'];
    case 'proposal': return ['followup_emails'];
    default: return ['generic'];
  }
}

module.exports = { buildPrompt, getPromptTypesForStage };
