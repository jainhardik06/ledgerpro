# Programmatic SEO Engine

## Overview

Money OS uses programmatic SEO pages to capture high-intent, long-tail search queries that primary navigation pages cannot rank for. These are keyword-targeted variants of core use case pages, built from a reusable layout with unique, researched content per page.

**Goal**: Rank for "[product category] for [audience]" queries with zero paid distribution.

---

## Page Inventory

### Tier 1 — Audience Pages (Broad Intent)

| Page | URL | Primary Keyword | Intent |
|------|-----|-----------------|--------|
| Freelancers | `/use-cases/freelancers` | money management for freelancers | Commercial |
| Agencies | `/use-cases/agencies` | expense management for agencies | Commercial |
| Student Clubs | `/use-cases/student-clubs` | club finance management | Commercial |
| Small Businesses | `/use-cases/small-businesses` | expense tracker small business | Commercial |
| Startups | `/use-cases/startups` | startup expense tracker | Commercial |
| Creators | `/use-cases/creators` | expense tracker for content creators | Commercial |

### Tier 2 — Keyword-Targeted Pages (Specific Intent)

| Page | URL | Primary Keyword | Monthly Volume Est. |
|------|-----|-----------------|---------------------|
| Expense Tracker Freelancers | `/use-cases/expense-tracker-freelancers` | expense tracker for freelancers | 2,400/mo |
| Budget Tracker Freelancers | `/use-cases/budget-tracker-freelancers` | budget tracker freelancers | 880/mo |
| Expense Tracker Agencies | `/use-cases/expense-tracker-agencies` | expense tracker for agencies | 480/mo |
| Budget Tracker Agencies | `/use-cases/budget-tracker-agencies` | budget tracker agencies | 210/mo |
| Club Finance Management | `/use-cases/club-finance-management` | club finance management software | 590/mo |
| Team Expense Management | `/use-cases/team-expense-management` | team expense management software | 1,300/mo |

---

## Architecture

### Reusable Layout

All 12 pages use `UseCaseLayout.astro`. The layout accepts data props and renders:

1. **Hero** — audience badge, H1, subheadline, dual CTA
2. **Benefits Grid** — 6 checkmark items, 3 columns
3. **Features Grid** — 6 feature cards, 2 columns, name + description
4. **FAQ Accordion** — `<details>/<summary>` HTML, no JavaScript
5. **CTA Section** — optional `ctaHeadline` prop, defaults to standard copy
6. **JSON-LD Schemas** — FAQPage + SoftwareApplication, injected per page

### Props Interface

```typescript
interface Props {
  title: string;           // <title> tag (include primary keyword)
  headline: string;        // H1
  subheadline: string;     // Paragraph below H1
  description: string;     // Meta description (155 chars max)
  audience: string;        // Badge label above H1
  slug: string;            // URL slug for canonical and JSON-LD
  benefits: string[];      // 6 items (checkmark grid)
  features: Array<{
    name: string;
    desc: string;
  }>;                      // 6 items (feature card grid)
  faqs: Array<{
    question: string;
    answer: string;
  }>;                      // 5 items minimum
  ctaHeadline?: string;    // Optional override for CTA section H2
}
```

---

## SEO Configuration Per Page

### Title Tag Formula

```
[Primary Keyword] — [Value Proposition] | Money OS
```

Examples:
- `Expense Tracker for Freelancers — Free & Accurate | Money OS`
- `Budget Tracker for Agencies — Per-Client & Overhead Budgets | Money OS`
- `Club Finance Management Software — Free for Organizations | Money OS`

### Meta Description Formula

Max 155 characters. Format:
```
Money OS is [product description]. [Primary feature]. [Secondary feature]. [Audience qualifier].
```

### H1 Formula

Benefit-first. Contains primary keyword naturally. No exact-match stuffing.

### FAQ Structure

Each FAQ page has 5+ questions. Questions should:
- Match the exact phrasing searchers use (pull from Google's "People Also Ask")
- Be answerable in 2-4 sentences
- Address objections, comparisons, and how-to questions
- Build FAQPage JSON-LD schema automatically

---

## Internal Linking Rules

### From Use Case Pages → Link To

| Destination | Anchor Text |
|-------------|-------------|
| Introduction doc | "see full documentation" |
| A related use case | natural mention in FAQ answer |
| Homepage | logo in TopNav (automatic) |
| Comparison page (when relevant) | "how Money OS compares to [tool]" |

### To Use Case Pages ← Link From

| Source | Context |
|--------|---------|
| Homepage "Who It's For" section | all 4 audience cards |
| Docs sidebar | "Use Cases" section |
| Other use case pages | FAQ cross-links |
| Blog posts | "related use case" inline links |

### Keyword Variants to Tier 1 Pages

The Tier 2 keyword pages do NOT duplicate Tier 1 content. They target distinct keyword intent:
- Tier 1 `/use-cases/freelancers` ranks for: "money management for freelancers", "freelance finance tool"
- Tier 2 `/use-cases/expense-tracker-freelancers` ranks for: "expense tracker for freelancers", "free expense tracking freelancers"

Different keyword intent = no cannibalization.

---

## JSON-LD Schema Per Page

### FAQPage Schema

Auto-generated from the `faqs` prop array:

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "[question]",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "[answer]"
      }
    }
  ]
}
```

### SoftwareApplication Schema

Static per page with audience-specific description:

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Money OS",
  "applicationCategory": "FinanceApplication",
  "operatingSystem": "Web",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "description": "[audience-specific description from props]"
}
```

---

## Expansion Strategy

### Phase 2 Page Ideas (Next 12 Pages)

| Keyword | URL |
|---------|-----|
| expense tracker for restaurants | `/use-cases/expense-tracker-restaurants` |
| nonprofit expense tracking | `/use-cases/nonprofit-expense-tracking` |
| expense tracker solopreneurs | `/use-cases/expense-tracker-solopreneurs` |
| budget management tool teams | `/use-cases/budget-management-teams` |
| invoice tracker freelancers | `/use-cases/invoice-tracker-freelancers` |
| client billing software agencies | `/use-cases/client-billing-agencies` |
| reimbursement tracker employees | `/use-cases/reimbursement-tracker-employees` |
| expense tracker consultants | `/use-cases/expense-tracker-consultants` |
| project expense tracker | `/use-cases/project-expense-tracker` |
| petty cash management software | `/use-cases/petty-cash-management` |
| cash flow tracker small business | `/use-cases/cash-flow-tracker-small-business` |
| financial dashboard startups | `/use-cases/financial-dashboard-startups` |

### Scaling Trigger

Add Phase 2 pages when Phase 1 pages start ranking (position 20-50 in GSC). Phase 1 pages validate the category before expanding into adjacent keywords.

### Automated Generation (Future)

When use case page count exceeds 50, migrate to a content collection model:
1. Store all use case data in `src/content/use-cases/*.mdx` with frontmatter fields matching `UseCaseLayout` props
2. Use `getStaticPaths()` + `getCollection('use-cases')` to generate all pages from one template file
3. No code changes needed per new page — only a new MDX file with frontmatter

```astro
// Future: src/pages/use-cases/[...slug].astro
export async function getStaticPaths() {
  const useCases = await getCollection('use-cases');
  return useCases.map(uc => ({
    params: { slug: uc.slug },
    props: { ...uc.data }
  }));
}
```

---

## Performance Requirements

All use case pages must score:

| Metric | Target |
|--------|--------|
| Lighthouse Performance | ≥95 |
| LCP | <2.5s |
| CLS | <0.1 |
| INP | <200ms |
| JS payload | 0KB (no client JS) |
| HTML size | <50KB |

Astro's default SSG + zero client JS ensures these targets are met without optimization work.

---

## Monitoring

Track per page in GSC after indexing:

- **Impressions**: target 100+/mo within 60 days of indexing
- **CTR**: target >2% with compelling title + meta description
- **Position**: target <20 within 90 days for Tier 2 keywords (lower competition)
- **Clicks**: conversion path from use case page → sign up tracked in PostHog

When a page reaches position 1-5, audit for:
1. Featured snippet opportunity (add a concise answer paragraph)
2. "People Also Ask" expansion (add FAQ questions from SERP)
3. Internal link volume (add more links to the high-ranking page)
