/**
 * Seeds default script templates into the database.
 * Run once during setup or when resetting templates.
 */
function seedScriptTemplates(db) {
  const templates = [
    // Lead stage
    { stage: 'lead', name: 'Research Checklist', type: 'checklist', content: `# Research Checklist for {company}

- [ ] Check website: platform, page count, mobile responsiveness, forms, CTAs
- [ ] Google "{company} {location}" — years in business, employee count, certifications
- [ ] Check Google Business Profile — review count, rating, photos, post activity
- [ ] Find social media — LinkedIn, Facebook, Instagram (follower counts, last post)
- [ ] Check review platforms — Google, Yelp, BBB
- [ ] Look for email marketing — popups, lead magnets, newsletter forms
- [ ] Identify top 2-3 competitors in same market
- [ ] Classify: B2B or B2C
- [ ] Note 3-4 strengths
- [ ] Note 4-5 digital gaps with evidence` },

    // Outreach stage
    { stage: 'outreach', name: 'Warm Referral Intro', type: 'email', content: `Subject: {referrer} suggested I reach out

Hey {contact},

{referrer} mentioned you and I should connect. I work with {industry} businesses in {location} to help them get more clients through their digital presence.

I took a quick look at {company}'s online presence and had a couple thoughts I think you'd find useful — no pitch, just observations.

Worth a quick 10-minute call this week?

Best,
Josh Horsley
TKBS Marketing` },

    { stage: 'outreach', name: 'Cold Email #1 — Observation + Value', type: 'email', content: `Subject: quick thought about {company}

Hey {contact},

I was looking at {company}'s online presence and noticed a few things that jumped out.

We help {industry} businesses in {location} get more inbound leads by fixing exactly this kind of thing. Recently helped a similar business go from sporadic leads to a predictable pipeline.

Would a quick 10-min walkthrough of what I found be worth your time? No pitch — just sharing what I see.

Josh Horsley
TKBS Marketing` },

    { stage: 'outreach', name: 'Cold Email #2 — Case Study (Day 3)', type: 'email', content: `Subject: how a {industry} business added clients in 60 days

Hey {contact},

Following up on my note from a few days ago.

We just wrapped up a project with a {industry} business — they went from relying entirely on referrals to getting 15+ inbound leads per month. Took about 60 days.

Your business reminds me a lot of theirs before we started. Want me to send the breakdown? Takes 5 minutes to read.

Josh` },

    { stage: 'outreach', name: 'Cold Email #3 — Break-Up (Day 10)', type: 'email', content: `Subject: closing the loop

Hey {contact},

I've reached out a couple times and haven't heard back — totally understand, you're busy running {company}.

I'm going to assume the timing isn't right. No hard feelings at all.

If anything changes and you want to revisit getting more clients through your digital presence, I'm here. Wishing you the best with {company}.

Josh Horsley
TKBS Marketing` },

    { stage: 'outreach', name: 'Discovery Call Script (CLOSER)', type: 'call_script', content: `## Step: CLARIFY
"Hey {contact}, thanks for taking the time. Before I jump into anything, can you tell me a little about {company} and what made you agree to this call?"

"What's going on with your marketing right now? How are you currently getting new clients?"

Listen. Let them talk. Take notes.

### If: "We mostly get referrals"
"That's a great sign — it means your work speaks for itself. The challenge with referrals is you can't control when they come in. What happens during slow months?"

### If: "We've tried some ads before"
"Got it. What platform? What happened? ... That's actually really common. Most of the businesses I work with had a similar experience before we started working together."

## Step: LABEL
"So it sounds like {company} is doing great work, but you don't have a predictable system to bring in new clients when you need them. You're relying on [referrals/word of mouth/hope], and when things slow down, there's no lever to pull. Is that fair?"

Wait for them to agree. If they push back, adjust your label.

### If: "That's not quite right"
"Help me understand better — what would you say is the main challenge?"

## Step: OVERVIEW
"What have you tried before to solve this? Any agencies, ads, marketing efforts?"

"And what happened? What worked, what didn't?"

"Why do you think it didn't work?"

### If: "We got burned by an agency"
"I hear that a lot, honestly. What specifically went wrong? ... Yeah, that's exactly the kind of thing we do differently. Let me explain how."

## Step: SELL THE SOLUTION
"Based on what you've told me, here's what I think {company} actually needs:

Step 1: We build you a digital presence that converts — a landing page designed to turn visitors into leads, connected to an email system that follows up automatically.

Step 2: We drive targeted traffic — people in {location} actively searching for {industry} services — straight to that page.

Step 3: Your phone rings. You close the deals you're already great at closing.

That's it. We handle the marketing system, you handle what you're best at — running {company}."

### If: "That sounds expensive"
"I get it. Let me ask you this — if you KNEW it would work, if I could guarantee you'd see results, would the investment still be an issue?"

## Step: EXPLAIN CONCERNS
"Now, I know you might be thinking a few things. Let me address them:

You might be wondering if this will work for {industry}. We've done this for [similar businesses]. It works.

You might be worried about the time commitment on your end. This is fully done-for-you. You don't write copy, you don't manage ads, you don't build pages.

And if you're concerned about getting burned again — I get it. That's why we [guarantee]. If we don't deliver, you don't pay."

### If: "I need to think about it"
"Totally fair. What specifically do you need to think about? Is it the money, whether it'll work, or something else? Because if there's something I haven't addressed, I'd rather handle it now while we're talking."

### If: "I need to talk to my partner"
"Of course. What do you think they'll be most concerned about? ... And if they asked 'what did they say about that,' what would you tell them?"

## Step: REINFORCE
"So here's what I'd like to do next — I'll put together a custom proposal based on everything we discussed today. No obligation. You'll see exactly what we'd build, the timeline, and the investment.

Should we plan to reconnect [day/time] to walk through it together?"

After they agree: "Great decision. You're going to love what we put together for {company}."` },

    // Follow-up stage
    { stage: 'follow_up', name: 'Day 1: Thank-You + Recap', type: 'follow_up', content: `Subject: great talking today, {contact}

Hey {contact},

Really enjoyed our conversation today about {company}. You've built something impressive, and I'm excited about the opportunity to help take it further.

Quick recap of what we discussed:
- [Key pain point discussed]
- [Solution approach we outlined]
- [Specific deliverables mentioned]

I'm putting together your custom proposal now. You'll have it by [date].

In the meantime, if any questions come up, don't hesitate to reach out.

Talk soon,
Josh` },

    { stage: 'follow_up', name: 'Day 4: Check-In', type: 'follow_up', content: `Subject: quick question, {contact}

Hey {contact},

Following up on the proposal I sent over. Had a chance to look through it?

I also came across [relevant insight/stat for their industry] and thought of {company}. Might be worth a conversation.

Any questions I can answer about what we put together?

Josh` },

    { stage: 'follow_up', name: 'Day 21: Break-Up', type: 'follow_up', content: `Subject: closing the loop on {company}

Hey {contact},

I've reached out a few times and haven't heard back, so I'm going to assume the timing isn't right. That's totally okay.

I'll stop reaching out, but if anything changes and you want to revisit getting {company} a predictable stream of new clients, I'm here.

Wishing you the best,
Josh` },

    // Closed Won stage
    { stage: 'closed_won', name: 'Welcome Email', type: 'email', content: `Subject: welcome aboard, {contact}! Here's what happens next

Hey {contact},

Officially excited to be working with {company}! Great decision — we're going to build something awesome together.

Here's what happens next:

1. Kickoff Call — I'll send a calendar invite for [date/time]. We'll align on goals, timelines, and get everything we need to start building.

2. Asset Collection — I'll send over a short list of things we'll need from you (logos, logins, brand guidelines if you have them). Don't worry — it's quick.

3. Build Starts — Within [timeline], you'll see the first deliverables. We move fast.

If you need anything before our kickoff, just reply to this email.

Let's go!
Josh Horsley
TKBS Marketing` },
  ];

  const insert = db.prepare(
    `INSERT INTO script_templates (stage, name, type, content, sort_order) VALUES (?, ?, ?, ?, ?)`
  );

  const existing = db.prepare('SELECT COUNT(*) as c FROM script_templates').get().c;
  if (existing > 0) return { seeded: false, count: existing };

  const transaction = db.transaction(() => {
    templates.forEach((t, i) => {
      insert.run(t.stage, t.name, t.type, t.content, i);
    });
  });

  transaction();
  return { seeded: true, count: templates.length };
}

module.exports = { seedScriptTemplates };
