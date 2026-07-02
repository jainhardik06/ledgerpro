# Blog Engine Architecture

## Purpose

The Money OS blog serves three functions simultaneously:
1. **SEO** — capture long-tail queries from freelancers, agencies, and startups seeking financial advice
2. **Trust** — demonstrate product expertise and financial literacy to prospective users
3. **Revenue** — contextual ad placement and affiliate recommendations for complementary tools

The blog is NOT a growth hack vehicle. Every post must provide genuine value as a standalone resource. If it wouldn't be worth reading without the CTA, it doesn't get published.

---

## Technical Architecture

### Stack

- **Platform**: Astro 5 + MDX (same as docs)
- **Content**: `src/content/blog/*.mdx` with Zod schema
- **Layout**: `BlogLayout.astro` — distinct from `DocLayout.astro`
- **Routing**: `src/pages/blog/[...slug].astro` with `getStaticPaths()`
- **Index**: `src/pages/blog/index.astro` with pagination (12 posts/page)
- **Categories**: Tag-based filtering via URL params

### Blog Collection Schema

```typescript
// src/content.config.ts (extend existing)
const blog = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string().max(160),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().default("Money OS Team"),
    category: z.enum([
      'expense-tracking',
      'budgeting', 
      'freelance-finance',
      'agency-finance',
      'startup-finance',
      'tax-tips',
      'product-updates',
      'tools-and-resources'
    ]),
    tags: z.array(z.string()).default([]),
    coverImage: z.string().optional(),
    wordCount: z.number().optional(),
    readingTime: z.number().optional(),   // in minutes
    featured: z.boolean().default(false),
    status: z.enum(['draft', 'published', 'archived']).default('draft'),
    seoKeyword: z.string().optional(),    // primary keyword for this post
    canonicalUrl: z.string().optional(),  // if syndicated elsewhere first
  })
});
```

### BlogLayout.astro Components

```
BlogLayout.astro
  └── TopNav.astro (shared)
  └── article.max-w-2xl
      ├── PostHeader (category, title, subtitle, date, reading time, author)
      ├── CoverImage (optional, 1200×630)
      ├── slot (MDX content)
      │   ├── AffiliateDisclosure (if post has affiliate links)
      │   └── [content renders here]
      └── PostFooter
          ├── Tags
          ├── AuthorCard
          ├── RelatedPosts (3 cards)
          └── CTA block ("Try Money OS Free")
  └── BlogSidebar (xl:block)
      ├── TableOfContents
      └── Ad slot (Carbon / AdSense)
```

---

## Content Pillars

The blog covers five content pillars that map directly to Money OS audiences:

### Pillar 1 — Freelance Finance (40% of posts)

**Target audience**: Freelancers and solopreneurs managing their own finances

**Content types**:
- How-to guides: "How to track deductible expenses as a freelancer"
- Tax content: "What expenses can freelancers deduct?"
- Tool comparisons: "Best expense trackers for freelancers"
- Financial templates: "Freelance finance checklist"

**SEO intent**: Informational + commercial investigation

### Pillar 2 — Agency Operations (20% of posts)

**Target audience**: Agency owners and operations managers

**Content types**:
- Profitability: "How to calculate client profitability"
- Process: "How agencies should handle team expense reimbursements"
- Tools: "Best expense tracking tools for agencies"

### Pillar 3 — Startup Finance (15% of posts)

**Target audience**: Founders, early-stage startups

**Content types**:
- Runway: "How to calculate and extend your runway"
- Burn rate: "What is burn rate and how to track it"
- Fundraising: "Financial records investors ask for in due diligence"

### Pillar 4 — Tools & Comparisons (15% of posts)

**Target audience**: Decision-makers evaluating tools

**Content types**:
- "[Tool] alternatives" posts
- Feature comparison deep-dives
- "Best [tool category] for [audience]" roundups

### Pillar 5 — Product Updates (10% of posts)

**Target audience**: Existing users + community

**Content types**:
- Changelog narratives (what changed and why)
- Feature tutorials ("How to use the new budget alerts")
- Product direction and roadmap updates

---

## Content Calendar

### Month 1 — Foundation (4 Posts)

| Title | Pillar | Primary Keyword |
|-------|--------|-----------------|
| How to Track Business Expenses as a Freelancer | Freelance Finance | how to track business expenses freelancer |
| What Is Burn Rate? A Founder's Guide | Startup Finance | what is burn rate |
| The 8 Expense Categories Every Freelancer Needs | Freelance Finance | freelancer expense categories |
| Expensify vs Wave vs Money OS — Which Is Right for You? | Tools | expensify vs wave |

### Month 2 — Expansion (6 Posts)

| Title | Pillar | Primary Keyword |
|-------|--------|-----------------|
| How Agencies Can Track Client Profitability | Agency Operations | client profitability tracking |
| The Freelancer's Complete Tax Deduction Checklist | Freelance Finance | freelancer tax deductions |
| How to Calculate Runway With No CFO | Startup Finance | how to calculate startup runway |
| Best Free Alternatives to Expensify in 2024 | Tools | free expensify alternative |
| How to Set Up Team Expense Tracking From Scratch | Agency Operations | team expense tracking setup |
| Money OS Product Update — June 2024 | Product Updates | — |

### Month 3+ — Scale (8 Posts/Month)

Expand all five pillars proportionally. Prioritize keywords with:
- Monthly search volume > 500
- Keyword difficulty < 40 (can rank with <10 backlinks)
- Existing SERP: mostly informational content (not dominated by big SaaS brands)

---

## Post Structure Template

### Standard Blog Post Structure

```markdown
---
title: "How to Track Business Expenses as a Freelancer"
description: "A complete guide to tracking freelance business expenses for tax deductions, client billing, and financial clarity. Free methods included."
publishDate: 2024-06-15
category: freelance-finance
tags: [expense-tracking, taxes, freelancers]
seoKeyword: "how to track business expenses freelancer"
wordCount: 1800
readingTime: 9
status: published
---

## Introduction (100-150 words)

Hook sentence. State the problem. State what this post covers. No fluff.

## [H2 — First Major Topic]

[Content: 200-300 words per H2 section]

### [H3 — Subsection if needed]

## [H2 — Second Major Topic]

## [H2 — Third Major Topic]

## Tools That Help (affiliate section)

[3-4 tool recommendations with affiliate links where applicable]

## Summary

[3-5 bullet point summary of the post]

## FAQ

### [Question pulled from "People Also Ask"]

[Direct answer — 2-4 sentences]

### [Next question]

[Answer]
```

### SEO Essentials Per Post

- **Title tag**: Contains primary keyword naturally. Under 60 characters.
- **Meta description**: Contains primary keyword. Under 155 characters. Has CTA.
- **H1**: Contains primary keyword or close variant.
- **First 100 words**: Contains primary keyword exactly once.
- **Image alt text**: Descriptive, includes keyword when natural.
- **Internal links**: Minimum 2 internal links per post.
- **External links**: 1-3 authoritative external sources cited.

---

## Publishing Workflow

### Stage 1 — Topic Selection

1. Identify target keyword (from `KEYWORD_DISCOVERY_ENGINE.md` process)
2. Create brief in `content_briefs` MongoDB collection (from `CONTENT_BRIEF_ENGINE.md`)
3. Approve brief — confirm keyword, intent, outline, target length

### Stage 2 — Writing

Write following the CONTENT_QUALITY_STANDARD.md checklist:
- Real examples over hypotheticals
- Specific data points over vague assertions
- No padding — every paragraph earns its place

### Stage 3 — Pre-Publish Review (15-minute maximum)

- [ ] Title tag under 60 chars and contains keyword
- [ ] Meta description under 155 chars
- [ ] H1 contains keyword
- [ ] 2+ internal links added
- [ ] Cover image created and alt text set
- [ ] Affiliate disclosure added (if applicable)
- [ ] FAQPage JSON-LD added to frontmatter
- [ ] `status: published` set in frontmatter

### Stage 4 — Publish

Merge MDX file to main branch. Vercel deploys automatically. Blog post is live.

### Stage 5 — Distribute

- Share in relevant subreddits (where genuinely relevant, not spam)
- Post on Twitter/X with key takeaway quote
- Add to Indie Hackers product page update
- Submit URL to Google via GSC "URL Inspection" for fast indexing

---

## Performance Metrics

### Per-Post Metrics (Track Monthly via GSC)

- Impressions
- Clicks
- Average position
- CTR

### Blog-Wide Metrics

| Metric | Month 1 | Month 3 | Month 6 |
|--------|---------|---------|---------|
| Posts published | 4 | 16 | 40 |
| Monthly organic sessions | 200 | 2,000 | 10,000 |
| Average time on page | >2 min | >2.5 min | >3 min |
| Posts in position 1-10 | 0 | 3 | 12 |
| Affiliate click rate | — | 1.5% | 2.5% |

### Content Decay Protocol

Every published post reviewed at 12 months:
- Still accurate? Update facts.
- Still ranking? Strengthen with new data.
- Dropped to position 11-20? Add content, build internal links.
- Never ranked, never clicked? Archive or consolidate into a stronger post.
