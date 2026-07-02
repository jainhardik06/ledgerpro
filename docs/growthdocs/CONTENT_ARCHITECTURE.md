# Content Architecture

> **Authority**: This document defines the complete content architecture for the Money OS Discovery Ecosystem. Every content type, section, and route structure is defined here. Architecture must support 5,000+ articles, 1,000+ docs, and 1,000+ landing pages without redesign.

---

## 1. Content Philosophy

Money OS Discovery content is not marketing. It is infrastructure.

Every piece of content must:
- **Exist to answer a specific question** a potential user has
- **Be discoverable** by Google, AI crawlers (ChatGPT, Claude, Perplexity), and humans
- **Convert** readers into signups through editorial trust, not pushy CTAs
- **Compound** — every article makes the next article more credible via internal linking

Content categories by funnel position:

| Stage | Intent | Content Type | Example |
|---|---|---|---|
| Awareness | Problem discovery | Blog, Resource | "How do freelancers track taxes?" |
| Consideration | Solution research | Comparison, Use Case | "Money OS vs Quickbooks" |
| Decision | Product validation | Docs, Changelog | "Getting Started with Money OS" |
| Retention | Feature adoption | Docs, Blog | "Advanced Budget Automation" |
| Advocacy | Sharing | Resource, Guide | "Freelancer Finance Template" |

---

## 2. Content Sections

### 2.1 `/blog` — Editorial Blog

**Purpose**: Thought leadership, SEO traffic, financial education.

**Content types**:
- How-to guides ("`How to track freelance expenses in 2025`")
- Industry insights ("`The 5 biggest finance mistakes agency founders make`")
- Product-adjacent articles ("`Why spreadsheets fail at scale`")
- Seasonal content ("`Q4 tax prep checklist for freelancers`")

**Volume target**:
- Month 1: 10 posts
- Month 6: 100 posts
- Year 2: 1,000+ posts (AI-assisted)

**Content schema** (frontmatter):
```yaml
title: string (max 100 chars)
description: string (max 200 chars)
keywords: string[]
category: string
author: string
publishDate: date
updatedDate: date?
status: draft | scheduled | published
coverImage: string?
readingTime: number?
faq: { question, answer }[]?
```

**Template**: `src/layouts/BlogLayout.astro`

---

### 2.2 `/docs` — Product Documentation

**Purpose**: Product adoption, user education, SEO for product-intent queries, AI crawler indexing.

**Hierarchy**:
```
/docs
  /getting-started
    /introduction
    /creating-workspace
    /first-transaction
  /transactions
    /manual-entry
    /bank-import
    /categories
  /budgets
    /creating-budgets
    /budget-alerts
  /reports
    /expense-reports
    /income-reports
    /tax-summary
  /clients
    /adding-clients
    /client-reports
  /teams
    /inviting-members
    /roles-permissions
  /audit
    /audit-log
    /export-data
  /security
    /two-factor
    /data-encryption
  /faq
```

**Volume target**:
- v1: 10 foundational docs
- v2: 50 docs (feature complete)
- Long-term: 500+ docs

**No ads on any documentation page. Ever.**

---

### 2.3 `/changelog` — Product Changelog

**Purpose**: Transparency, retention, SEO for product update queries, AI model freshness signals.

**Format**: Monthly grouped entries.
```
/changelog
  /2025-01  (January 2025)
  /2025-02
  ...
```

Each entry:
- Version number
- Release date
- Features added
- Bugs fixed
- Breaking changes (if any)

**Template**: `src/layouts/ChangelogLayout.astro`

---

### 2.4 `/comparisons` — Competitor Comparison Pages

**Purpose**: Capture high-intent bottom-of-funnel traffic. These pages convert better than any other content type because the user is actively evaluating options.

**Format**:
```
/comparisons/money-os-vs-quickbooks
/comparisons/money-os-vs-freshbooks
/comparisons/money-os-vs-wave
/comparisons/money-os-vs-spreadsheet
/comparisons/money-os-vs-xero
/comparisons/money-os-vs-honeybook
```

**Page structure** (mandatory):
1. Hero: Clear statement of who wins and why
2. Feature comparison table (tabular, scannable)
3. Use case fit matrix
4. Pricing comparison
5. Migration CTA

**Max 1 contextual ad below comparison table. No other ads.**

---

### 2.5 `/use-cases` — Niche Landing Pages

**Purpose**: High-intent, niche-specific pages. Serve users who search "`expense tracker for agencies`" not "`expense tracker`". Lower competition, higher conversion.

**Format**:
```
/use-cases/freelancers
/use-cases/agencies
/use-cases/student-clubs
/use-cases/small-businesses
/use-cases/startups
/use-cases/creators
/use-cases/consultants
/use-cases/nonprofits
```

**Each page includes**:
- Audience-specific hero copy
- Role-specific feature highlights
- Testimonial (when available)
- Pricing anchor
- FAQ specific to the audience
- JSON-LD SoftwareApplication + FAQPage schema

**No ads on use case pages.**

---

### 2.6 `/resources` — Free Tools & Templates

**Purpose**: Link magnet. Resources attract the most backlinks of any content type. People share tools, not articles.

**Resource types**:
- Spreadsheet templates (expense trackers, budget templates)
- Calculators (freelance rate calculator, tax estimator)
- Checklists (Q4 tax checklist, onboarding checklist)
- Guides (PDFs — future)

**Format**:
```
/resources
  /freelancer-expense-tracker-template
  /agency-budget-template
  /freelance-rate-calculator
  /q4-tax-checklist
  /startup-financial-runway-calculator
```

**Ad placement**: Resources are the best ad location (user intent is to download, not read). A single sidebar or bottom-of-page ad is appropriate.

---

## 3. Content Governance

### Publication Flow
```
Topic Idea → Brief → Draft → Human Review → Publish → Index → Performance Review
```

### Content Minimum Standards
Every published piece must have:
- [ ] Unique `<h1>` with primary keyword
- [ ] Meta description under 200 chars
- [ ] At least 3 internal links
- [ ] Correct JSON-LD schema
- [ ] OG image (1200x630)
- [ ] FAQ section (minimum 3 Q&A pairs)

### Review Checklist
- [ ] Tone: direct, noun-first, no fluff
- [ ] Grammar: clean, no errors
- [ ] Facts: verified, no hallucinations
- [ ] Design Constitution: formatting passes review

---

## 4. Content Volume Scaling

### Atlas Free Tier impact
Content metadata (titles, slugs, status) is stored in the Growth DB. The actual article body lives as MDX files in the Astro repo. This means Atlas never stores full article text — it stores only registry data.

### Build time at scale
| Article Count | Approx Build Time | Mitigation |
|---|---|---|
| 0–100 | < 30s | None needed |
| 100–500 | 1–3 min | None needed |
| 500–2,000 | 5–15 min | Still within Vercel Free 45min limit |
| 2,000–5,000 | 15–40 min | Incremental builds, section-specific deploy hooks |
| 5,000+ | > 45 min | Evaluate Astro ISR or Vercel Pro |

---

*Last updated: Week 2 implementation.*
