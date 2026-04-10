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

/**
 * Seeds any missing script templates into the database.
 * Safe to run repeatedly — only inserts templates not already present.
 * Returns { added, skipped, total }.
 */
function seedMissingScriptTemplates(db) {
  // All 34 templates: 11 original + 23 new
  const allTemplates = [
    // ─── PROSPECT stage (3 new) ───────────────────────────────────────

    {
      stage: 'prospect',
      name: 'Prospect Qualification Checklist',
      type: 'checklist',
      content: `# Dream Client Qualification — {company}

Use Hormozi's "dream client" framework to score this prospect before investing outreach time. Each dimension is scored 1-5. Total your score at the bottom to decide: pursue, nurture, or pass.

# Revenue Potential
- [ ] Score (1-5): How much could {company} realistically spend on marketing services annually?
  - 1 = Under $5K/yr — barely viable
  - 2 = $5-10K/yr — small engagement
  - 3 = $10-25K/yr — solid mid-tier client
  - 4 = $25-50K/yr — strong account
  - 5 = $50K+/yr — dream client revenue

# Pain Signals
- [ ] Score (1-5): How visible and urgent are their digital marketing problems?
  - 1 = No obvious gaps — they look buttoned up
  - 2 = Minor issues — outdated design, slow site
  - 3 = Clear gaps — no SEO, weak social, few reviews
  - 4 = Significant pain — no online presence, competitors dominating
  - 5 = Burning platform — losing clients, negative reviews, zero leads

# Ability to Pay
- [ ] Score (1-5): Does {company} have the revenue and margins to afford our services?
  - 1 = Startup/pre-revenue — can't afford us
  - 2 = Small operation — tight budget likely
  - 3 = Established business — reasonable budget available
  - 4 = Growing business — marketing budget exists
  - 5 = Profitable and scaling — money is not the obstacle

# Timeline Urgency
- [ ] Score (1-5): Is there a reason {company} needs to act NOW vs. later?
  - 1 = No urgency — "maybe someday"
  - 2 = Mild interest — exploring options
  - 3 = Moderate — planning for next quarter
  - 4 = High — actively looking for help now
  - 5 = Critical — losing business, new competitor, seasonal deadline

# Decision-Maker Access
- [ ] Score (1-5): Can we reach the person who signs checks at {company}?
  - 1 = No idea who decides — large org, no contacts
  - 2 = Know the company but no direct contact
  - 3 = Have a contact but unsure if they're the decision-maker
  - 4 = Direct contact with the decision-maker
  - 5 = Warm intro or existing relationship with the owner/CEO

# Industry Fit
- [ ] Score (1-5): How well does {industry} align with our proven playbooks?
  - 1 = Industry we've never touched — steep learning curve
  - 2 = Adjacent industry — some transferable knowledge
  - 3 = Industry we understand — can deliver competently
  - 4 = Industry we've served before — have case studies
  - 5 = Sweet spot industry — proven results, strong references

# Scoring Decision
- [ ] TOTAL SCORE: ____/30
- [ ] 18+ = GREEN LIGHT — pursue aggressively, this is a dream client
- [ ] 12-17 = MAYBE — nurture the relationship, revisit when timing improves
- [ ] Below 12 = PASS — not worth the investment right now, move on`
    },

    {
      stage: 'prospect',
      name: 'Prospect Research Brief',
      type: 'checklist',
      content: `# Digital Presence Audit — {company}

Complete this research brief before any outreach to {contact} at {company}. The goal is to find 3-5 specific observations you can reference in your first touchpoint. Never reach out cold without ammo.

# Website Audit
- [ ] Visit {company}'s website — note the platform (WordPress, Wix, Squarespace, custom)
- [ ] Check mobile responsiveness — does it work on phone? Load time?
- [ ] Identify conversion paths — are there clear CTAs, forms, phone numbers?
- [ ] Look for a blog — is it active? Last post date?
- [ ] Check for SSL certificate (https) and basic security
- [ ] Note the overall design quality — dated, modern, or professional?
- [ ] Screenshot any major issues for reference

# Google Business Profile
- [ ] Search "{company} {location}" on Google
- [ ] Check if GBP exists and is claimed
- [ ] Note review count and average rating
- [ ] Check photo count and quality
- [ ] Look at recent posts — are they using GBP posts?
- [ ] Note business hours accuracy and category selection

# Reviews & Reputation
- [ ] Google review count: ____ | Rating: ____
- [ ] Yelp review count: ____ | Rating: ____
- [ ] BBB rating and complaints: ____
- [ ] Industry-specific review sites (Houzz, Angi, etc.): ____
- [ ] Note any negative review patterns or unanswered reviews

# Social Media Presence
- [ ] Facebook: followers ____ | Last post: ____ | Engagement level: ____
- [ ] Instagram: followers ____ | Last post: ____ | Content quality: ____
- [ ] LinkedIn: company page exists? | Activity level: ____
- [ ] Other platforms relevant to {industry}: ____

# Email & Marketing
- [ ] Does the website have a newsletter signup or lead magnet?
- [ ] Any popup or exit-intent offers?
- [ ] Sign up if possible — note the welcome sequence quality
- [ ] Check for retargeting pixels (Facebook, Google) using browser tools

# Competitor Comparison
- [ ] Identify top 2-3 competitors in {location} for {industry}
- [ ] How does {company} compare on Google rankings for key terms?
- [ ] Which competitors have stronger digital presence?
- [ ] What are competitors doing that {company} is NOT?

# Key Findings Summary
- [ ] Top 3 strengths to acknowledge: ____
- [ ] Top 3-5 gaps to reference in outreach: ____
- [ ] Recommended opening angle for first contact: ____`
    },

    {
      stage: 'prospect',
      name: 'Initial Assessment Scorecard',
      type: 'checklist',
      content: `# Quick Go/No-Go Assessment — {company}

Fast decision framework: score each dimension 1-5, total it up, and decide in under 2 minutes whether to invest further research time on this prospect.

# Pain Level
- [ ] Score (1-5): How acute is {company}'s marketing pain right now?
  - 1 = No visible pain — doing fine without us
  - 3 = Moderate gaps — missing opportunities but surviving
  - 5 = Severe — visibly losing to competitors, no digital presence

# Budget Fit
- [ ] Score (1-5): Can {company} afford our minimum engagement?
  - 1 = Too small — unlikely to afford even starter packages
  - 3 = Mid-range — could afford a focused engagement
  - 5 = Strong — budget is clearly not the obstacle

# Decision-Maker Access
- [ ] Score (1-5): How reachable is the person who decides?
  - 1 = No way in — gatekeepers, corporate bureaucracy
  - 3 = Can reach them with effort — email or LinkedIn available
  - 5 = Direct access — have their cell or a warm intro from {referrer}

# Timeline
- [ ] Score (1-5): How likely are they to move in the next 30-60 days?
  - 1 = No urgency signals whatsoever
  - 3 = Some indicators — seasonal uptick, new location, etc.
  - 5 = Urgent — actively searching, competitor pressure, time-bound event

# Industry Fit
- [ ] Score (1-5): How well do we serve {industry}?
  - 1 = Unknown territory — would need to learn from scratch
  - 3 = Familiar — we can deliver but no case studies
  - 5 = Proven — we have results and references in this space

# Growth Potential
- [ ] Score (1-5): Could {company} become a long-term, expanding account?
  - 1 = One-and-done project — no recurring potential
  - 3 = Could grow into ongoing retainer over time
  - 5 = Multi-service opportunity — SEO, ads, web, email, the works

# Decision
- [ ] TOTAL SCORE: ____/30
- [ ] 24-30 = PURSUE NOW — prioritize this prospect
- [ ] 18-23 = WORTH A SHOT — add to outreach queue
- [ ] 12-17 = BACKBURNER — revisit in 30-60 days
- [ ] Below 12 = SKIP — don't waste the cycles`
    },

    // ─── LEAD stage (2 new) ──────────────────────────────────────────

    {
      stage: 'lead',
      name: 'Lead Qualification Scorecard',
      type: 'checklist',
      content: `# Lead Qualification — {company}

Hormozi-style qualification: Pain first, then Budget, Authority, Timing. A prospect with massive pain and tight budget is more valuable than one with budget and no urgency. Score each section and use the decision framework at the bottom.

# PAIN (Most Important)
- [ ] What specific problem does {contact} at {company} need solved?
  - Note: ____
- [ ] How long have they had this problem?
  - Note: ____
- [ ] What has it cost them (lost revenue, wasted time, missed opportunities)?
  - Note: ____
- [ ] Have they tried to solve it before? What happened?
  - Note: ____
- [ ] Pain Score (1-5): 1 = nice-to-have, 5 = hair-on-fire problem
  - Score: ____

# BUDGET
- [ ] What is {company}'s estimated annual revenue? ____
- [ ] Do they currently spend on marketing? How much? ____
- [ ] Have they paid for agency/freelancer services before? ____
- [ ] Would {estimated_value} be within their comfort zone?
  - Note: ____
- [ ] Budget Score (1-5): 1 = can't afford us, 5 = budget is ready
  - Score: ____

# AUTHORITY
- [ ] Is {contact} the decision-maker at {company}? ____
- [ ] If not, who else is involved in the decision? ____
- [ ] What is their decision-making process? ____
- [ ] Can we get all decision-makers on the discovery call? ____
- [ ] Authority Score (1-5): 1 = no access to decision-maker, 5 = talking to the owner
  - Score: ____

# TIMING
- [ ] Is there a deadline or event driving urgency? ____
- [ ] What happens if they do nothing for 6 months? ____
- [ ] Are they evaluating other options right now? ____
- [ ] When would they ideally want to start? ____
- [ ] Timing Score (1-5): 1 = "maybe next year", 5 = "we need this yesterday"
  - Score: ____

# Decision Framework
- [ ] TOTAL SCORE: ____/20
- [ ] 16-20 = PROCEED — book discovery call immediately, high-priority lead
- [ ] 11-15 = NURTURE — stay in touch, send value, wait for timing to improve
- [ ] 6-10 = DISQUALIFY — politely pass, refer out if possible, revisit in 90 days
- [ ] Below 6 = HARD PASS — not our client, move on without guilt`
    },

    {
      stage: 'lead',
      name: 'Internal Lead Notes Template',
      type: 'checklist',
      content: `# Internal Lead Notes — {company}

Private notes for our team. Never share this doc with the prospect. Fill this out as we gather intel to prepare for outreach and discovery.

# Source Context
- [ ] How did {company} enter our pipeline? Source: {source}
- [ ] Source detail: {source_detail}
- [ ] Referred by: {referrer} (if applicable)
- [ ] What do we know about why they're a fit based on how they came in?
  - Note: ____

# What We Know
- [ ] Company: {company} | Industry: {industry} | Location: {location}
- [ ] Contact: {contact} | Role/Title: ____
- [ ] Business type: {type}
- [ ] Estimated company size (employees/revenue): ____
- [ ] Key findings from research: {research_findings}

# Competitive Landscape
- [ ] Who are {company}'s top local competitors? ____
- [ ] Are any competitors using agencies or running ads? ____
- [ ] What is {company}'s competitive advantage that we can amplify? ____
- [ ] Is {company} aware of how they compare digitally? ____

# Deal Sizing
- [ ] Estimated deal value: {estimated_value}
- [ ] Rationale for that estimate: ____
- [ ] Services most likely to recommend: {services}
- [ ] Upsell potential over 12 months: ____
- [ ] Package type we'd likely propose: {package_type}

# Potential Objections to Prepare For
- [ ] Price sensitivity signals: ____
- [ ] Past bad experiences with agencies: ____
- [ ] DIY tendencies ("my nephew does our website"): ____
- [ ] Timing concerns ("not right now"): ____
- [ ] Trust barriers ("how do I know this works?"): ____

# Recommended Approach
- [ ] Best outreach channel (email, phone, LinkedIn, referral intro): ____
- [ ] Opening angle — what observation or value lead do we use? ____
- [ ] Tone: aggressive, consultative, or educational? ____
- [ ] Priority level: HIGH / MEDIUM / LOW
- [ ] Notes on previous objections: {objections_noted}`
    },

    // ─── OUTREACH stage (3 new) ──────────────────────────────────────

    {
      stage: 'outreach',
      name: 'Cold Email #4 — Day 14 Re-Engage',
      type: 'email',
      content: `Subject: one more thought on {company}

Hey {contact},

I know you're slammed running {company}, so I'll keep this short.

Since I last reached out, I came across something that made me think of your business. I was looking at how {industry} companies in markets similar to {location} are generating leads right now, and there's a pattern worth knowing about.

The ones growing fastest aren't doing anything revolutionary — they're just making sure the basics work: showing up when people search, following up automatically, and making it ridiculously easy to say "yes." Most of their competitors (including some in {location}) still haven't figured this out.

That gap is the opportunity. And based on what I saw with {company}'s current digital presence, you're well-positioned to capitalize on it with a few strategic moves.

If you're open to a 10-minute conversation about what I'd focus on first, I'd genuinely enjoy the chat. And if the timing still isn't right, no worries at all — I'll leave it in your court.

Josh Horsley
TKBS Marketing`
    },

    {
      stage: 'outreach',
      name: 'LinkedIn DM — Connection Request',
      type: 'email',
      content: `Subject: LinkedIn Connection Note

Hi {contact} — I came across {company} while researching {industry} businesses in {location}. Impressed by what you've built. Would love to connect and share some observations about your digital presence. No pitch, just insights.`
    },

    {
      stage: 'outreach',
      name: 'Voicemail Script',
      type: 'call_script',
      content: `## Step: Intro (5 seconds)
"Hey {contact}, this is Josh Horsley with TKBS Marketing."

Keep it casual. Smile while you talk — they can hear it.

## Step: Hook (10 seconds)
"I was looking at how {industry} businesses in {location} are showing up online, and I noticed something about {company} that I think you'd want to know about. It's actually costing you leads right now, and the fix isn't complicated."

### If: leaving voicemail after a cold email
"I sent you a quick email a few days ago about {company}'s online presence — wanted to make sure it didn't get buried."

### If: leaving voicemail after a referral
"{referrer} suggested I give you a call. I work with {industry} businesses on getting more clients through their digital presence, and they thought we should connect."

## Step: CTA (10 seconds)
"Give me a ring back at [phone number] or just reply to the email I'll shoot over right after this. Either way, I think you'll find it worth 10 minutes of your time. Talk soon, {contact}."

Never leave a voicemail longer than 30 seconds. If you can't say it in 30, you're saying too much.`
    },

    // ─── DISCOVERY_CALL stage (4 new) ────────────────────────────────

    {
      stage: 'discovery_call',
      name: 'Meeting Confirmation Email',
      type: 'email',
      content: `Subject: confirmed — our call on [date/time]

Hey {contact},

Looking forward to our conversation about {company}. Just confirming we're set for [date/time].

Here's what we'll cover in our [20/30]-minute call:

1. I'll share the specific observations I've found about {company}'s digital presence — things that are costing you leads right now.
2. We'll talk about where you want to take {company} over the next 6-12 months and what's standing in the way.
3. If it makes sense, I'll outline what a growth plan could look like. If it doesn't, I'll tell you that too.

No pressure, no hard sell. Just a straight conversation about what's possible.

One quick question to help me prepare: What's the #1 thing you wish was working better in your marketing right now? Even a one-line answer helps me make our time together more valuable.

See you [date/time],
Josh Horsley
TKBS Marketing`
    },

    {
      stage: 'discovery_call',
      name: 'Pre-Call Research Brief',
      type: 'checklist',
      content: `# Pre-Call Prep — {company} with {contact}

Complete this BEFORE the discovery call. Never go in blind. The more specific your observations, the more trust you build in the first 5 minutes.

# Company Context
- [ ] Review {research_findings} — highlight the top 3 observations to mention
- [ ] Confirm: {company} is in {industry}, located in {location}
- [ ] Business type: {type} | Source: {source} ({source_detail})
- [ ] Any notes from previous interactions: {call_notes}

# Pain Hypotheses (Pick 2-3 to test on the call)
- [ ] Hypothesis 1: {company} relies on referrals/word-of-mouth and has no predictable lead gen system
- [ ] Hypothesis 2: They've tried marketing before (ads, agency, DIY) and it didn't work
- [ ] Hypothesis 3: Competitors are outranking them / winning the digital game in {location}
- [ ] Hypothesis 4: They know they need marketing help but don't know where to start
- [ ] Hypothesis 5: Growth has plateaued and they can't figure out why

# Industry Benchmarks to Reference
- [ ] Average cost-per-lead in {industry}: $____
- [ ] Typical conversion rate for {industry} websites: ____%
- [ ] Google search volume for key {industry} terms in {location}: ____
- [ ] What top performers in {industry} are doing differently: ____

# 3 "Gotcha" Observations
Specific things you found that will make {contact} say "wow, you really did your homework."
- [ ] Observation 1: ____
- [ ] Observation 2: ____
- [ ] Observation 3: ____

# Questions to Ask
- [ ] "What made you agree to this call? What's going on with {company} right now?"
- [ ] "How are you currently getting new clients?"
- [ ] "What have you tried before? What happened?"
- [ ] "If we could fix one thing about your marketing, what would matter most?"
- [ ] "What does your ideal month look like in terms of new clients?"

# Potential Services to Recommend
- [ ] Based on research, likely fit: {services}
- [ ] Package type consideration: {package_type}
- [ ] Estimated value: {estimated_value}
- [ ] What to lead with vs. what to hold back for the proposal: ____`
    },

    {
      stage: 'discovery_call',
      name: 'Discovery Call Script (CLOSER)',
      type: 'call_script',
      content: `## Step: CLARIFY the Current State
"Hey {contact}, great to finally connect. Thanks for making the time. Before I get into what I found looking at {company}, I'd love to hear from you — what's going on with your marketing right now? How are you getting new clients today?"

Let them talk. Take notes in {call_notes}. Reference {research_findings} to validate what they say.

"Got it. And what made you agree to this call? What's the real thing you're hoping to solve?"

### If: "We mostly rely on referrals"
"That tells me your work speaks for itself — that's the hardest part. The challenge is referrals aren't a system. You can't control when they come in. What happens during a slow month?"

### If: "We've tried agencies/ads before and got burned"
"I hear that more than you'd think. What specifically went wrong? ... That's exactly why I do things differently. Let me show you what I mean as we go."

### If: "I'm not sure we need anything, just exploring"
"Totally fair. Let me share what I found in my research, and you can decide if it's worth a deeper conversation. No pressure either way."

## Step: LABEL the Problem
"So based on what you're telling me, and what I found looking at {company}'s digital presence — here's what I think is happening:

{company} is doing great work in {industry}, but you don't have a predictable system to bring in new clients. You're relying on [referrals/word-of-mouth/past relationships], and when things slow down, there's no lever to pull. Meanwhile, competitors in {location} who aren't necessarily better at what they do are showing up first online and winning the business.

Is that a fair summary?"

### If: "That's spot on"
"Good. Let me show you exactly what I mean." Transition to sharing specific observations from your research.

### If: "Not exactly..."
"Help me understand what I'm missing. What would you say is the real challenge?" Adjust your diagnosis before proceeding.

## Step: OVERVIEW Past Attempts
"Before I share what I'd recommend, I want to understand what you've already tried. Have you invested in marketing before — an agency, a freelancer, running your own ads, anything like that?"

"What happened? What worked, what didn't?"

"Why do you think it fell short?"

### If: They had a bad agency experience
"That's unfortunately common. Here's what typically goes wrong: [generic deliverables, no strategy, no communication, no accountability]. What we do differently is [specific differentiator]. But I'll get to that."

### If: They've never invested in marketing
"That's actually not a bad thing. It means we're starting with a clean slate — no bad habits to undo, no wasted budget to recover from. We can build this right from the start."

## Step: SELL the Solution
"Based on everything you've told me and what I found in my research, here's what I think {company} actually needs:

**Step 1:** We build you a digital foundation that converts — a website or landing page designed to turn visitors into leads, with automated follow-up so nobody falls through the cracks.

**Step 2:** We drive targeted traffic — people in {location} actively searching for {industry} services — straight to that conversion system. Through {services} specifically.

**Step 3:** Your phone rings. You do what you're already great at — serving clients and growing {company}.

The goal isn't to make you a marketing expert. It's to build a system that works in the background while you run your business."

### If: "That sounds expensive"
"I totally get that concern. Let me ask you this — if you KNEW it would bring in [X] new clients per month, would the investment still feel like a risk? Because that's what we're talking about building here."

### If: "How is this different from what we tried before?"
"Great question. Three things: First, everything is built around YOUR specific market in {location}, not a cookie-cutter template. Second, you'll see exactly what's working and what's not — full transparency. Third, if we don't deliver results, you don't keep paying. That's our guarantee."

## Step: EXPLAIN and Handle Concerns
"Now, I know you're probably thinking a few things. Let me address the big ones:

**'Will this work for {industry}?'** — We've done this for businesses like yours. It works because the fundamentals are the same: be findable, be credible, make it easy to say yes.

**'How much time does this take on my end?'** — This is done-for-you. You're not writing copy, managing ads, or building pages. We handle the system; you handle {company}.

**'What if it doesn't work?'** — We guarantee results. If we don't deliver what we promise, you're not stuck."

### If: "I need to think about it"
"Totally respect that. Can I ask — what specifically do you want to think about? Is it the investment, whether it'll work, or something else? I'd rather address it now while we're talking than have it be an unanswered question."

### If: "I need to talk to my partner/spouse"
"Of course. What do you think they'll be most concerned about? ... And if they asked, 'what did the marketing person say about that,' what would you tell them? Let me help you have that conversation."

### If: "Send me some info and I'll get back to you"
"Happy to do that. But in my experience, the info is most useful when I can walk you through it and answer questions in real-time. Can we schedule 15 minutes to review it together?"

## Step: REINFORCE and Transition to Proposal
"Here's what I'd like to do next, {contact}. I'll put together a custom growth plan for {company} based on everything we discussed today. It'll include:

- Exactly what we'd build and in what order
- The timeline from kickoff to results
- The investment and what you get for it
- Our guarantee

No obligation. You'll see the full picture and can decide if it makes sense.

Should we plan to reconnect [suggest specific day/time] to walk through it together?"

After they agree: "Great decision. I'm genuinely excited about what we can do for {company}. You'll have the proposal in your inbox before our next call."

**Post-call:** Update {call_notes} with confirmed pain points, budget signals, timeline, and the proposal angle.`
    },

    {
      stage: 'discovery_call',
      name: 'Post-Call Notes Template',
      type: 'checklist',
      content: `# Post-Call Debrief — {company}

Fill this out IMMEDIATELY after hanging up. Memory is freshest in the first 5 minutes. These notes drive the proposal and every follow-up touchpoint.

# Pain Confirmed
- [ ] Primary pain confirmed? YES / NO
  - What they said in their own words: ____
- [ ] Secondary pains uncovered: ____
- [ ] Emotional driver (what keeps them up at night): ____
- [ ] How long they've had this problem: ____
- [ ] What it's costing them (revenue, time, stress): ____

# Budget Signals
- [ ] Did they mention a budget range? YES / NO — Amount: ____
- [ ] Did they flinch at any numbers discussed? ____
- [ ] Have they paid for marketing services before? Amount: ____
- [ ] Estimated comfort zone for monthly investment: ____
- [ ] Our proposed deal value: {estimated_value}

# Timeline
- [ ] When do they want to start? ____
- [ ] Is there a deadline or event driving urgency? ____
- [ ] How quickly do they expect results? ____
- [ ] Realistic timeline we should set in the proposal: ____

# Decision-Maker Dynamics
- [ ] Is {contact} the sole decision-maker? YES / NO
- [ ] If not, who else is involved? ____
- [ ] What will the other decision-maker care about most? ____
- [ ] Can we get them on the proposal walkthrough call? ____

# Objections Raised
- [ ] Objections that came up during the call: {objections_noted}
- [ ] Were they fully resolved or still lingering? ____
- [ ] Anticipated objections for the proposal stage: ____

# Services Discussed
- [ ] Services they showed interest in: {services}
- [ ] Services we recommended: ____
- [ ] What to lead with in the proposal: ____
- [ ] What to position as Phase 2 upsell: ____
- [ ] Package type: {package_type}

# Next Steps Agreed
- [ ] Proposal walkthrough scheduled for: [date/time]
- [ ] Any materials they're sending us: ____
- [ ] Any homework or follow-up items for us: ____

# Proposal Angle
- [ ] Lead the proposal with: ____
- [ ] Key metric/outcome to highlight: ____
- [ ] Guarantee framing that resonated: ____
- [ ] Tone: aggressive close / consultative / educational
- [ ] Confidence level (1-10) this deal closes: ____`
    },

    // ─── PROPOSAL stage (3 new) ──────────────────────────────────────

    {
      stage: 'proposal',
      name: 'Proposal Delivery Email',
      type: 'email',
      content: `Subject: your custom growth plan for {company}

Hey {contact},

As promised — here's the custom growth plan we put together for {company}.

Quick reminder of where we're headed: based on our conversation, the goal is to build {company} a predictable system for generating new {industry} clients in {location} — so you're not relying on referrals alone and you have a real lever to pull when you want to grow.

Here's what's inside:
- The specific problems we identified and how we'll fix them
- A phased approach using {services} so you see results fast without feeling overwhelmed
- Timeline from kickoff to measurable results
- The investment: {estimated_value} — and exactly what you get for it
- Our guarantee: if we don't deliver, you don't pay

I'd love to walk through this together so I can answer your questions in real time. That's where the proposal really comes to life — the document is the "what," but the conversation is the "why it works."

Can we jump on a quick call [suggest 2-3 times]? Should take about 20 minutes.

Looking forward to it,
Josh Horsley
TKBS Marketing`
    },

    {
      stage: 'proposal',
      name: 'Proposal Walkthrough Script',
      type: 'call_script',
      content: `## Step: Recap Pain
"Hey {contact}, great to connect again. Before I walk you through the proposal, I want to make sure nothing has changed since we last spoke. You mentioned that {company}'s biggest challenge was [reference specific pain from call notes]. Is that still the case?"

Let them confirm or update. Adjust your framing if new information surfaces.

### If: "Actually, something changed..."
"Okay, tell me more. Let's make sure the plan still fits before I walk you through it." Adapt on the fly — don't barrel through a proposal that no longer matches their reality.

### If: They confirm
"Perfect. Everything in this proposal is designed to solve exactly that. Let me show you how."

## Step: Present the Solution
"Here's the big picture: We're going to build {company} a predictable client acquisition system. Instead of hoping for referrals, you'll have a machine that generates leads on autopilot.

Three phases:
1. **Foundation** — We fix what's broken and build the conversion system
2. **Traffic** — We drive targeted {industry} prospects in {location} to that system
3. **Optimization** — We measure everything and double down on what works

The result: you stop worrying about where the next client comes from."

### If: "How long before I see results?"
"Phase 1 deliverables are typically live within [2-3 weeks]. You'll start seeing traffic and leads in Phase 2, usually within [30-60 days]. By 90 days, we're optimizing a system that's already working."

## Step: Walk Through Services
"Let me break down exactly what we're building for {company}:

{services}

Each of these was chosen specifically based on what we discussed and what I found in my research. Nothing in here is filler — every line item drives leads or conversions."

Walk through each service line item. Connect each one back to a specific pain point or gap they mentioned.

### If: "Do we really need all of this?"
"Fair question. Each piece serves a purpose — [explain the dependency chain]. But if you wanted to phase it, we could start with [core items] and add [secondary items] in Phase 2. The results would just take a bit longer to compound."

## Step: Show Pricing
"The total investment is {estimated_value}. That breaks down to [monthly/one-time breakdown].

To put that in perspective: if this system brings you just [X] new clients per month at your average deal size, you're looking at [Y] in new revenue. That's a [Z]x return on the investment.

And remember our guarantee: if we don't deliver [specific outcome], you're not locked in."

### If: "That's more than I expected"
"I understand. Let's look at it this way — what's one new client worth to {company}? [Let them answer.] So we need [math] clients to pay for the entire program. Everything after that is pure profit. Does that math work for you?"

### If: "Can you do it for less?"
"I could, but I'd have to cut scope — and the pieces I'd cut are the ones that drive the results. Instead of reducing quality, let me suggest a phased approach: we start with [core package] at [lower price], prove it works, then expand. That way your risk is lower and we earn the next phase."

### If: "Competitor X quoted us less"
"I'd expect that. Most agencies competing on price are also competing on quality. The question isn't who's cheapest — it's who's going to actually move the needle for {company}. What's included in their quote? Let's compare apples to apples."

### If: "I need to think about it"
"Totally fair. What's the one thing you need to think through? Is it the investment, whether it'll work, the timing, or something else? [Address the real concern, then go to the close.]"

## Step: Handle Remaining Objections
"Before we wrap up — what questions do you have? What's your gut telling you?"

Listen carefully. Address every concern directly. Don't rush past objections.

### If: They raise a new concern
Acknowledge, reframe, prove, and ask: "Does that address it, or is there something else?"

### If: "I need to talk to my partner"
"Of course. What do you think they'll be most concerned about? Can we set up a quick call with both of you so I can answer their questions directly?"

## Step: Close
"So {contact}, based on everything we've discussed — the problem, the plan, the investment, and the guarantee — are you ready to move forward with {company}'s growth plan?"

### If: YES
"Fantastic. Here's what happens next: I'll send over the agreement today, and once it's signed we'll schedule your kickoff call within [X days]. Welcome aboard — this is going to be great."

### If: "Not yet, but soon"
"No problem. Let's set a specific date to reconnect so this doesn't fall off your plate. How about [day/time]? I'll send a calendar invite right now."

### If: Hard no
"I respect that. If anything changes down the road, the door is always open. In the meantime, I genuinely hope {company} crushes it."`
    },

    {
      stage: 'proposal',
      name: 'Pricing Justification Script',
      type: 'call_script',
      content: `## Step: Acknowledge
"I hear you, {contact}, and I respect the question. You should absolutely understand where every dollar goes. Let me break this down."

Never get defensive about pricing. The question means they're interested — they just need the math to make sense.

### If: "That's more than I budgeted"
"I appreciate you being upfront about that. Let's figure out what makes sense — I'd rather build you something that works within your reality than oversell you something that creates stress."

### If: "Competitor X is cheaper"
"They probably are. And I want to respect your time, so let me be direct: we're not the cheapest option, and I don't try to be. Here's why that matters for {company}."

## Step: ROI Math
"Let's do the math on what this actually means for {company}:

Your average client is worth approximately $[X] to you, right?
And this investment is {estimated_value}.

So we need to bring you [Y] new clients to pay for the ENTIRE program. Just [Y] clients.

Everything after that — every additional lead, every new client, every referral they send — is pure profit on a system that's already paid for.

The question isn't 'can I afford this?' It's 'can I afford NOT to have a system bringing in clients while I sleep?'"

### If: They push back on the math
"What's your average client lifetime value? Let's use YOUR numbers. [Recalculate with their inputs.] Even on the conservative end, this pays for itself in [timeframe]."

## Step: Scope Breakdown
"Here's exactly what's included in {services} and why each piece matters:

[Walk through each service line item]

None of this is padding. Every item either drives traffic, converts leads, or retains clients. If I pulled any one piece out, the system gets weaker."

### If: "I don't think I need [specific service]"
"I understand why it might seem like that. Here's what [service] actually does in the context of the full system: [explain dependency]. Without it, [consequence]. But if you want to test that theory, we could phase it in later — I just want you to know what you'd be trading off."

## Step: Compare Alternatives
"Let me put this in perspective. Your three options right now are:

**Option 1: Do nothing.** {company} keeps relying on referrals. Some months are great, some are slow. You have no control over the flow. Over 12 months, the cost of missed leads is probably 5-10x what we're talking about.

**Option 2: DIY or hire someone cheap.** You spend 10-15 hours a week learning marketing, or you hire someone at half our rate who delivers half the results (or less). Most businesses that try this end up spending MORE in wasted time and failed experiments.

**Option 3: Invest in a proven system.** You pay {estimated_value} for a team that's done this before, with a guarantee attached. You get your time back AND a predictable pipeline."

### If: "That's more than I expected"
"Which option feels right for where {company} is headed? Because the cost of delay is real — every month without a system is a month of lost clients you'll never get back."

### If: "Competitor X is cheaper"
"I'd be curious what's actually included. In my experience, lower-priced agencies make it up in one of three ways: they use junior staff, they use templates instead of custom strategy, or they lock you into long contracts because they know results take longer. What's their guarantee look like?"

## Step: Adjust Scope (Never Price)
"If the full investment feels like a stretch right now, here's what I'd suggest — and I want to be clear, I'm not discounting. I'm adjusting scope.

**Phase 1** (months 1-3): We start with [core services] at [lower monthly]. This builds the foundation and proves the ROI.

**Phase 2** (months 4+): Once you're seeing results, we add [additional services] to compound the growth.

This way, you're investing less upfront, but you're still getting a real system — not a watered-down version."

### If: They ask for a straight discount
"I appreciate the ask, but I don't discount because I can't cut our team's effort and still deliver results. What I CAN do is adjust the scope so the investment matches your comfort zone while still moving {company} forward."

## Step: Re-Close
"So here's where we are: the math works, the plan is solid, and the guarantee removes your risk. The only question is whether we start now or push it to [next month/next quarter], knowing the cost of waiting is real.

What feels right for {company}?"

### If: They agree
"Great decision, {contact}. Let's get the paperwork moving — I'll have the agreement to you today."

### If: They need more time
"I respect that. Let's set a specific follow-up so this stays on track. What day works to reconnect?"`
    },

    // ─── FOLLOW_UP stage (6 new) ─────────────────────────────────────

    {
      stage: 'follow_up',
      name: 'Day 10: Value-Add Email',
      type: 'follow_up',
      content: `Subject: thought of {company} when I saw this

Hey {contact},

I came across something this week that made me think of {company}.

[Share one of the following — pick whichever is most relevant:]

**Option A — Industry stat:** A recent study found that {industry} businesses with [specific digital marketing element] see [X]% more inbound leads than those without. {company} is actually well-positioned to capitalize on this — a few tweaks would put you ahead of most competitors in {location}.

**Option B — Case study result:** We just finished a project with a {industry} business similar to {company}. They went from [X] leads/month to [Y] leads/month in 60 days by focusing on [specific strategy]. Thought you'd find the approach interesting.

**Option C — Competitor observation:** I noticed one of your competitors in {location} just [launched a new website / started running Google Ads / ramped up their review strategy]. It's worth knowing about — not to create panic, but because it tells you where the market is heading.

Figured I'd pass it along either way. No agenda, just genuinely thought it was relevant to what you're building.

If you're still thinking about the proposal, happy to chat anytime. And if you've moved on, no worries — I hope this was useful regardless.

Josh`
    },

    {
      stage: 'follow_up',
      name: 'Objection Handler — Price',
      type: 'objection',
      content: `## Step: Acknowledge
"I completely understand, {contact}. This is a real investment, and you should feel confident about where your money goes. Let's talk through this."

Never get defensive. Never apologize for pricing. Price resistance means they see value — they're just not sure it's worth THIS much yet.

## Step: Diagnose — Value Problem or Cash Problem?
"Help me understand — when you say the price is a concern, is it that {estimated_value} feels like more than what this is worth to {company}? Or is it more of a cash flow thing where you see the value but the timing of the investment is tough?"

This question is critical. A value problem and a cash problem have completely different solutions.

### If: "It's more than I budgeted"
"Got it — so you see the value, but the upfront number is a stretch. Let me show you a phased approach that spreads the investment while still getting you results from day one."

### If: "I'm not sure it's worth that much"
"Fair enough. That means I haven't done a good enough job showing you the ROI. Let me walk through the math again with YOUR numbers."

## Step: Reframe as ROI
"Let's look at this purely as math. What's your average client worth to {company} over their lifetime? [Let them answer.]

So at {estimated_value}, we need to bring you [calculate] clients to pay for the entire program. After that, every new client is profit on a system that's already paid for.

Now multiply that by 12 months. That's not a cost — it's the highest-ROI investment {company} can make right now."

## Step: Cost of Inaction
"Here's the other side of the equation that most people don't calculate: what does it cost {company} to NOT do this?

Every month without a predictable lead gen system is a month where you're leaving clients on the table. If you're missing just [X] leads per month at your close rate, that's $[Y] in lost revenue.

Over 6 months of 'thinking about it,' that's $[Z] you'll never get back. The cost of waiting is almost always higher than the cost of starting."

## Step: Adjust Scope (Not Price)
"Here's what I won't do: I won't discount. Because discounting means cutting corners, and cut corners don't produce results.

What I WILL do is adjust the scope. We can start with a focused Phase 1 — {services} at a lower monthly — that proves the concept. Once you see the ROI, we expand.

This way, your risk is lower, but you're still moving {company} forward with a real system, not a half-measure."

### If: "Competitor X is cheaper"
"They probably are. And I want to be straightforward: if price is the only factor, you should go with them. But if results matter — if you need this to actually work — then let's compare what's included. What does their guarantee look like? What happens when something breaks at 10pm? What's their track record in {industry}?"

## Step: Re-Close
"So here's where we are: the math works, the plan is built specifically for {company}, and we can phase the investment to match your comfort level. The only question is: do we start building this now, or do we wait and accept the cost of delay?

What makes sense for you, {contact}?"`
    },

    {
      stage: 'follow_up',
      name: 'Objection Handler — Timing',
      type: 'objection',
      content: `## Step: Acknowledge
"Totally fair, {contact}. Timing matters, and I don't want you to start something when {company} can't give it the attention it deserves. Let me ask a couple questions to see if we can find the right moment."

Never argue with timing. Validate it, then quantify the cost of waiting.

### If: "We're in our busy season"
"That actually makes sense to talk about this now. Let me explain why."

### If: "Maybe next quarter"
"Got it. Can I ask you something honest? What changes between now and next quarter?"

## Step: Quantify the Cost of Delay
"Here's what I want to make sure you're considering: every month without a system in place is a month of missed leads. Let's do quick math.

If {company} is missing just [X] new inbound leads per month right now, and your close rate is [Y]%, that's [Z] clients per month you're not getting.

At your average client value, that's $[amount] per month in lost revenue. Over the next [3/6] months of waiting, that adds up to $[total].

I'm not saying this to create pressure — I just want you to make the decision with full information."

## Step: Offer a Phased Start
"Here's an option that might solve the timing problem: instead of launching everything at once, we do a phased kickoff.

**Right now:** We start the foundational work — the stuff that takes time to build and doesn't require much from you. Website, SEO groundwork, system setup.

**In [X weeks]:** When things calm down, we layer on the active marketing — ads, outreach, the traffic-driving elements.

This way, when your slow season hits, the system is already built and ready to fill the pipeline. You're not starting from scratch when you need leads the most."

### If: "We're in a busy season"
"That's exactly when you should be building this. Right now you don't NEED leads, which means there's no panic. We can set up the system calmly, test it, and refine it. Then when the busy season ends and you need a pipeline, it's already running. The worst time to build a lead gen system is when you desperately need leads."

### If: "Maybe next quarter"
"Here's what I see happen 90% of the time: next quarter arrives, something else comes up, and it gets pushed again. Not because you don't want it, but because there's NEVER a perfect time. The businesses that grow fastest are the ones that start before they're ready. What would need to be true for you to feel comfortable starting now?"

## Step: Create Real Urgency
"I want to be honest with you, {contact}: your competitors in {location} are not waiting. Every month you delay is a month they're building their digital presence and capturing the clients that could be yours.

SEO takes 3-6 months to compound. Paid ads need data to optimize. Review strategies need time to build momentum. The earlier you start, the sooner {company} is in a position to dominate {industry} in {location}.

Six months from now, you'll wish you had started today."

## Step: Re-Close
"So here's what I'd suggest: let's pick a start date that works for your schedule, even if it's 2-3 weeks out. I'll begin the behind-the-scenes work now so nothing is wasted, and we ramp up active campaigns when you're ready.

Does that feel like a workable path for {company}?"`
    },

    {
      stage: 'follow_up',
      name: 'Objection Handler — Trust',
      type: 'objection',
      content: `## Step: Validate
"That's a completely reasonable concern, {contact}, and honestly, I respect you for raising it. Trust has to be earned, not assumed. Let me address this head-on."

Never dismiss trust concerns. They're usually rooted in a real past experience. Honor that.

### If: "Last agency ghosted us"
"I'm sorry to hear that. Unfortunately, that's more common than it should be in this industry. Tell me what happened — what did they promise, and where did it fall apart?"

### If: "How do I know this works?"
"You don't — yet. And anyone who guarantees results before understanding your business is lying. Here's what I CAN show you."

## Step: Differentiate
"Here's why working with TKBS is different from what you've experienced before:

**Accountability:** You'll have direct access to me — not a rotating account manager, not a junior assistant. I'm the one doing the strategy, and I'm the one you talk to.

**Transparency:** You'll see exactly what we're doing, when we're doing it, and what it's producing. Monthly reports with real numbers — not vanity metrics, but leads, calls, and revenue.

**Ownership:** Everything we build for {company} — the website, the content, the systems — you own it. If we part ways, you keep it all. No hostage-holding.

**Communication:** We have a set cadence for check-ins, and I respond to messages within [X hours]. If you feel like you're being ghosted, something is seriously wrong and we fix it immediately."

### If: "Last agency ghosted us"
"Here's specifically how we prevent that: weekly status updates (even when there's nothing exciting to report), a shared project dashboard you can check anytime, and a 30-day out clause. If we're not performing, you can walk. That keeps us honest."

## Step: Proof Stack
"Don't take my word for it. Here's what you can verify:

**Case studies:** [Reference 2-3 specific results with numbers — industry, location, outcome]

**Client references:** I'll connect you with [X] current clients in {industry} or similar industries. Ask them anything.

**Our own marketing:** Look at how TKBS shows up online. We practice what we preach. If we can't market ourselves, we have no business marketing {company}.

**Guarantee:** We put our money where our mouth is. If we don't deliver [specific outcome] within [timeframe], [specific consequence — refund, free month, etc.]."

### If: "How do I know this works?"
"Here's a specific example: [Client name/industry] came to us in a similar situation — [describe the starting point]. Within [timeframe], they were [specific result]. I'll send you the full case study and connect you with them directly if you want."

## Step: Guarantee
"At the end of the day, the guarantee removes your risk. Here's how it works:

We commit to [specific deliverables and outcomes] within [timeframe]. If we fall short, [specific remedy].

You're not betting on us. You're betting on a guarantee-backed plan with a team that's done this before. If it doesn't work, you're protected. If it does work, {company} wins."

## Step: Re-Close
"I know trust takes time, {contact}, and I'm not asking you to trust blindly. I'm asking you to evaluate the evidence: the case studies, the references, the guarantee, and the plan itself.

Given all of that — does it feel like enough to take the next step? And if not, what else would you need to see?"`
    },

    {
      stage: 'follow_up',
      name: 'Objection Handler — DIY',
      type: 'objection',
      content: `## Step: Acknowledge
"I respect that, {contact}. The fact that you've been handling {company}'s marketing yourself tells me you're resourceful and you care about the business. That's exactly the kind of owner we love working with."

Never insult their DIY efforts. They built {company} — show respect for that.

### If: "I've been doing my own marketing"
"That takes real commitment. How's it been going? What's working and what's been frustrating?"

### If: "I have a nephew/friend who does websites"
"That's great that you have someone you trust. What have they built for {company} so far?"

## Step: Opportunity Cost
"Here's the question I want you to think about, and it's not a trick: What is YOUR time worth per hour?

If you're the owner of {company}, your time is worth $[estimate based on their revenue] per hour — at minimum. Every hour you spend on marketing is an hour you're NOT spending on:
- Closing deals
- Serving clients
- Managing your team
- Growing {company} strategically

If marketing takes you 10-15 hours per week (and to do it properly, it does), that's $[X] per week in opportunity cost. That's more than what you'd pay us to do it better, faster, and without pulling you away from what only YOU can do."

### If: "I've been doing my own marketing"
"And how's that working? Honestly. Are you getting the results you want? Because most business owners I meet are working incredibly hard on marketing and getting mediocre results — not because they're not smart enough, but because marketing is a full-time discipline and they're trying to do it part-time."

## Step: Expertise Gap
"No disrespect, but here's the reality: digital marketing in 2026 is not the same as it was even 2 years ago. The algorithms change constantly, the tools evolve, the strategies that worked last year don't work this year.

We spend 40+ hours a week doing nothing but this. We know which strategies work for {industry} businesses in markets like {location} because we've tested them — with our money and our clients' money.

It's the same reason you don't do your own legal work or accounting. You COULD learn it, but the cost of learning (and the cost of mistakes along the way) is higher than just hiring an expert."

### If: "I have a nephew/friend who does websites"
"I've seen this play out many times, and I want to be honest with you: there's a big difference between someone who CAN build a website and someone who builds websites that GENERATE LEADS.

A pretty website that doesn't convert is an expensive business card. What {company} needs isn't just a site — it's a lead generation system with conversion optimization, SEO, automated follow-up, and ongoing improvement. That's a different skill set."

## Step: Speed Advantage
"The other factor is speed. If you try to learn and implement all of this yourself, you're looking at 6-12 months of trial and error before you start seeing real results. And during that time, you're losing leads to competitors who already have systems in place.

We can have a system live for {company} in [X weeks]. That's [Y months] of head start on the DIY approach. At [Z] leads per month, that head start is worth $[amount] in revenue you'd otherwise miss."

## Step: Re-Close
"Here's how I think about it, {contact}: your superpower is running {company}. Our superpower is building marketing systems that bring you clients. When you let us each do what we're best at, {company} grows faster than either of us could achieve alone.

The proposal is designed to free up your time AND produce better results than doing it yourself. Can we at least look at the numbers side by side and see if the math makes sense?"`
    },

    {
      stage: 'follow_up',
      name: 'Objection Handler — Need to Think',
      type: 'objection',
      content: `## Step: Acknowledge
"Totally fair, {contact}. This is a real decision and I wouldn't want you to rush into anything you're not comfortable with. I respect that."

Never make them feel bad for wanting to think. But don't let it become a polite rejection either.

### If: "I need to talk to my partner"
"Of course. They should absolutely be part of this decision. Let me help make that conversation easier."

### If: "Let me sleep on it"
"No problem. Can I ask one quick question before we wrap up?"

## Step: Isolate the Real Concern
"Before we wrap up, can I ask you something honestly? When you say you need to think about it, what specifically is the thing you need to think through?

Is it:
- **The investment** — whether {estimated_value} is the right number?
- **Whether it'll work** — do you have doubts about the results?
- **The timing** — is now the right moment for {company}?
- **Trust** — do you need more proof that we can deliver?
- **Something else** I haven't addressed?

I'm not asking to pressure you. I'm asking because if there's a real concern, I'd rather address it now while we're talking than have it sit unanswered."

### If: "I need to talk to my partner"
"What do you think your partner will be most concerned about? Let me give you the answers now so you're prepared for that conversation. Better yet — would it be helpful to schedule a quick 15-minute call with all of us? That way they can ask me directly instead of you having to relay everything."

### If: "Let me sleep on it"
"I respect that. Here's my one concern: in my experience, when someone says 'let me think about it,' it usually means there's a specific question I haven't answered. And if I don't address it now, it'll just nag at you tonight. What's the one thing that would make this a clear yes?"

## Step: Address the Real Concern
Once they name the specific concern, handle it directly:

**If it's money:** "Let's revisit the ROI math. At {estimated_value}, how many new clients do we need to deliver before this pays for itself? [Do the math with them.] Does the investment make sense at those numbers?"

**If it's trust:** "I get it. Here's what I'll do: I'll send you [case study/reference/guarantee details] tonight. Take a look, and if it checks out, we move forward. If it doesn't, no hard feelings."

**If it's timing:** "What changes between now and when you'd be 'ready'? The cost of every month you wait is [quantify]. What if we started small now and scaled later?"

**If it's the solution:** "What part doesn't feel right? Let me adjust the plan to fit what you actually need."

## Step: Two Decisions Reframe
"Here's something that might help clarify your thinking, {contact}. You actually have two separate decisions to make:

**Decision 1:** Do you believe {company} needs a better marketing system? That if you had a predictable pipeline of new {industry} clients, it would meaningfully grow your business?

**Decision 2:** Are we the right team to build it?

Most people who say 'let me think about it' have already made Decision 1. It's Decision 2 they're unsure about. And for Decision 2, here's what I can offer: our guarantee. If we don't deliver, you're protected. That removes the risk and makes Decision 2 much simpler."

## Step: Re-Close with Specifics
"So here's what I'd suggest: instead of leaving this open-ended, let's set a specific time to reconnect. How about [specific day/time]? That gives you time to [think/talk to partner/review materials], and it gives me a chance to answer any final questions.

If you come back and say 'not right now,' I'll totally respect that. But at least we'll have a real conversation instead of things just going quiet. Does [day/time] work?"

### If: They agree to a follow-up time
"Perfect. I'll send a calendar invite right now. And {contact} — if any questions come up between now and then, text or call me directly. I'd rather answer questions than wonder what you're thinking."

### If: They still hedge
"I hear you. I'm going to send you a quick summary of what we discussed, the proposal, and the guarantee details. Take a look when you have a chance. And if I don't hear from you by [specific date], I'll follow up once. No pressure, just making sure you have everything you need to decide."`
    },

    // ─── CLOSED_WON stage (2 new) ────────────────────────────────────

    {
      stage: 'closed_won',
      name: 'Onboarding Checklist',
      type: 'checklist',
      content: `# Welcome to TKBS — Onboarding Checklist for {company}

Congratulations on taking this step, {contact}! Here's everything we need to get started building {company}'s growth engine. We've broken it into simple sections so nothing gets missed.

# What We Need From You
These items help us move fast. The sooner we have them, the sooner results start flowing.

- [ ] Website login credentials (CMS admin access — WordPress, Wix, Squarespace, etc.)
- [ ] Google Business Profile access (owner or manager permissions)
- [ ] Google Analytics access (if it exists — we'll set it up if not)
- [ ] Social media login credentials (Facebook, Instagram, LinkedIn — whatever {company} uses)
- [ ] Logo files (PNG with transparent background + vector/SVG if you have it)
- [ ] Brand colors and fonts (if you have a style guide, perfect — if not, we'll work from your existing materials)
- [ ] High-quality photos of your team, workspace, and work (10-20 photos minimum)
- [ ] List of services/products with descriptions and pricing
- [ ] Current client testimonials or reviews you're proud of
- [ ] Brief goals document: Where do you want {company} to be in 6 and 12 months?

# What to Expect
Here's how the first 30 days unfold so there are no surprises.

- [ ] **Week 1:** Kickoff meeting, asset collection, research and strategy finalization
- [ ] **Week 2:** Foundation buildout begins — {services} development starts
- [ ] **Week 3:** First deliverables for your review and feedback
- [ ] **Week 4:** Launch Phase 1, tracking and measurement confirmed, first optimization
- [ ] **Communication cadence:** [Weekly/Bi-weekly] check-ins via [call/email/Slack]
- [ ] **Response time:** All messages answered within [X hours] during business days
- [ ] **Monthly report:** You'll receive a detailed performance report by the [X]th of each month

# Important Dates
- [ ] Kickoff meeting: [date/time] — calendar invite sent
- [ ] Asset deadline (all items above): [date — 5 business days from kickoff]
- [ ] Phase 1 launch target: [date — approximately 3 weeks from kickoff]
- [ ] First performance review: [date — 30 days from launch]

# Your Package: {package_type}
Services included: {services}
Investment: {estimated_value}

Questions about anything above? Reply to this email or text Josh directly at [phone number]. We're excited to get started!`
    },

    {
      stage: 'closed_won',
      name: 'Kickoff Meeting Agenda',
      type: 'call_script',
      content: `## Step: Welcome & Introductions
"Hey {contact}, welcome to the team! I'm genuinely excited about this — let's build something great for {company}.

This is our kickoff meeting, so here's what we'll cover today:
1. Make sure we're aligned on goals
2. Confirm the scope and timeline
3. Collect any remaining assets
4. Set up our communication rhythm
5. Lay out the very next steps

Sound good? Any questions before we dive in?"

### If: Multiple people on the call
"First, let's do quick intros. I know {contact}, but I'd love to hear from everyone — your name, your role at {company}, and the one thing you're most hoping we accomplish."

### If: Client seems nervous or uncertain
"I know starting something new can feel like a leap. I want you to know: you made a great decision. The work we're about to do is going to change how {company} gets clients. Let's get into it."

## Step: Goal Alignment
"Let's start with the big picture. When we talked during the discovery phase, you mentioned that {company}'s goals were [reference call notes].

Is that still accurate? Has anything changed or become clearer since we last spoke?"

"Specifically, I want to nail down:
- What does success look like in 90 days?
- What does success look like in 6 months?
- Are there any specific numbers — leads per month, revenue targets, new clients — that we should be aiming for?"

### If: Goals are vague
"Let me help put numbers on this. Based on {industry} benchmarks and what we've done for similar businesses, I'd suggest we target [X] new leads per month within 90 days, growing to [Y] by month 6. Does that feel right?"

### If: Goals are ambitious
"Love the ambition. Let me be real about what's achievable in each phase so we set expectations we can beat, not just meet. Here's what I'd suggest for milestones..."

## Step: Scope Confirmation
"Let's confirm exactly what we're building. Your package — {package_type} — includes:

{services}

Here's the order we'll tackle these:
1. [First priority — usually website/foundation]
2. [Second priority — usually content/SEO setup]
3. [Third priority — usually paid traffic/active campaigns]

Any questions about what's included or the sequence?"

### If: "Can we add [something not in scope]?"
"Great idea. That's not in the current scope, but it's something we can absolutely layer in. Let me note it for Phase 2 and we'll discuss adding it once the foundation is performing."

## Step: Timeline Review
"Here's the timeline we're working with:

**Week 1 (this week):** I'll finalize research, complete the strategy document, and begin any technical setup that doesn't require your assets.

**Week 2-3:** Core buildout — this is where the heavy lifting happens on our end. You'll see drafts and previews for feedback.

**Week 3-4:** Launch Phase 1 elements, install tracking, and start measuring.

**Month 2-3:** Optimize based on data, ramp up traffic, and start seeing the pipeline fill.

I'll keep you updated throughout, but the key dates for YOU to remember are:
- Assets due: [date]
- First draft review: [date]
- Launch day: [date]

We're going to move fast. You ready?"

## Step: Asset Collection
"Alright, let's talk about what I need from you. Some of this you may have already sent, some might be new:

- Website and Google access credentials
- Logo files and any brand materials
- Photos of your team and work
- List of services with descriptions
- Favorite testimonials from your best clients

I sent over the full onboarding checklist — did you get a chance to look at it? What do you already have ready?"

### If: They're overwhelmed by the list
"Don't stress about this — I know it looks like a lot. The most important things are the logins and logo. Everything else, we can gather over the next few days. I'll send you a simple link to upload everything."

### If: They don't have logos/brand assets
"No problem at all. We'll work with what you have. If you need a brand refresh, that's something we can discuss for Phase 2."

## Step: Communication Setup
"Last thing before next steps — let's set up how we communicate:

**Check-ins:** I'll schedule [weekly/bi-weekly] calls — 15-20 minutes, quick and focused. What day and time works best for you?

**Day-to-day:** What's your preferred channel — email, text, phone? I want to make sure when you have a question, you know exactly how to reach me.

**Reporting:** You'll get a monthly performance report by the [X]th. I'll also give you access to a dashboard where you can see real-time metrics anytime.

**Feedback turnaround:** When I send you something for review, I'll need feedback within [48 hours] to keep us on schedule. Can you commit to that?"

## Step: Next Steps
"Here's what happens right after this call:

**Me:**
- Finalize strategy document (you'll see it within [X days])
- Begin technical setup and foundational work
- Send calendar invites for our check-in rhythm

**You:**
- Send over the assets from the onboarding checklist by [date]
- Review and approve the strategy document when I send it
- Get excited — this is going to be fun

{contact}, thank you for trusting {company}'s growth to us. We take that seriously. You're going to love what we build together.

Any final questions before we wrap up?"

### If: No questions
"Perfect. I'll get started today. You'll hear from me within [X hours/days] with the first update. Welcome aboard!"

### If: They have concerns
Address each one directly. Never rush out of a kickoff call with unresolved concerns — the client just committed money and needs to feel confident in that decision.`
    },

    // ─── Original 11 templates (for reference completeness) ──────────

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

  // 1. Query existing templates
  const existingRows = db.prepare('SELECT stage, name FROM script_templates').all();
  const existingKeys = new Set(existingRows.map(r => `${r.stage}::${r.name}`));

  // 2. Find max sort_order per stage so new ones go after existing
  const maxOrderRows = db.prepare(
    'SELECT stage, MAX(sort_order) as max_order FROM script_templates GROUP BY stage'
  ).all();
  const maxOrderByStage = {};
  for (const row of maxOrderRows) {
    maxOrderByStage[row.stage] = row.max_order;
  }

  // 3. Figure out which templates to insert
  const toInsert = [];
  // Track per-stage counters for new sort_order values
  const stageCounters = {};

  for (const t of allTemplates) {
    const key = `${t.stage}::${t.name}`;
    if (!existingKeys.has(key)) {
      // Start after the current max sort_order for this stage
      if (!(t.stage in stageCounters)) {
        stageCounters[t.stage] = (maxOrderByStage[t.stage] ?? -1) + 1;
      }
      toInsert.push({ ...t, sort_order: stageCounters[t.stage] });
      stageCounters[t.stage]++;
    }
  }

  // 4. Insert in a transaction
  if (toInsert.length > 0) {
    const insert = db.prepare(
      'INSERT INTO script_templates (stage, name, type, content, sort_order) VALUES (?, ?, ?, ?, ?)'
    );
    const transaction = db.transaction(() => {
      for (const t of toInsert) {
        insert.run(t.stage, t.name, t.type, t.content, t.sort_order);
      }
    });
    transaction();
  }

  return {
    added: toInsert.length,
    skipped: allTemplates.length - toInsert.length,
    total: allTemplates.length,
  };
}

module.exports = { seedScriptTemplates, seedMissingScriptTemplates };
