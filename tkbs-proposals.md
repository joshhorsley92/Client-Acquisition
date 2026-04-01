Generate TKBS marketing proposals for prospective clients. Use this skill whenever the user asks to create, build, or draft a proposal, quote, pitch, or engagement document for a client or prospect. Also trigger when the user mentions "proposal", "quote", "Boost", "Launch", "pitch deck", or any client name in the context of pricing or scoping services. This skill handles the full proposal lifecycle: gathering client info, selecting the right package structure, generating the branded docx with proper formatting, and outputting PDF. Always read this skill before generating any proposal document.TKBS Proposal Generation Skill
Generate branded, professionally formatted marketing proposals for TKBS clients.
Proposals are built with docx-js and converted to PDF via LibreOffice.
Before building any proposal, read the reference file at references/proposal-template.md
for the complete build script template and formatting patterns.

1. Proposal Types
TKBS offers two engagement models. Every proposal uses one or both:
Boost (Ongoing Partnership)

What it is: Managed marketing system with setup + monthly retainer
Structure: Core System (required) + One-Time Add-Ons (optional) + Monthly Add-Ons (optional)
Core System always includes: Marketing Strategy & Roadmap, Email Platform & Automation, Landing Page, and Meta Ads (recommended)
Typical pricing: $3,000–$6,000 setup / $1,000–$2,500/mo retainer
Engagement term: 6-month initial commitment, 30-day written notice after

Launch (One-Time Build — Fixed Pricing)

What it is: Complete marketing system built and handed off — no ongoing retainer
Structure: Fixed package of one-time deliverables (not customizable per client)
Always includes: Landing Page ($1,000), Basic Ads Setup with 1 month management + first month ads FREE ($1,300), Email Platform Setup + Welcome Automation ($1,250)
Fixed pricing: $3,550 $3,000 one-time (discount always shown)
Positioning: "We build it, run it for a month, and then you own it."
Ad spend: Billed directly to client after free first month

Combined Proposals
When a prospect has multiple businesses (e.g., Stain Shop + Car Wash), the primary business gets a full Boost proposal and the secondary gets a Launch appendix page at the end.

2. Proposal Intake Questionnaire
Do not build until all 5 stages are complete. Walk through each stage in order using the
appropriate input method (open-ended for text, ask_user_input_v0 for selections). Every
pricing question must include a "Custom — I'll specify" option and allow overrides outside
the suggested range.

Stage 1: Client Info (open-ended)
Ask the following as a single open-ended prompt. Do NOT use clickable widgets for this stage.

Tell me about the client:

Client name (the person you're pitching to)
Business name(s) — if multiple, list all
Location (city, state)
Industry / business type
Revenue streams (e.g., "local services + retail + e-commerce" or "single location car wash")
What marketing do they currently have? (website, email, ads, social, nothing?)
What's their primary goal? (e.g., "more local leads", "membership growth", "online sales")
Anything else I should know? (budget sensitivity, competitor concerns, urgency, etc.)



Stage 2: Package Type (clickable)
Based on client info, ask:
Question 1: "What type of engagement?"

Options: Boost (ongoing partnership), Launch (one-time build), Both — Boost primary + Launch secondary

If "Both":
Question 2: "Which business gets the Boost and which gets the Launch?"

Options: List each business name as [Business] = Boost or [Business] = Launch


Stage 3: Service Selection (clickable, branched by package type)
If Boost was selected:
Question 3a — Core System Services (multi-select):
"Which services should be in the Boost Core System?"

Landing Page — typically included
Meta Ads — recommended for traffic
Marketing Strategy & Roadmap
Email Platform & Automation
Popup & Lead Capture — or move to add-ons

Question 3b — Meta Ads positioning:
"How should Meta Ads appear in the core table?"

Included in core (baked into total)
Recommended add-on (amber row, optional)
Not shown in core — monthly add-on only

Question 3c — One-Time Add-Ons to include (multi-select):
"Which one-time add-ons should appear in the proposal?"

Website Refresh — WordPress ($2,000–$4,000)
Website Migration — Shopify ($3,000–$5,000)
Additional Landing Page ($750–$1,500/ea)
Popup & Lead Capture ($500–$1,000) — if not in core
Additional Email Flow ($500–$1,000/ea)
None

Question 3d — Monthly Add-Ons to include (multi-select):
"Which monthly add-ons should appear?"

Meta Ads ($500–$1,000 setup / $400–$750/mo) — if not in core
Google Business Profile ($300–$600 setup / $150–$300/mo)
SMS Marketing ($200–$400 setup / $100–$300/mo)
Review Generation ($300–$500 setup / $150–$250/mo)
None

If Launch was selected:
The Launch package is a fixed, standardized product. Do NOT ask which services to include
or how to price them — the scope and pricing are always the same:
ServicePriceLanding Page$1,000Basic Ads Setup (incl. 1 mo management + first month ads FREE)$1,300Email Platform Setup + Welcome Automation$1,250Total$3,550 $3,000
Question 3e — Launch confirmation:
"The Launch package is a fixed $3,000 one-time build (shown as $3,550 $3,000). It includes
a landing page, basic ads setup with 1 month free ad spend, and email platform with welcome
automation. Confirm or tell me if you want to adjust anything."

Confirmed — use standard Launch pricing
I want to adjust — let me explain


Stage 4: Pricing (clickable with custom override)
For EVERY service selected in Stage 3, ask pricing using clickable options. Always include
a "Custom — I'll specify" option. Group into batches of 2-3 questions per turn to avoid
overwhelming the user.
Boost Core pricing pattern:
For each core service, ask TWO questions:
"[Service] — Setup cost?"
Options based on service type (use ranges from Section 7):

Low end of range (e.g., $750)
Mid range (e.g., $1,000)
High end (e.g., $1,500)
Custom — I'll specify

"[Service] — Monthly retainer?"

Low/mid/high from range
Included (no monthly) — for landing pages, popups
Custom — I'll specify

Value stack / discount questions:
After all individual pricing, ask:
"Any strikethrough pricing to show? (value stack)" (multi-select)

Yes — show original higher price crossed out on specific services
Yes — show crossed-out total with discounted total
No strikethroughs

If yes, ask which services get strikethroughs and what the "original" price was.
"Any free value adds?" (multi-select)

First month of ads FREE ($X value)
Free audit or strategy session
Setup discount (show crossed-out total)
None
Custom — I'll describe

Launch pricing:
Launch pricing is fixed — do NOT ask pricing questions for Launch services. The total is
always $3,550 $3,000 with the standard line items. Skip Stage 4 entirely for Launch
unless the user said "I want to adjust" in Stage 3e.

Stage 5: Guarantee & Final Details (clickable)
Question 5a — Guarantee:
"Which guarantee for this proposal?"

The Ads Must Pay Guarantee — use when Meta Ads are included. Covers: strategy first, fund first $500 in ad spend, data-driven optimization, 1× ROAS commitment, long-term growth focus.
The No-Stall Guarantee — use when no ads. Monthly reporting, full audit + 90-day plan on demand.
Custom — I'll describe
No guarantee section

Question 5b — Additional Opportunities:
"Any 'Additional Opportunities' to tease at the end?" (multi-select)

Monthly services for [secondary business] — if Launch was included
B2B Contractor Outreach
Website redesign / migration — if not already in add-ons
Custom — I'll describe
None

Question 5c — Comparison table:
"Include the Core vs. Full Engagement comparison table?"

Yes
No — keep it simple

Question 5d — Final review:
Present a summary of all selections and pricing, then ask:

"Here's what I'm building — confirm or tell me what to change before I generate."

Show:

Client name / business / location
Package type(s)
Core services with setup + monthly
Core total (setup / monthly)
Add-ons listed
Guarantee type
Any strikethroughs or free value adds

Only proceed to build after explicit confirmation.

3. Document Structure
Every proposal follows this page flow. Sections can be omitted if not applicable.
Page 1: Cover

TURNKEY BUSINESS SOLUTIONS (spaced, mint, bold)
"Marketing Proposal" (60pt, charcoal, bold)
Mint rule line
Prepared for: Client Name, Business Name (mint), Location
Prepared by: Josh Horsley · Founder, TKBS
info@tkbsmarketing.com
Date (Month Year)

Page 2+: How This Works + Core System

"How This Works" section heading
Phase 1 / Phase 2 explanation table (charcoal/light gray)
"[Business Name] — Boost Core System" section heading
Two-pillar intro text + legend
Core System table with checklist items, pillar borders, pricing

Comparison Page: Core vs. Full Engagement

Side-by-side checklist (✓, ✓*, —, X)
Pillar left borders
Price summary rows at bottom

Add-Ons Page(s): One-Time + Monthly

Each with legend, pillar borders, checklist items
Value one-liners in italic under add-on name

Guarantee Section

Full guarantee text (Ads Must Pay or No-Stall)

Terms & Next Steps

Engagement Term (6-month commitment, 30-day notice)
What We Need From You
Ready to Discuss Next Steps?
Josh signature block

Launch Appendix (if applicable)

Own header ("Launch Package · [Business]")
Mint banner title
Intro paragraph: "The Launch Package is TKBS's approach to marketing with a partner that requires initial setup and optimization toward a single goal."
Legend + pillar-bordered checklist table with fixed pricing
Total row always shows $3,550 $3,000 strikethrough
"First Month of Ads is FREE ($500 value)" shown in Basic Ads checklist
Ad Spend note: billed directly to client after free first month
"What's Next?" upsell to monthly management


4. Visual Formatting System
Brand Colors (hex without #)
NameHexUseCharcoal1B2838Headers, body text, retain pillar borderMint00D4AAAccents, acquire pillar border, CTAs, checkmarksLight MintE6FAF5Price row backgroundsLight GrayF5F5F5Alternating row shadingMid GrayE0E0E0Thin bordersWhiteFFFFFFDefault backgroundsAmberFFF3E0Recommended row backgroundAmber BorderE6A817Recommended tag text
Two-Pillar System
Every service table uses color-coded left borders:

Mint thick left border (size 18): Get New Customers (Landing Page, Ads, Popup, Website, GBP)
Charcoal thick left border (size 18): Convert & Retain (Strategy, Email, SMS, Review Gen, Flows)
Legend appears above every table: █ Get New Customers  █ Convert & Retain Customers

Checklist Format
All "What's Included" columns use checkmarks, not paragraphs:
✓  Item description here
✓  Another item
✓  Third item
Checkmarks are mint, bold, size 19. Item text is charcoal, size 19.
Recommended Row Treatment

Background: Amber (FFF3E0)
Left border: Mint (acquire pillar — NOT amber)
Service name cell includes "RECOMMENDED" tag below name in amber bold
Footnote below table explains the recommendation

Strikethrough Value Stack
Show original price struck through in gray, new price in charcoal:
$2,500  $1,750 setup    (where $2,500 is strikethrough gray)
Section Headings

Charcoal background bar with white text
Mint underline rule below

Table Headers

Charcoal background, white text, no visible borders on top/sides

Headers & Footers

Header: "TURNKEY BUSINESS SOLUTIONS" (spaced) + right-aligned "Marketing Proposal · [Business]"
Footer: "info@tkbsmarketing.com · tkbsmarketing.com" + right-aligned "Page X"
Both separated by mint rule lines


5. Comparison Table Symbols
SymbolMeaning✓ (mint)Included✓* (amber)Recommended add-on (optional)— (gray)Available as add-onXNot included in this tier / not applicable

6. Build Process

Gather info using the checklist in Section 2
Read references/proposal-template.md for the full docx-js build script
Customize the template with client-specific data
Build with node build-proposal.js
Validate with python /mnt/skills/public/docx/scripts/office/validate.py
Convert with python /mnt/skills/public/docx/scripts/office/soffice.py --headless --convert-to pdf
QA with pdftoppm -jpeg -r 200 and visually inspect every page
Output both .docx and .pdf to /mnt/user-data/outputs/

Critical Build Rules

Always use docx-js (installed globally via npm)
US Letter: 12240 x 15840 DXA, 1440 DXA margins (1 inch)
Content width: 9360 DXA
Font: Arial throughout
ShadingType.CLEAR (never SOLID)
WidthType.DXA (never PERCENTAGE)
Table columnWidths must sum to content width
Cell width must match corresponding columnWidth
Section breaks force new pages — merge sections to avoid orphan pages
No rocket icons on closing slides/pages


7. Service Catalog Reference
Boost Core Services (typical)
ServicePillarTypical SetupTypical MonthlyLanding PageAcquire$750–$1,500IncludedPopup & Lead CaptureAcquire$500–$750IncludedMeta AdsAcquire$500–$1,000$400–$750/moMarketing StrategyRetain$750–$1,500$150–$300/moEmail Platform & AutomationRetain$1,500–$3,000$800–$1,500/mo
One-Time Add-Ons (typical)
Add-OnPillarTypical PriceWebsite Refresh (WordPress)Acquire$2,000–$4,000Website Migration (Shopify)Acquire$3,000–$5,000Additional Landing PageAcquire$750–$1,500/eaPopup & Lead CaptureAcquire$500–$1,000Additional Email Flow (3 emails)Retain$500–$1,000/ea
Monthly Add-Ons (typical)
Add-OnPillarTypical SetupTypical MonthlyMeta AdsAcquire$500–$1,000$400–$750/moGoogle Business ProfileAcquire$300–$600$150–$300/moSMS MarketingRetain$200–$400$100–$300/moReview GenerationRetain$300–$500$150–$250/mo
Launch Package (fixed pricing)
The Launch package is a standardized, repeatable product with fixed pricing. Do not adjust
these prices per client — the scope is the same every time.
ServicePillarFixed PriceIncludesLanding PageAcquire$1,000Conversion-focused, mobile-optimized, integrated with emailBasic Ads SetupAcquire$1,300Pixel, 1 audience, 1 campaign, 1 month management, first month ads FREE ($500 value)Email Platform Setup + AutomationRetain$1,250Platform onboarding, domain auth, landing page integration, welcome email automationLaunch Total$3,550 $3,000One-time investment. Client owns the system.
The $550 discount is always shown as a strikethrough on the total row.
Ad spend is billed directly to the client after the free first month.
Boost pricing is a reference range — always confirm exact numbers with Josh before building.

8. Guarantee Templates
The Ads Must Pay Guarantee (Boost w/ Ads)
Five-step guarantee: Strategy Before Spend → Fund First $500 → Data-Driven Optimization → 1× ROAS commitment (waive management fees until met) → Long-Term Growth Focus. Include note: "Full guarantee terms outlined in attached document."
The No-Stall Guarantee (Boost w/o Ads)
Monthly performance reports. If marketing isn't moving forward, full audit + revised 90-day growth plan at no cost. "Your growth is our job. We take that seriously."

9. Adapting for Different Clients
When building for a new client, adapt these elements:

Cover: Client name, business name, location
Header: Business name in right-aligned header text
Core System title: "[Business Name] — Boost Core System"
Service descriptions: Match the client's industry and goals
Checklist items: Customize flows, audiences, campaign types to the business
Pillar assignments: Most services stay the same; use judgment for edge cases
Comparison table: Reflect what's actually in Core vs. what Full would include
Add-ons: Include only what's relevant to this client
Guarantee: Pick based on whether ads are included
Launch appendix: Only if there's a secondary business

Always ask before building. Never assume pricing — get exact numbers from Josh.