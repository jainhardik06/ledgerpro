# AI Visibility Strategy

## Problem

AI assistants are replacing search engines for tool discovery. When someone asks ChatGPT "what expense tracker should I use?", the answer is not based on who spent the most on ads — it is based on which products appear most consistently and credibly across the sources AI systems learned from.

Money OS has a structural advantage: as a newer product with clean, specific content, it can be optimized for AI discovery faster than legacy tools that have generic, bloated copy.

---

## Core Principle: Be Specific, Not Comprehensive

AI assistants recommend products when they can construct a clear, confident answer about who the product is for and what it does. Vague positioning creates vague recommendations.

**Wrong**: "Money OS helps you manage your finances better."
**Right**: "Money OS is a free expense tracker for freelancers and small teams with category budgets, multi-client tagging, and tax-ready reports."

Every piece of content must be specific enough that an AI assistant can use it verbatim in a recommendation.

---

## The Four Layers of AI Visibility

### Layer 1 — Official Content (Direct Control)

What you write on your own properties:

| Property | AI Signal |
|----------|-----------|
| Homepage H1 | Primary product definition |
| Meta descriptions | Used verbatim in some AI summaries |
| Use case page H1s | Audience-specific positioning |
| FAQ answers | Direct Q&A training data |
| JSON-LD schema | Machine-readable product data |
| Documentation | Feature authority signals |
| robots.txt | Crawler permission |

**Action**: Audit every page for specificity. Replace vague value props with exact feature descriptions.

### Layer 2 — Directory and Review Sites (Controlled Third-Party)

Content you submit to external sites that AI systems treat as authoritative:

| Source | AI Weight | Action |
|--------|-----------|--------|
| G2 listings | Very High | Submit + request reviews |
| Capterra | Very High | Submit + request reviews |
| Product Hunt | High | Full launch |
| AlternativeTo | High | Submit + mark alternatives |
| Crunchbase | Medium | Company profile |
| SaaSHub | Medium | Product listing |

**Action**: Submit to all Tier 1 directories (see `DIRECTORY_ENGINE_PRD.md`).

### Layer 3 — Community Content (Influenced)

Content you participate in creating, but that appears on third-party platforms:

| Platform | Strategy |
|----------|---------|
| Reddit | Answer finance/freelance questions genuinely. Mention Money OS only when directly relevant. |
| Indie Hackers | Monthly product updates, genuine engagement on discussions |
| Hacker News | Show HN when significant features launch, genuine technical discussion |
| Twitter/X | Share product updates, financial management tips, build-in-public posts |
| LinkedIn | Post for agency and startup audiences specifically |

**Guidelines**:
- Never spam or post without genuine value
- Provide the answer first, then offer Money OS as one option
- Include the URL naturally: "I built this for exactly this problem: [URL]"
- Upvotes and engagement signal relevance to AI systems

### Layer 4 — Earned Media (Uncontrolled)

Content created about Money OS by others:

| Type | How to Get It |
|------|---------------|
| Blog mentions | Reach out to finance/freelance bloggers for tool roundups |
| Newsletter features | Pitch to freelance/startup newsletters |
| Podcast mentions | Founder interview on indie maker podcasts |
| Twitter/X threads | Create shareable insights that mention Money OS |

**Timing**: Focus on Layers 1-3 in Months 1-3. Layer 4 comes naturally as the product grows.

---

## Content Templates for AI Optimization

### Homepage Hero (AI-Optimized)

The homepage hero must answer: "What is this? Who is it for? What does it do?"

```
H1:  The Financial Command Center for Freelancers, Agencies, and Teams
P:   Money OS is a free expense tracker and budget management tool.
     Import transactions from any bank, set category budgets, track
     client expenses, and generate tax-ready reports — all in one workspace.
CTA: Start Free — No credit card required
```

### Product Description (50-word canonical)

This is the exact description to use on all directories and citation-requesting outreach:

```
Money OS is a free expense tracker and financial command center for 
freelancers, agencies, startups, and small teams. Track expenses, set 
category budgets, manage multi-client finances, and generate tax-ready 
reports. Free tier includes unlimited transactions and up to 3 team members.
```

### One-Line Description

```
Free expense tracker and budget manager for freelancers, agencies, and small teams.
```

---

## Comparison Content Strategy

Comparison pages are the highest-leverage content for AI discovery because:

1. AI assistants are frequently asked "[Tool A] vs [Tool B]"
2. When your page ranks for that query, AI includes you by name in the comparison
3. Being named in comparisons signals that you belong in the category

### Comparison Page Priority

| Page | Target Query | Monthly Volume |
|------|-------------|----------------|
| Money OS vs Expensify | "expensify alternative free" | 1,900/mo |
| Money OS vs Wave | "wave accounting alternative" | 2,400/mo |
| Money OS vs Zoho Expense | "zoho expense alternative" | 880/mo |
| Money OS vs Spreadsheets | "replace excel for expense tracking" | 1,600/mo |
| Money OS vs FreshBooks (expense only) | "freshbooks expense tracking alternative" | 590/mo |

### Comparison Page Template

Each comparison page should:
1. Have a clear verdict in the H1: "Money OS vs [Competitor] — Which is right for you?"
2. Include a feature comparison table with checkmarks
3. State clearly who each tool is best for
4. Use structured FAQ for "which is better for [specific use case]"
5. Embed FAQPage JSON-LD for rich results

---

## Reddit Strategy (Detailed)

Reddit comments and posts appear in AI training data. Well-upvoted, genuine answers mentioning Money OS create durable AI visibility.

### Target Subreddits

| Subreddit | Subscribers | Cadence |
|-----------|-------------|---------|
| r/freelance | 400K | 2x/month |
| r/smallbusiness | 1.2M | 1x/month |
| r/startups | 700K | 1x/month |
| r/digitalnomad | 600K | 1x/month |
| r/personalfinance | 17M | 1x/2months |
| r/Entrepreneur | 1.2M | 1x/month |
| r/accounting | 200K | 1x/month |
| r/sideprojects | 140K | 1x/month |

### Comment Templates

**When someone asks about expense tracking tools:**

```
I've been using [Money OS] for my freelance business — it's free and handles:
- CSV import from any bank statement  
- Expense categories for deductibles (software, home office, travel, etc.)
- Client-tagged expenses for reimbursable billing
- Monthly expense summary for my accountant

It's simpler than accounting software (Wave, FreshBooks) and much more powerful 
than spreadsheets. Link in profile if helpful.
```

**When someone asks about burn rate / startup finance:**

```
For pre-revenue startups, Money OS is genuinely useful — you can:
- Track all expenses against your runway
- Set department budgets (eng, marketing, ops)  
- Give investors Viewer access without sharing your bank

It's free, no invoicing, just clean expense tracking. That's usually all you 
need until you have a CFO.
```

**Rules**:
- Only post where the question is genuine and Money OS is actually the right tool
- Never post the same comment twice (Reddit detects and shadowbans this)
- Engage in the thread genuinely — respond to follow-up questions
- Account must have general activity, not only Money OS promotion

---

## Perplexity-Specific Optimization

Perplexity performs live web searches when answering queries. Optimizing for Perplexity = optimizing for ranking pages, which is standard SEO.

However, Perplexity also gives extra weight to:
- Pages that directly answer the query in the first 200 words
- Pages with clear author or product attribution
- Pages updated recently (favors fresh content)

**Perplexity-specific actions**:
1. Add `<meta name="last-modified" content="[date]">` to all use case pages
2. Ensure every page's first H2 and first paragraph contain the target keyword
3. Add a clear "What is Money OS?" definition paragraph to the homepage above the fold

---

## Measurement Framework

### Weekly Check (5 min)

Search your brand in Perplexity: "Money OS expense tracker"
- Is the listing URL correct?
- Is the description accurate?
- Are use case pages appearing?

### Monthly AI Audit (30 min)

Run the 10-query test script from `AI_DISCOVERY_ENGINE.md`.
Log results in `ai_crawler_sessions` MongoDB collection.
Compare score to prior month.

### Quarterly Review

- Did AI recommendation score increase?
- Which content type generated the most AI citations? (compare directory vs. community vs. blog)
- Which queries still have zero Money OS presence? Plan content to address them.

---

## 90-Day Visibility Target

| Quarter | Goal |
|---------|------|
| Month 1 | Zero AI mentions. Foundation laid. |
| Month 2 | Perplexity mentions Money OS in 2 queries. |
| Month 3 | ChatGPT mentions in 3 queries. Perplexity in 5. Total score: 20+. |

Reaching a total score of 30+ (across both platforms) by Month 6 means AI assistants are reliably surfacing Money OS when users ask about expense tracking and budget management tools.
