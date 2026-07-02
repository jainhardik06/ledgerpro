# Internal Linking Strategy

> **Why this matters**: Internal links are how link equity flows through a site. A page with one external backlink can rank for hundreds of keywords if your internal linking routes authority to it correctly. This is free SEO leverage.

---

## 1. The Hub-and-Spoke Model

Money OS Discovery uses a hub-and-spoke internal linking architecture.

```
HUB PAGES (Category Index)
├── /blog              ← receives links from all blog posts
├── /docs              ← receives links from all doc pages
├── /comparisons       ← receives links from blog, use cases
├── /use-cases         ← receives links from blog, comparisons
└── /resources         ← receives links from blog, docs

SPOKE PAGES (Individual Content)
├── Each blog post links to 1–3 other blog posts
├── Each blog post links to 1–2 docs pages
├── Each blog post links to 1 comparison or use case
├── Each doc page links to related docs
└── Each resource links to 2–3 related blog posts
```

Authority flows up to hub pages, which rank for competitive head terms.
Spoke pages capture long-tail traffic and pass authority up the chain.

---

## 2. Mandatory Internal Links Per Content Type

### Blog Posts (minimum 3, maximum 6 internal links)

| Link Target | Purpose | Anchor Text |
|---|---|---|
| Related blog post (1–2) | Time on site, topic depth | Descriptive keyword phrase |
| Relevant doc page (1) | Product credibility | Feature name |
| Comparison or use case (1) | Funnel movement | Audience + need phrase |
| Hub page `/blog` (optional) | Category authority | "`more articles`" or omit |

### Documentation Pages (minimum 2, maximum 5)

| Link Target | Purpose | Anchor Text |
|---|---|---|
| Previous doc in sequence (1) | Navigation flow | ← Previous section name |
| Next doc in sequence (1) | Navigation flow | Next section name → |
| Related blog posts (1–2) | Deeper learning | Descriptive phrase |
| Related use case (optional) | Conversion nudge | Audience name |

### Comparison Pages (minimum 4)

| Link Target | Purpose | Anchor Text |
|---|---|---|
| Relevant use case (1) | Audience specificity | Audience type |
| /docs/getting-started (1) | Product credibility | "get started" |
| Related blog post (1–2) | Content depth | Topic phrase |
| Another comparison (1) | Comparison cluster | Competitor name |

### Use Case Pages (minimum 3)

| Link Target | Purpose | Anchor Text |
|---|---|---|
| Relevant blog posts (1–2) | Content depth | Topic phrase |
| Relevant doc pages (1) | Feature validation | Feature name |
| Related use case (1) | Cross-audience capture | Audience phrase |

### Resource Pages (minimum 2)

| Link Target | Purpose | Anchor Text |
|---|---|---|
| Relevant blog posts (2–3) | Content depth | Topic phrase |
| Relevant doc page (1) | Product connection | Feature name |

---

## 3. Anchor Text Rules

### Never use:
- "`click here`"
- "`read more`"
- "`this article`"
- "`here`"
- "`link`"

### Always use:
- Descriptive keyword phrases that describe the destination
- Natural language that fits the sentence context
- Variety — same destination can have different anchor text

### Anchor text examples:

```
BAD:  "Click here to read about expense tracking."
GOOD: "Expense tracking for freelancers requires categorizing every business purchase."
      (where "expense tracking for freelancers" links to /blog/expense-tracking-for-freelancers)
```

---

## 4. Link Placement Rules

### Placement priority (highest to lowest):

1. **In-body, within the first 300 words** — highest SEO weight
2. **In-body, mid-article** — standard weight
3. **Related content block at article end** — moderate weight, high UX value
4. **Sidebar or doc navigation** — low SEO weight, high UX value

### Never place links:
- In the hero section (before any content)
- In the final CTA paragraph (dilutes conversion focus)
- As the first word of a sentence
- In meta descriptions

---

## 5. Comparison Cluster Architecture

Comparison pages work best as a cluster. Each comparison links to the others:

```
/comparisons/money-os-vs-quickbooks
  → links to /comparisons/money-os-vs-freshbooks
  → links to /comparisons/money-os-vs-wave

/comparisons/money-os-vs-freshbooks
  → links to /comparisons/money-os-vs-quickbooks
  → links to /comparisons/money-os-vs-xero
```

This creates a "comparison cluster" that ranks Google for searches like "`quickbooks alternatives`" or "`best expense tracker for small business`".

---

## 6. Blog Pillar Cluster Architecture

High-volume topics use a pillar + cluster model:

### Example Pillar: Freelance Finance

```
PILLAR PAGE: /blog/freelance-finance-guide (comprehensive, 3,000+ words)
CLUSTER PAGES:
  /blog/expense-tracker-for-freelancers
  /blog/freelance-tax-preparation
  /blog/freelance-invoicing-guide
  /blog/freelancer-budget-template
  /blog/quarterly-tax-for-freelancers
```

**Rules:**
- Every cluster page links to the pillar page
- The pillar page links to every cluster page
- Cluster pages do NOT link to each other (to avoid link dilution)

---

## 7. Automation Readiness

At 500+ articles, manual internal linking is impossible. The future AI pipeline will:

1. At brief generation time, query the Growth DB `blog_posts` collection for thematically related articles
2. Embed `[[related_slug]]` markers in the generated MDX
3. At Astro build time, resolve markers to actual links
4. Human reviewer validates during content review

---

## 8. Broken Link Prevention

Every MDX file uses slug-based links (`/blog/expense-tracker-for-freelancers`), not file-path links (`../expense-tracker.mdx`).

At build time, Astro validates all internal links. A broken internal link fails the CI build. This ensures zero broken links in production.

---

*Internal linking is infrastructure. The compound effect of correct linking over 12 months is worth more than any single content piece.*
