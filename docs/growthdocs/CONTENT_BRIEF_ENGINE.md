# Content Brief Engine

> **Purpose**: Transform a keyword target into a production-ready content brief that a human or AI writer can follow without asking clarifying questions. A brief is complete when there is zero ambiguity about what to write.

---

## 1. What a Brief Contains

A complete brief must specify every element before writing begins:

| Element | Description | Example |
|---|---|---|
| Target URL | The exact URL this article will live at | `/blog/expense-tracker-for-freelancers` |
| Primary Keyword | The headline keyword | `expense tracker for freelancers` |
| Secondary Keywords | 3–6 supporting terms | `freelance expense tracking`, `track business expenses self-employed` |
| LSI Keywords | 10–15 semantic terms | `tax deductions`, `business expenses`, `quarterly taxes` |
| Search Intent | What the user wants | `How-to + Tool recommendation` |
| Target Word Count | Minimum target | `1,400 words` |
| Tone | Voice standard | `Direct, educational, no fluff` |
| H1 | Exact headline | `Expense Tracking for Freelancers: The Complete System` |
| Meta Description | Under 155 chars | `Track every freelance business expense correctly. This guide covers categories, tools, and tax prep.` |
| Heading Outline | Complete H2/H3 structure | See Section 3 |
| FAQ Section | 5 Q&A pairs | See Section 4 |
| Internal Links | Required destinations | `2 blog posts, 1 doc page, 1 use case` |
| CTA | Required CTA | `"Start tracking expenses free → moneyos.webasthetic.in/register"` |
| OG Image Brief | Visual direction for OG image | `Dark background, "Expense Tracker for Freelancers" headline, Money OS logo` |

---

## 2. Brief Generation Process

### Manual Brief (current)

1. Complete keyword research (see Keyword Discovery Engine)
2. Analyze top 5 SERP results for content gaps
3. Fill the brief template below
4. Store in `content_briefs` Growth DB collection
5. Human reviewer approves brief (status: `Approved`)
6. Assign to writer

### Future AI Brief Generation

When the AI Content Pipeline is active:
1. Topic + keyword data enters the pipeline
2. AI analyzes SERP top 5 (via Serper API or similar)
3. AI generates complete brief following this template
4. Brief is stored in `content_briefs` with status `Draft`
5. Human reviews and sets status to `Approved`
6. AI writer receives approved brief and generates article

---

## 3. Standard Heading Outline Template

Every brief must include a complete heading structure. Writers must not invent headings.

### Example Brief Outline: "Expense Tracker for Freelancers"

```
H1: Expense Tracking for Freelancers: The Complete System

H2: Why Tracking Expenses Matters for Freelancers
  — Tax deductions, financial clarity, client billing

H2: What Business Expenses Freelancers Can Track
  H3: Software and Subscriptions
  H3: Home Office Costs
  H3: Equipment and Gear
  H3: Travel and Transportation
  H3: Professional Development
  H3: Marketing and Advertising

H2: How to Set Up Your Expense Tracking System
  H3: Step 1: Choose a Dedicated Tool or Spreadsheet
  H3: Step 2: Create Expense Categories
  H3: Step 3: Log Expenses Within 48 Hours
  H3: Step 4: Reconcile Monthly
  H3: Step 5: Export for Tax Season

H2: The Best Expense Tracking Tool for Freelancers [CTA placement]
  — Money OS feature callout

H2: Common Expense Tracking Mistakes to Avoid

H2: FAQ [structured data section]
```

---

## 4. FAQ Template (5 Required Questions)

Every brief includes exactly 5 FAQ pairs, formatted for JSON-LD FAQPage schema.

Questions must be:
- Actual questions people type into Google or ask ChatGPT
- Answered in under 80 words (for featured snippet eligibility)
- Not redundant with each other

### Example FAQ for "Expense Tracker for Freelancers"

```
Q: What expenses can a freelancer deduct?
A: Freelancers can deduct home office costs, software subscriptions, professional development, 
   travel for client work, internet and phone (proportional), equipment, and marketing expenses. 
   Keep receipts for every deduction — the IRS requires documentation for all business expense claims.

Q: Do freelancers need accounting software?
A: A dedicated expense tracker or accounting tool is strongly recommended once you have more than 
   5 regular clients or earn more than $2,000 per month. Spreadsheets break under that volume.

Q: How often should freelancers track expenses?
A: Log expenses within 48 hours of purchase. Weekly reconciliation takes under 15 minutes 
   and prevents the 8-hour year-end scramble that kills freelancer tax season.

Q: What is the simplest way to track freelance expenses?
A: The simplest system is a tool like Money OS that automatically categorizes bank transactions. 
   If you prefer manual tracking, a spreadsheet with columns for date, description, category, 
   and amount is sufficient for under 50 expenses per month.

Q: Can I track freelance expenses on my phone?
A: Yes. Most dedicated expense trackers, including Money OS, support mobile. 
   The best practice is to photograph receipts immediately using the mobile app, 
   then categorize them during your weekly reconciliation session.
```

---

## 5. Brief Storage Schema

Stored in Growth DB `content_briefs` collection:

```json
{
  "_id": "ObjectId",
  "topicId": "ObjectId",
  "targetKeyword": "expense tracker for freelancers",
  "targetUrl": "/blog/expense-tracker-for-freelancers",
  "h1": "Expense Tracking for Freelancers: The Complete System",
  "metaDescription": "Track every freelance business expense correctly...",
  "secondaryKeywords": ["freelance expense tracking", "track business expenses"],
  "lsiKeywords": ["tax deductions", "quarterly taxes", "business expenses"],
  "targetWordCount": 1400,
  "searchIntent": "how-to + tool recommendation",
  "headingOutline": ["..."],
  "faqPairs": [{ "q": "...", "a": "..." }],
  "internalLinks": ["/docs/getting-started", "/use-cases/freelancers"],
  "ctaText": "Start tracking expenses free",
  "ctaUrl": "https://moneyos.webasthetic.in/register",
  "ogImageBrief": "Dark background, headline text, Money OS logo",
  "generatedAt": "Date",
  "status": "Draft | Approved | Rejected",
  "humanReviewer": "string"
}
```

---

## 6. Brief Review Checklist

Before approving a brief (status → `Approved`):

- [ ] H1 contains the primary keyword naturally
- [ ] Meta description is under 155 characters and does not repeat the H1 verbatim
- [ ] FAQ answers are under 80 words each
- [ ] Heading outline covers all the SERP-demanded subtopics
- [ ] At least 3 internal links are specified
- [ ] The tone brief says "direct, educational, noun-first — no fluff"
- [ ] Target word count is appropriate for the topic complexity

---

*Approved briefs feed directly into the Content Pipeline Architecture.*
