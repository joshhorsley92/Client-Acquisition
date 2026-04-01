TKBS Proposal Build Template
This file contains the docx-js code patterns for building TKBS proposals.
Copy and adapt these patterns for each new client proposal.
Table of Contents

Setup & Constants
Helper Functions
Core System Table
Comparison Table
One-Time Add-Ons Table
Monthly Add-Ons Table
Launch Table
Document Assembly


Setup & Constants <a id="setup"></a>
javascriptconst fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, BorderStyle, WidthType, ShadingType,
  VerticalAlign, PageNumber, TabStopType
} = require("docx");

// Brand colors (hex without #)
const C = "1B2838";      // Charcoal - headers, body, retain border
const M = "00D4AA";      // Mint - accents, acquire border, checkmarks
const LM = "E6FAF5";     // Light Mint - price row bg
const LG = "F5F5F5";     // Light Gray - alternating rows
const MG = "E0E0E0";     // Mid Gray - thin borders
const W = "FFFFFF";       // White
const AM = "FFF3E0";     // Amber - recommended row bg
const AB = "E6A817";     // Amber Border - recommended tag

const CHK = "\u2713";    // ✓ checkmark
const DSH = "\u2014";    // — em dash

// Page dimensions (US Letter)
const PW = 12240, PH = 15840, MR = 1440;
const CW_ = PW - 2 * MR; // Content width: 9360

// Border presets
const nb = { style: BorderStyle.NONE, size: 0, color: W };
const tb = { style: BorderStyle.SINGLE, size: 1, color: MG };
const tbs = { top: tb, bottom: tb, left: tb, right: tb };
const nbs = { top: nb, bottom: nb, left: nb, right: nb };

// Pillar borders (thick left stripe)
const acqB = { style: BorderStyle.SINGLE, size: 18, color: M };
const retB = { style: BorderStyle.SINGLE, size: 18, color: C };

function pb(type) {
  return { top: tb, bottom: tb, left: type === "acquire" ? acqB : retB, right: tb };
}

Helper Functions <a id="helpers"></a>
Layout helpers
javascriptfunction sp(pts = 200) {
  return new Paragraph({ spacing: { before: pts, after: 0 }, children: [] });
}

function sh(text) {
  // Section heading: charcoal bar + mint underline
  return [
    new Paragraph({
      spacing: { before: 300, after: 0 },
      shading: { type: ShadingType.CLEAR, fill: C },
      children: [new TextRun({ text: "  " + text, bold: true, font: "Arial", size: 26, color: W })]
    }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: M, space: 1 } },
      spacing: { before: 0, after: 200 }, children: []
    })
  ];
}

function bt(text, opts = {}) {
  return new Paragraph({
    spacing: { before: opts.before || 0, after: opts.after || 120, line: 276 },
    alignment: opts.align || AlignmentType.LEFT,
    children: [new TextRun({ text, font: "Arial", size: 22, color: C, ...opts.run })]
  });
}

function mr(runs, opts = {}) {
  // Multi-run paragraph
  return new Paragraph({
    spacing: { before: opts.before || 0, after: opts.after || 120, line: 276 },
    alignment: opts.align || AlignmentType.LEFT,
    children: runs.map(r => new TextRun({ font: "Arial", size: 22, color: C, ...r }))
  });
}

function suh(text) {
  return new Paragraph({
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, font: "Arial", size: 24, color: C })]
  });
}
Checklist paragraphs
javascriptfunction cl(items) {
  return items.map((it, i) => new Paragraph({
    spacing: { before: i === 0 ? 0 : 20, after: i === items.length - 1 ? 0 : 20, line: 240 },
    children: [
      new TextRun({ text: CHK + "  ", font: "Arial", size: 19, color: M, bold: true }),
      new TextRun({ text: it, font: "Arial", size: 19, color: C })
    ]
  }));
}
Legend
javascriptfunction legend() {
  return new Paragraph({
    spacing: { before: 0, after: 100 },
    children: [
      new TextRun({ text: "\u2588 ", font: "Arial", size: 20, color: M }),
      new TextRun({ text: "Get New Customers    ", font: "Arial", size: 19, color: C }),
      new TextRun({ text: "\u2588 ", font: "Arial", size: 20, color: C }),
      new TextRun({ text: "Convert & Retain Customers", font: "Arial", size: 19, color: C })
    ]
  });
}
Pricing with strikethroughs
javascript// Each line is an array of {text, strike?, bold?, size?, color?}
function priceRuns(lines) {
  return lines.map((l, i) => new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: i < lines.length - 1 ? 20 : 0 },
    children: l.map(r => new TextRun({
      text: r.text,
      font: "Arial",
      size: r.size || 20,
      color: r.color || C,
      bold: r.bold || false,
      strikethrough: r.strike || false,
    }))
  }));
}

// Examples:
// Simple price:
priceRuns([[{ text: "$1,000 setup" }], [{ text: "Included" }]])

// Strikethrough value stack:
priceRuns([
  [{ text: "$2,500", strike: true, color: "999999", size: 18 }, { text: "  $1,750 setup" }],
  [{ text: "$1,000/mo" }]
])

// Strikethrough total:
priceRuns([
  [{ text: "$3,550  ", strike: true, color: "999999", size: 18 }, { text: "$3,000", bold: true }]
])
Generic cell helpers
javascriptfunction hdrCell(w, t, a) {
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    borders: { top: nb, bottom: tb, left: nb, right: nb },
    shading: { type: ShadingType.CLEAR, fill: C },
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: a || AlignmentType.LEFT,
      children: [new TextRun({ text: t, bold: true, font: "Arial", size: 20, color: W })]
    })]
  });
}

function dataCell(w, children, o = {}) {
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    borders: o.borders || tbs,
    shading: { type: ShadingType.CLEAR, fill: o.fill || W },
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
    children
  });
}

// Simple centered price cell
function pc(text) {
  return [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, font: "Arial", size: 20, color: C })]
  })];
}

Core System Table <a id="core-system"></a>
4 columns: Service | What's Included | Setup | Monthly
Column widths: [2000, 4560, 1400, 1400] (sum = 9360)
javascriptconst CC = [2000, 4560, 1400, 1400];

function coreRow(svc, items, setupP, monthlyP, o = {}) {
  const fill = o.isTotal ? M : o.rec ? AM : (o.alt ? LG : W);
  // Recommended gets ACQUIRE border (mint), not amber
  const bL = o.isTotal ? tbs : o.rec ? pb("acquire") : pb(o.p || "retain");

  const svcChildren = o.rec ? [
    new Paragraph({ spacing: { after: 20 }, children: [
      new TextRun({ text: svc, bold: true, font: "Arial", size: 20, color: C })
    ] }),
    new Paragraph({ spacing: { after: 0 }, children: [
      new TextRun({ text: "RECOMMENDED", bold: true, font: "Arial", size: 16, color: AB })
    ] })
  ] : [new Paragraph({ children: [
    new TextRun({ text: svc, bold: o.isTotal, font: "Arial", size: 20, color: C })
  ] })];

  const inclChildren = o.isTotal ? [new Paragraph({ children: [] })] : cl(items);

  return new TableRow({ children: [
    dataCell(CC[0], svcChildren, { borders: bL, fill }),
    dataCell(CC[1], inclChildren, { fill }),
    dataCell(CC[2], setupP, { fill }),
    dataCell(CC[3], monthlyP, { fill })
  ] });
}

// Usage:
// Acquire service:
coreRow("Landing Page", ["Item 1", "Item 2"], pc("$1,000"), pc("No Cost"), { p: "acquire" })

// Recommended service (amber bg, mint border):
coreRow("Meta Ads", ["Item 1", "Item 2"], pc("$750"), pc("$550/mo"), { rec: true })

// Retain service with strikethrough:
coreRow("Strategy", ["Item 1"], priceRuns([[
  {text:"$1,500",strike:true,color:"999999",size:18},{text:"  $1,000"}
]]), pc("$200/mo"), { p: "retain" })

// Total row:
coreRow("Total", [], pc("$4,250"), pc("$1,750/mo"), { isTotal: true })

Comparison Table <a id="comparison"></a>
3 columns: Feature | Core System | Full Engagement
Column widths: [5360, 2000, 2000] (sum = 9360)
Symbols: true = ✓ mint, false = — gray, "rec" = ✓* amber
javascriptconst XC = [5360, 2000, 2000];

function compRow(feat, core, full, o = {}) {
  const fill = o.alt ? LG : W;
  function mk(v) {
    const m = v === "rec" ? CHK : v ? CHK : DSH;
    const c = v === "rec" ? AB : v ? M : "BBBBBB";
    const ch = [new TextRun({ text: m, font: "Arial", size: 22, color: c, bold: true })];
    if (v === "rec") ch.push(new TextRun({ text: "*", font: "Arial", size: 16, color: AB }));
    return ch;
  }
  return new TableRow({ children: [
    dataCell(XC[0], [new Paragraph({ children: [
      new TextRun({ text: feat, font: "Arial", size: 19, color: C })
    ] })], { borders: pb(o.p || "retain"), fill }),
    dataCell(XC[1], [new Paragraph({ alignment: AlignmentType.CENTER, children: mk(core) })], { fill }),
    dataCell(XC[2], [new Paragraph({ alignment: AlignmentType.CENTER, children: mk(full) })], { fill })
  ] });
}

// Use "X" for explicitly not available (build custom runs for this):
// For the comparison, "false" renders as — (available as add-on)
// To show X, use a custom TextRun with "X" text

One-Time Add-Ons Table <a id="one-time-addons"></a>
3 columns: Add-On | What's Included | Setup
Column widths: [2400, 4760, 2200] (sum = 9360)
javascriptconst OC = [2400, 4760, 2200];

function otRow(svc, valueLine, items, priceParagraphs, o = {}) {
  const fill = o.alt ? LG : W;
  return new TableRow({ children: [
    dataCell(OC[0], [
      new Paragraph({ spacing: { after: 20 }, children: [
        new TextRun({ text: svc, bold: true, font: "Arial", size: 20, color: C })
      ] }),
      new Paragraph({ spacing: { after: 0 }, children: [
        new TextRun({ text: valueLine, font: "Arial", size: 18, color: "555555", italics: true })
      ] })
    ], { borders: pb(o.p || "retain"), fill }),
    dataCell(OC[1], cl(items), { fill }),
    dataCell(OC[2], priceParagraphs, { fill })
  ] });
}

Monthly Add-Ons Table <a id="monthly-addons"></a>
4 columns: Add-On | What's Included | Setup | Monthly
Column widths: [2400, 3960, 1200, 1800] (sum = 9360)
javascriptconst MC = [2400, 3960, 1200, 1800];

function moRow(svc, valueLine, items, setupP, monthlyP, o = {}) {
  const fill = o.alt ? LG : W;
  return new TableRow({ children: [
    dataCell(MC[0], [
      new Paragraph({ spacing: { after: 20 }, children: [
        new TextRun({ text: svc, bold: true, font: "Arial", size: 20, color: C })
      ] }),
      new Paragraph({ spacing: { after: 0 }, children: [
        new TextRun({ text: valueLine, font: "Arial", size: 18, color: "555555", italics: true })
      ] })
    ], { borders: pb(o.p || "retain"), fill }),
    dataCell(MC[1], cl(items), { fill }),
    dataCell(MC[2], setupP, { fill }),
    dataCell(MC[3], monthlyP, { fill })
  ] });
}

Launch Table <a id="launch"></a>
3 columns: Service | What's Included | One-Time
Column widths: [2400, 5160, 1800] (sum = 9360)
javascriptconst LC = [2400, 5160, 1800];

function launchRow(svc, items, priceParagraphs, o = {}) {
  const fill = o.isTotal ? M : (o.alt ? LG : W);
  const borders = o.isTotal ? tbs : pb(o.p || "retain");
  return new TableRow({ children: [
    dataCell(LC[0], [new Paragraph({ children: [
      new TextRun({ text: svc, bold: o.isTotal, font: "Arial", size: 20, color: C })
    ] })], { borders, fill }),
    dataCell(LC[1], o.isTotal
      ? [new Paragraph({ children: [new TextRun({ text: items[0] || "", font: "Arial", size: 19, color: C })] })]
      : cl(items), { fill }),
    dataCell(LC[2], priceParagraphs, { fill })
  ] });
}
Fixed Launch Package Usage
The Launch package has fixed pricing — do not adjust per client. Always use these exact
rows and prices:
javascript// Launch is a fixed product — same scope, same price, every time.
// Only customize: business name, goal description, and checklist wording.

launchRow("Landing Page", [
  "[Goal]-focused design",      // e.g., "Membership-focused design"
  "Mobile-optimized",
  "Sign-up form integrated with email platform"
], pc("$1,000"), { p: "acquire" }),

launchRow("Basic Ads Setup", [
  "Meta pixel installation",
  "1 local audience targeting [goal]",  // e.g., "targeting membership"
  "1 initial campaign with creative direction",
  "1 Month of Management Included",
  "First Month of Ads is FREE ($500 value)"  // always include this
], pc("$1,300"), { alt: true, p: "acquire" }),

launchRow("Email Platform Setup", [
  "Platform onboarding (Klaviyo or Mailchimp)",
  "Domain authentication",
  "Landing page integration",
  "Welcome Email Automation"
], pc("$1,250"), { p: "retain" }),

// Total always shows strikethrough
launchRow("Launch Package — Total",
  ["One-time investment. You own the system."],
  priceRuns([
    [{ text: "$3,550  ", strike: true, color: "999999", size: 18 },
     { text: "$3,000", bold: true }]
  ]), { isTotal: true }),

Document Assembly <a id="assembly"></a>
Headers & Footers
javascript// Main proposal header - customize business name
const hdr = new Header({ children: [new Paragraph({
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: M, space: 4 } },
  spacing: { after: 0 },
  tabStops: [{ type: TabStopType.RIGHT, position: CW_ }],
  children: [
    new TextRun({ text: "TURNKEY BUSINESS SOLUTIONS", font: "Arial", size: 16, color: "999999", characterSpacing: 60 }),
    new TextRun({ text: "\t" }),
    new TextRun({ text: "Marketing Proposal  \u00B7  [BUSINESS NAME]", font: "Arial", size: 16, color: "999999" })
  ]
})] });

// Footer (same for all sections)
const ftr = new Footer({ children: [new Paragraph({
  border: { top: { style: BorderStyle.SINGLE, size: 4, color: M, space: 4 } },
  spacing: { before: 0 },
  tabStops: [{ type: TabStopType.RIGHT, position: CW_ }],
  children: [
    new TextRun({ text: "info@tkbsmarketing.com  \u00B7  tkbsmarketing.com", font: "Arial", size: 16, color: "999999" }),
    new TextRun({ text: "\t" }),
    new TextRun({ text: "Page ", font: "Arial", size: 16, color: "999999" }),
    new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: "999999" })
  ]
})] });

// Launch appendix header - customize business name
const cwHdr = new Header({ /* same pattern, change right text to "Launch Package · [BUSINESS]" */ });
Section Properties
javascript// Body pages (reduced top margin for header room)
const bs = {
  page: {
    size: { width: PW, height: PH },
    margin: { top: 1080, right: MR, bottom: 1080, left: MR }
  }
};
Section Flow
javascriptconst doc = new Document({
  styles: { /* ... */ },
  sections: [
    // 1. Cover (own section, no header/footer, full margins)
    { properties: { page: { size: { width: PW, height: PH }, margin: { top: MR, right: MR, bottom: MR, left: MR } } },
      children: [ /* cover content */ ] },

    // 2. How This Works + Core System (one section to avoid orphan pages)
    { properties: bs, headers: { default: hdr }, footers: { default: ftr },
      children: [ /* How This Works + Core System table + footnotes */ ] },

    // 3. Comparison (own section for page break)
    { properties: bs, headers: { default: hdr }, footers: { default: ftr },
      children: [ /* Comparison table */ ] },

    // 4. Add-Ons + Guarantee + Terms (one section to flow continuously)
    { properties: bs, headers: { default: hdr }, footers: { default: ftr },
      children: [ /* One-Time Add-Ons + Monthly Add-Ons + Guarantee + Terms */ ] },

    // 5. Launch Appendix (own section for different header)
    { properties: bs, headers: { default: cwHdr }, footers: { default: ftr },
      children: [ /* Launch page content */ ] }
  ]
});
Merging Sections to Avoid Orphan Pages
If a section ends with only a few lines of content on a new page, merge it with the next section by removing the section break and combining the children arrays. Add sp(200) spacers between logical sections.
Build & Output
javascriptPacker.toBuffer(doc).then(buf => {
  fs.writeFileSync("/home/claude/proposal-[client].docx", buf);
  console.log("Done!");
});
Then:
bashpython /mnt/skills/public/docx/scripts/office/validate.py proposal-[client].docx
python /mnt/skills/public/docx/scripts/office/soffice.py --headless --convert-to pdf proposal-[client].docx
pdftoppm -jpeg -r 200 proposal-[client].pdf preview
# Visually inspect each page
cp proposal-[client].docx /mnt/user-data/outputs/
cp proposal-[client].pdf /mnt/user-data/outputs/