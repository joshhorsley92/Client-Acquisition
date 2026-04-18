/**
 * Seeds default script templates into the database.
 * v2: pruned from 34 templates across 7 stages down to a focused set for the
 * only stages that matter — Brand Profile intake, proposal support, closed_won
 * onboarding. Merge fields resolve against the client + engagement, not the
 * deleted company/contact/deal triplet.
 *
 * Valid stage values in v2: 'working' | 'proposal' | 'closed_won'.
 */

function buildTemplates() {
  return [
    // ------------------------------------------------------------------
    // Working stage — Brand Profile intake
    // ------------------------------------------------------------------
    {
      stage: 'working',
      name: 'Brand Profile Intake — Call Guide',
      type: 'call_script',
      sort_order: 0,
      content: `# Brand Profile Intake — {client_name}

Goal: come off this call with enough information to fill out the Brand Profile in one pass.

## 1. The business in their own words
- "In one sentence, what does {client_name} do?"
- "Who is your ideal customer — specifically? Age, role, income, location, what's going on in their life when they need you?"
- "What do they try before they find you? What doesn't work for them?"

## 2. Positioning
- "What makes {client_name} different from {industry} competitors in {location}?"
- "If a customer had to pick three words to describe working with you, what would they be?"
- "What do you wish more people knew about your business?"

## 3. Voice & personality
- "Do customers usually hear from you in email, social, or somewhere else? Which of those sounds the most like you?"
- "Is your brand more 'polished and professional' or 'real and direct'? Show me an example."
- "Any language you hate? Anything that makes you cringe when you see it in marketing?"

## 4. Visual identity
- "Do you have a logo + brand guidelines? Colors, fonts, imagery?"
- "Any visual references you love? Or hate?"
- "What's the vibe — modern, classic, playful, serious?"

## 5. Proof points
- "Best customer success story — who was it, what did you do, what was the outcome?"
- "Any testimonials, reviews, case studies, numbers I can lean on?"
- "Any awards, certifications, partnerships?"

## 6. Goals & constraints
- "Realistically, what does a great outcome look like in 90 days?"
- "What's the single biggest thing holding you back right now?"
- "Any hard no's — things you absolutely will not do in your marketing?"

End with: "I'll pull this together into your Brand Profile and send it over. Can we book the proposal call for [date]?"
`,
    },

    {
      stage: 'working',
      name: 'Brand Profile Intake — Checklist',
      type: 'checklist',
      sort_order: 1,
      content: `# Brand Profile Intake Checklist

Gather all of the below before moving to Proposal.

- [ ] One-line business description
- [ ] Primary customer avatar (demographics + psychographics + trigger moment)
- [ ] Core differentiator vs. local competition
- [ ] Brand personality (3 adjectives + a "never say" list)
- [ ] Voice samples (link to current site copy, social, or emails)
- [ ] Logo + brand guidelines (colors, fonts, imagery, file links)
- [ ] 1-2 visual references they love, 1 they hate
- [ ] Strongest proof point (story, testimonial, or metric)
- [ ] 90-day definition of success
- [ ] Biggest current constraint (budget, time, in-house capacity)
- [ ] Hard no's — things they will not do in marketing
`,
    },

    // ------------------------------------------------------------------
    // Proposal stage — conversation support
    // ------------------------------------------------------------------
    {
      stage: 'proposal',
      name: 'Proposal Walkthrough — Talking Points',
      type: 'call_script',
      sort_order: 0,
      content: `# Proposal Walkthrough — {client_name}

Opening: "Thanks for making time. Before I walk through the proposal, quick gut check — is anything different since we last talked? Any new constraints, priorities, people involved?"

## Frame the ask
"Everything in this proposal traces back to what you told me on our intake call. I want to walk through it the same way we talked about it — problem first, solution second, investment third."

## Walk the document
1. **Where you are today** — mirror back their own words on the current state.
2. **Where you want to be in 90 days** — their success definition, repeated back.
3. **What we'll actually do** — each deliverable, in one sentence, tied back to the gap it closes.
4. **What you'll see in the first 30 days** — concrete milestones.
5. **Investment** — price, terms, what's included, what's not.

## Silence after price
Say the price. Wait. Do not fill the silence — let them think.

## Handle what comes up (see Objections doc)
- "Let me think about it"
- "Can we do a smaller version first?"
- Spouse/partner/business-partner check

## Close
"What's your gut reaction? If we moved forward, what's the next step from your side?"
`,
    },

    {
      stage: 'proposal',
      name: 'Proposal Objection Handlers',
      type: 'objection',
      sort_order: 1,
      content: `# Proposal Objections — Quick Responses

## "It's more than I expected"
"That's fair — let me ask what number you had in your head. The reason I ask is, if we're off by 20% I can probably work with you on scope. If we're off by 2x it's probably not the right fit right now, and I'd rather know that than drag this out."

## "I need to think about it"
"Totally reasonable. What specifically are you weighing? I'd rather answer the question now than have you sit with it for a week."

## "I need to check with my partner / spouse / co-founder"
"Of course. Want to loop them in directly — I'm happy to walk them through the same thing I just walked you through. Or send a recap?"

## "Can we do a smaller version first?"
"We can — but I want to be honest about the trade-off. The smaller version fixes X but not Y. If Y is what's keeping you up at night, we'd be starting something we'd have to redo. Let's make sure that's the right call."

## "How quickly can we start?"
(Buying signal.) "If we sign this week, kickoff would be [date]. First deliverable in your hands within [X] days."

## "What if it doesn't work?"
"Here's exactly what I'm committing to: [deliverables list]. What defines 'working' for you? Let's make sure that's in the proposal so we're both measuring the same thing."
`,
    },

    // ------------------------------------------------------------------
    // Closed-won — onboarding
    // ------------------------------------------------------------------
    {
      stage: 'closed_won',
      name: 'Onboarding Checklist',
      type: 'checklist',
      sort_order: 0,
      content: `# Onboarding — {client_name}

Fire this immediately after the engagement moves to Won.

- [ ] Send welcome email (kickoff meeting link + what to expect in week one)
- [ ] Confirm Brand Profile was pushed to Dashboard (/calls/:id/extract-brand-profile if not)
- [ ] Verify launch_client was created on Dashboard (check engagement.launch_client_id)
- [ ] Invoice sent for deposit / first payment
- [ ] Shared Drive / Notion folder created and shared
- [ ] Internal kickoff: brief the delivery team on the Brand Profile + constraints
- [ ] Calendar: book the 30-day check-in call
`,
    },
  ];
}

/**
 * Seeds templates if the table is empty. Used on fresh installs.
 * Returns a summary.
 */
function seedScriptTemplates(db) {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM script_templates').get().n;
  if (existing > 0) {
    return { inserted: 0, skipped: existing, reason: 'templates already present' };
  }

  const templates = buildTemplates();
  const insert = db.prepare(
    `INSERT INTO script_templates (stage, name, type, format, content, sort_order)
     VALUES (?, ?, ?, 'markdown', ?, ?)`
  );

  const tx = db.transaction(() => {
    for (const t of templates) {
      insert.run(t.stage, t.name, t.type, t.content, t.sort_order || 0);
    }
  });
  tx();

  return { inserted: templates.length, skipped: 0 };
}

/**
 * Inserts only templates whose (stage, name) pair is missing. Safe to call
 * repeatedly after the initial seed — used to patch in new canonical templates
 * without disturbing edits the user made to existing ones.
 */
function seedMissingScriptTemplates(db) {
  const templates = buildTemplates();
  const check = db.prepare('SELECT id FROM script_templates WHERE stage = ? AND name = ?');
  const insert = db.prepare(
    `INSERT INTO script_templates (stage, name, type, format, content, sort_order)
     VALUES (?, ?, ?, 'markdown', ?, ?)`
  );

  let inserted = 0;
  const tx = db.transaction(() => {
    for (const t of templates) {
      if (!check.get(t.stage, t.name)) {
        insert.run(t.stage, t.name, t.type, t.content, t.sort_order || 0);
        inserted++;
      }
    }
  });
  tx();

  return { inserted, total: templates.length };
}

module.exports = { seedScriptTemplates, seedMissingScriptTemplates };
