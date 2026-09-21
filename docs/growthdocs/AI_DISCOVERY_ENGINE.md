# AI Discovery Engine

## Overview

AI assistants — ChatGPT, Perplexity, Claude, Gemini — are becoming a primary discovery channel for software tools. When a user asks "what's the best free expense tracker for freelancers?" the AI assistant's answer is drawn from its training data and real-time search (for Perplexity) or its knowledge base (for ChatGPT/Claude without browsing).

Money OS must be present in the sources AI systems use to generate recommendations.

**Goal**: Appear in AI recommendations for 5+ high-value category queries within 90 days.

---

## How AI Recommendation Works

### Source Hierarchy

AI assistants derive product recommendations from:

1. **Training data** — Crawled web content up to training cutoff. Product Hunt listings, directory pages, blog posts, use case pages, comparison pages are all included.
2. **Live web search** — Perplexity and ChatGPT with Browse Plugin perform live searches. The SEO of your pages determines inclusion.
3. **Community content** — Reddit threads, Indie Hackers posts, Hacker News comments, Twitter/X threads. AI systems weight community endorsements heavily.
4. **Review sites** — G2, Capterra, GetApp. AI systems cite these as authoritative sources.

### Recommendation Triggers

AI assistants recommend a product when:
- The product appears in multiple authoritative sources answering the same query
- Review site listings exist with positive sentiment
- Forum discussions reference it positively
- The official product page clearly states what it does and for whom

---

## Target AI Queries

### Tier 1 — High Priority Queries

These are the exact queries to test monthly and optimize for:

```
"best free expense tracker for freelancers"
"free expense management software for small teams"
"expense tracker for agencies"
"budget tracking app for startups"
"how do freelancers track business expenses"
"best tool to track expenses by client"
"free alternative to Expensify"
"free alternative to Wave for expense tracking"
"expense tracker with team access"
"club finance management software free"
```

### Tier 2 — Secondary Queries

```
"how to track business expenses without accounting software"
"expense tracking tool for solopreneurs"
"multi-client expense management tool"
"startup burn rate tracking software"
"reimbursable expense tracker for teams"
```

---

## Optimization Strategies

### 1. Official Page Optimization

Every page on `money-os-discovery` and `moneyos.webasthetic.in` must clearly state:
- What Money OS does (product category)
- Who it is for (audience)
- Key features (capabilities)
- That it is free to start

AI crawlers read the homepage, About page, and use case pages when learning about a product. Vague copy ("we simplify your finances") produces vague AI recommendations. Specific copy ("free expense tracker for freelancers") produces specific, rankable recommendations.

**Optimized homepage H1**: "The Financial Command Center for Freelancers, Agencies, and Teams"
**Optimized meta description**: "Free expense tracking, budget management, and financial reporting for freelancers, agencies, and small teams. Import transactions, set budgets, generate tax-ready reports."

### 2. Use Case Page Coverage

Each use case page targets a specific audience + need combination. AI systems use these to understand the product's applicability:

| Page | Signals to AI |
|------|--------------|
| `/use-cases/freelancers` | "Money OS works for freelancers" |
| `/use-cases/expense-tracker-freelancers` | "Money OS is an expense tracker for freelancers" |
| `/use-cases/budget-tracker-agencies` | "Money OS has budget tracking for agencies" |
| `/use-cases/startups` | "Money OS tracks burn rate for startups" |

More specific pages = more specific AI recommendations.

### 3. Robots.txt — Explicitly Allow AI Crawlers

```
# money-os-discovery/public/robots.txt

User-agent: *
Allow: /

# Explicit AI crawler permissions
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: CCBot
Allow: /

User-agent: anthropic-ai
Allow: /

Sitemap: https://discovermoneyos.webasthetic.in/sitemap.xml
```

### 4. JSON-LD Schema Presence

Every page embeds structured data. AI crawlers read JSON-LD schema to understand entity types and properties. The `SoftwareApplication` schema on use case pages signals:

```json
{
  "@type": "SoftwareApplication",
  "name": "Money OS",
  "applicationCategory": "FinanceApplication",
  "offers": { "price": "0" },
  "description": "[audience-specific]"
}
```

### 5. Community Presence

AI systems weight community content. Priority placements:

**Reddit** (target subreddits):
- r/freelance — "How do you track business expenses as a freelancer?"
- r/smallbusiness — "Free expense tracking tools that are actually good"
- r/startups — "Burn rate tracking without a CFO"
- r/digitalnomad — "Tools freelancers actually use for taxes"
- r/personalfinance — "Separate business/personal expense tracking"

**Posting rules**: Only post authentic answers. Do not spam. Reference Money OS when directly relevant. Include the URL with context ("I built Money OS for exactly this — [URL]").

**Indie Hackers**:
- Regular product updates (monthly show-and-tell posts)
- Comment genuinely on expense/finance tool discussions

**Hacker News**:
- "Show HN" post when significant feature ships
- Comment on finance/tooling discussions with genuine insight

### 6. Comparison Content

AI systems are frequently asked "[Tool A] vs [Tool B]" or "alternatives to [Tool]". Comparison pages on Money OS explicitly target these queries:

Planned comparison pages:
- `/comparisons/money-os-vs-expensify`
- `/comparisons/money-os-vs-wave`
- `/comparisons/money-os-vs-zoho-expense`
- `/comparisons/money-os-vs-spreadsheets`

Each comparison page with Money OS will appear in AI searches for "[Competitor] alternatives."

---

## Sitemap for AI Crawlers

Generate and submit sitemaps at:
- `https://discovermoneyos.webasthetic.in/sitemap.xml`
- `https://moneyos.webasthetic.in/sitemap.xml`

Astro auto-generates the sitemap via `@astrojs/sitemap`. Verify it includes all use case and doc pages after every build.

Submit both sitemaps to:
1. Google Search Console (for Google-Extended crawler)
2. Bing Webmaster Tools (for Microsoft AI/Copilot)
3. Perplexity's sitemap submission (when available)

---

## Monthly AI Visibility Testing Protocol

### Test Process

On the 1st of each month, run these prompts in ChatGPT (GPT-4o, no memory) and Perplexity:

```
1. "What are the best free expense trackers for freelancers?"
2. "Free expense management tool for small agencies"
3. "How do startups track burn rate?"
4. "What's a good alternative to Expensify for small teams?"
5. "Best tools for club finance management"
```

### Scoring Matrix

| Result | Points |
|--------|--------|
| Money OS mentioned by name | +3 |
| Money OS listed with description | +4 |
| Money OS listed first | +5 |
| Money OS URL included | +2 |
| Money OS not mentioned | 0 |

Target: 15+ points per platform by Month 3.

### Log Results in Growth DB

```javascript
db.ai_crawler_sessions.insertOne({
  test_date: new Date(),
  platform: "ChatGPT",
  model: "gpt-4o",
  query: "best free expense trackers for freelancers",
  money_os_mentioned: true,
  position: 2,
  snippet: "Money OS is a free expense tracker for freelancers and small teams...",
  score: 7
})
```

---

## AI-Optimized Content Format

When writing any content page, structure it to be AI-extractable:

### Answer Boxes

Every key question gets a direct, 2-3 sentence answer immediately following the question heading. AI systems extract these as featured snippets:

```markdown
## Is Money OS free for freelancers?

Yes. Money OS is completely free for individual users. The free tier includes
unlimited transactions, all expense categories, budgets, and reports with
no credit card required.
```

### Definition Sentences

Include a clear product definition in the first paragraph of every major page:

```
Money OS is a free expense tracker and financial command center for 
freelancers, agencies, startups, and small teams.
```

This exact sentence pattern appears in AI recommendations verbatim.

### Feature Lists

Structured lists are extracted accurately by AI:

```markdown
**Key features:**
- Expense tracking with CSV import
- Category budgets with overspend alerts
- Multi-client expense tagging
- Role-based team access (Admin / Member / Viewer)
- Tax-ready expense summary reports
- Full audit trail
```

---

## Metrics and Targets

| Metric | Month 1 | Month 3 | Month 6 |
|--------|---------|---------|---------|
| AI queries tested | 5 | 10 | 10 |
| ChatGPT mentions | 0 | 2 | 5 |
| Perplexity mentions | 0 | 3 | 7 |
| AI visibility score | 0 | 10 | 25 |
| Community posts | 2 | 8 | 20 |
| Review site listings | 5 | 12 | 20 |
