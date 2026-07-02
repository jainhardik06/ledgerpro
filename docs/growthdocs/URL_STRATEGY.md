# URL Strategy

> **Principle**: URLs are permanent. A URL changed is a link lost, a ranking dropped, a user confused. Design URLs for humans first, then for SEO. Never change a published URL.

---

## 1. URL Design Rules

### Rule 1: Semantic over structural

```
WRONG: /p/123-expense-tracker
RIGHT: /blog/expense-tracker-for-freelancers
```

### Rule 2: Keyword-rich but human-readable

```
WRONG: /blog/the-5-biggest-finance-mistakes-that-agency-founders-make-in-2025
RIGHT: /blog/agency-finance-mistakes
```

Max URL length: 75 characters (excluding domain).

### Rule 3: All lowercase, hyphenated

```
WRONG: /blog/ExpenseTracker_ForFreelancers
RIGHT: /blog/expense-tracker-for-freelancers
```

### Rule 4: No dates in blog URLs

Dates in URLs signal stale content to users and require redirects when updated.

```
WRONG: /blog/2025/01/15/expense-tracker-for-freelancers
RIGHT: /blog/expense-tracker-for-freelancers
```

Exception: Changelog uses `/changelog/2025-01` because the date is the content.

### Rule 5: No trailing slashes

```
WRONG: /blog/expense-tracker-for-freelancers/
RIGHT: /blog/expense-tracker-for-freelancers
```

Astro config: `trailingSlash: 'never'`

---

## 2. URL Schema by Section

### 2.1 Homepage
```
https://discover.moneyos.webasthetic.in/
```

### 2.2 Blog
```
/blog                                          → Blog index
/blog/{slug}                                   → Individual post

Examples:
/blog/expense-tracker-for-freelancers
/blog/agency-budget-management-guide
/blog/how-to-prepare-for-tax-season
/blog/financial-dashboard-best-practices
```

### 2.3 Documentation
```
/docs                                          → Docs index
/docs/{section}                                → Section index
/docs/{section}/{slug}                         → Individual doc

Examples:
/docs/getting-started/introduction
/docs/getting-started/creating-workspace
/docs/transactions/bank-import
/docs/budgets/creating-budgets
/docs/reports/expense-reports
/docs/security/two-factor-authentication
```

### 2.4 Changelog
```
/changelog                                     → Changelog index
/changelog/{year-month}                        → Monthly entry

Examples:
/changelog/2025-01
/changelog/2025-02
/changelog/2025-03
```

### 2.5 Comparisons
```
/comparisons                                   → Comparisons index
/comparisons/money-os-vs-{competitor}          → Comparison page

Examples:
/comparisons/money-os-vs-quickbooks
/comparisons/money-os-vs-freshbooks
/comparisons/money-os-vs-wave
/comparisons/money-os-vs-xero
/comparisons/money-os-vs-honeybook
/comparisons/money-os-vs-spreadsheets
```

### 2.6 Use Cases
```
/use-cases                                     → Use cases index
/use-cases/{audience}                          → Audience landing page

Examples:
/use-cases/freelancers
/use-cases/agencies
/use-cases/student-clubs
/use-cases/small-businesses
/use-cases/startups
/use-cases/creators
/use-cases/consultants
/use-cases/nonprofits
```

### 2.7 Resources
```
/resources                                     → Resources index
/resources/{slug}                              → Individual resource

Examples:
/resources/freelancer-expense-tracker-template
/resources/agency-budget-template
/resources/freelance-rate-calculator
/resources/q4-tax-preparation-checklist
/resources/financial-runway-calculator
```

### 2.8 Programmatic SEO (future)
```
/for/{audience}                                → Audience variant
/tools/{tool-name}                             → Tool type pages
/finance-for/{industry}                        → Industry variant

Examples:
/for/freelance-designers
/for/indie-hackers
/for/saas-founders
/finance-for/creative-agencies
/finance-for/tech-startups
```

---

## 3. URL Permanence Policy

Once a URL is published (status: `published`), it must **never** change.

If a title changes, the URL does NOT change.
If a page is restructured, the old URL gets a 301 redirect to the new URL.
If a page is deleted, a 410 (Gone) is returned — never a 404.

**Redirect management**: Use Vercel's `vercel.json` redirect rules:
```json
{
  "redirects": [
    {
      "source": "/blog/old-slug",
      "destination": "/blog/new-slug",
      "permanent": true
    }
  ]
}
```

---

## 4. URL Taxonomy for Programmatic Scaling

At 1,000+ pages, manual URL creation is impossible. URL patterns are generated programmatically from data templates.

### Pattern Templates

| Template | Variable | Output |
|---|---|---|
| `/blog/{verb}-{noun}-for-{audience}` | `expense-tracker`, `freelancers` | `/blog/expense-tracker-for-freelancers` |
| `/use-cases/{audience}` | `agencies` | `/use-cases/agencies` |
| `/comparisons/money-os-vs-{competitor}` | `quickbooks` | `/comparisons/money-os-vs-quickbooks` |
| `/docs/{section}/{feature}` | `budgets`, `alerts` | `/docs/budgets/alerts` |

### Slug Generation Rules (enforced at content creation)
1. Lowercase all characters
2. Replace spaces with hyphens
3. Remove special characters (`?`, `!`, `&`, `'`, etc.)
4. Trim to 70 characters maximum
5. No consecutive hyphens
6. No leading or trailing hyphens

---

## 5. URL Conflict Resolution

When two articles would produce the same slug:
- Preferred: rename one article to be more specific
- Fallback: append `-guide`, `-tutorial`, or `-{year}` suffix
- Never: use numeric suffixes (`-1`, `-2`)

---

## 6. Discovery Domain Architecture

```
discover.moneyos.webasthetic.in     → Astro Discovery Site (this)
moneyos.webasthetic.in              → SaaS Product
```

The subdomain `discover.` separates SEO equity cleanly. The discovery site can be migrated to its own domain (e.g., `moneyos.guide`) in the future without any product disruption.

---

*URL strategy is final at publication. No URL in the published state should ever be changed without a permanent redirect in place.*
