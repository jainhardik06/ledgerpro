# Monetization Engine PRD

## Overview

Money OS monetization is built on two non-intrusive revenue streams: contextual advertising and affiliate partnerships. Both must operate within strict constraints:

1. **No ads in Docs** — documentation is sacred. Ads ruin trust with technical users.
2. **No ads on use case pages** — conversion-critical pages. Ads distract from sign-up.
3. **Ads only in Blog and Resources** — non-critical content where monetization is expected.
4. **Affiliates only for tools we actually recommend** — no paid placements dressed as recommendations.

**Revenue Target**: $0 in Month 1 → $500/mo by Month 6 → $2,000/mo by Month 12.

---

## Revenue Stream 1 — Contextual Advertising

### Platform Selection

| Platform | Requirements | Revenue Model | Best For |
|----------|-------------|---------------|----------|
| **Carbon Ads** | 10K+ page views, tech audience | CPM + CPC | Primary — tech-finance overlap |
| **Google AdSense** | No minimum, fast approval | CPC | Fallback if Carbon rejects |
| **EthicalAds** | Open source / tech tools | CPM | Alternative to Carbon |
| **BuySellAds** | 50K+ page views | Flat-rate or CPM | Phase 2 (scale) |

**Month 1-2 strategy**: Apply to Carbon Ads immediately. Fallback to AdSense if not accepted within 30 days.

### Ad Placement Rules

| Page Type | Ads Allowed | Max Ads | Position |
|-----------|-------------|---------|---------|
| Blog posts | Yes | 2 | In-content (after H2 #2) + sidebar |
| Resources | Yes | 1 | Sidebar or after intro paragraph |
| Comparisons | Yes | 1 | Sidebar only (never in-content) |
| Docs | **No** | 0 | Never |
| Use cases | **No** | 0 | Never |
| Homepage | **No** | 0 | Never |

### Ad Sizing Standards

```
Desktop sidebar:  300×250 (Medium Rectangle) or 160×600 (Wide Skyscraper)
In-content:       728×90 (Leaderboard) or 300×250
Mobile:           320×100 (Large Mobile Banner)
```

### Revenue Estimates

Traffic assumptions for Month 6 (10,000 monthly visitors):
- Blog: 60% of traffic = 6,000 sessions
- Typical CPM for finance/tech content: $3-8
- 2 ad units per blog post, 50% viewability
- **Estimated ad revenue**: $90-240/month at 10K visitors

At 50,000 visitors (Month 12):
- **Estimated ad revenue**: $450-1,200/month

### Implementation

1. Apply to Carbon Ads: `carbonads.com/become-a-publisher`
2. If accepted, add Carbon snippet to `BlogLayout.astro` sidebar
3. If rejected after 30 days, implement AdSense:
   - Add AdSense script to Layout.astro `<head>`
   - Place `<ins class="adsbygoogle">` in designated ad slots
4. Never use pop-ups, interstitials, or auto-play video ads

---

## Revenue Stream 2 — Affiliate Partnerships

### Affiliate Tool Strategy

Money OS users need other tools to run their businesses. Honest recommendations for tools that genuinely complement Money OS = natural affiliate revenue.

**Criteria for affiliate partnerships**:
- The tool must be genuinely useful for Money OS's audience
- We must have used or thoroughly evaluated the tool
- Commission rate must be meaningful (≥20% for SaaS or ≥$20 one-time)
- No sponsored placement — only tools we would recommend anyway

### Priority Affiliate Partners

#### Category 1 — Business Finance Stack

| Tool | Category | Commission | Audience Fit |
|------|----------|-----------|--------------|
| **Wise** (TransferWise) | International payments | $30-50 per signup | Freelancers, Agencies |
| **Mercury Bank** | Business banking (US) | $50-100 per funded account | Startups, Small Business |
| **Relay Financial** | Business banking | $25-75 per account | Small Business |
| **Brex** | Corporate cards | Varies | Startups |
| **Expensify** (ironic) | Expense management | 20% first year | For users who need receipt scanning |

#### Category 2 — Accounting & Tax

| Tool | Category | Commission | Audience Fit |
|------|----------|-----------|--------------|
| **Wave** | Accounting | 15% on paid | Freelancers |
| **QuickBooks** | Accounting | $50-100 per sale | Small Business |
| **TaxJar** | Sales tax automation | 20% recurring | Small Business |
| **1800Accountant** | Accounting services | $100+ per client | Small Business, Startups |

#### Category 3 — Freelancer Business Tools

| Tool | Category | Commission | Audience Fit |
|------|----------|-----------|--------------|
| **Bonsai** | Contracts + invoicing | 25% first payment | Freelancers |
| **HoneyBook** | Client management | 35% first month | Freelancers, Agencies |
| **AND.CO** | Invoicing + contracts | 20% MRR | Freelancers |
| **Deel** | Global payroll/contracts | Varies | Startups, Agencies |

#### Category 4 — Tools for Creators

| Tool | Category | Commission | Audience Fit |
|------|----------|-----------|--------------|
| **Gumroad** | Digital products | Not applicable | Creators |
| **Lemon Squeezy** | Digital products | 50% for referrals | Creators |
| **ConvertKit** | Email marketing | 30% recurring | Creators |
| **Podia** | Course platform | 30% recurring | Creators |

### Affiliate Revenue Estimates

At 5,000 monthly blog readers (Month 3):
- 2% click-through to affiliate links = 100 clicks/month
- 5% conversion on clicked tools = 5 conversions
- Average commission: $30
- **Estimated affiliate revenue**: $150/month at 5K blog readers

At 20,000 monthly blog readers (Month 6-9):
- **Estimated affiliate revenue**: $600-1,200/month

### Affiliate Link Implementation

1. Join each affiliate program (direct or via Impact/ShareASale/PartnerStack)
2. Store all affiliate links in `affiliate_links` MongoDB collection with `link_code`, `partner_name`, `commission_type`, `commission_amount`
3. Use consistent URL format: `https://discovermoneyos.webasthetic.in/go/[partner-slug]`
4. Implement redirect in `src/app/go/[slug]/route.ts` that:
   - Logs click to `affiliate_clicks` collection
   - Redirects to stored affiliate URL
5. Disclose all affiliate relationships per FTC guidelines

### Disclosure Requirements

**In-content disclosure** (every blog post with affiliate links):

```html
<p class="text-sm text-neutral-500 border border-neutral-800 p-3 rounded">
  This post contains affiliate links. Money OS may earn a commission if you 
  sign up for a recommended tool. We only recommend tools we have evaluated 
  and believe are genuinely useful for our users.
</p>
```

**Resources page header**:
```
Some links on this page are affiliate links. See our affiliate disclosure policy.
```

---

## Revenue Stream 3 — Future (Month 6+)

### Paid Tiers

As Money OS grows, introduce paid tiers for:
- Unlimited team members (free cap: 3)
- Direct bank connections (Plaid/Finbox integration)
- Advanced reporting (custom date ranges, team-level breakdowns)
- API access for automation
- Priority support

**Pricing target**: $9/month individual, $29/month team (5 seats)

At 0.5% freemium conversion on 10,000 monthly active users = 50 paying users = $450-1,450/month.

### Sponsored Content

Once traffic exceeds 20,000 monthly visitors:
- Accept sponsored blog posts from non-competing tools
- Minimum: $200/post with full editorial control
- Disclosure: "Sponsored" label on all sponsored content
- Not before Month 6 — credibility must come before monetization

---

## Monetization Calendar

| Month | Action |
|-------|--------|
| 1 | Apply to Carbon Ads. Set up affiliate_links collection. |
| 2 | Start linking to Wise and Bonsai in relevant blog posts. |
| 3 | Request affiliate access for QuickBooks and HoneyBook. |
| 4 | Create dedicated Resources page with curated tool recommendations. |
| 6 | Review ad revenue. If <$100/mo, audit traffic quality and ad placement. |
| 9 | Evaluate paid tier readiness based on user growth. |
| 12 | Launch first paid tier with annual plan discount. |

---

## Anti-Monetization Principles

These protect long-term trust over short-term revenue:

1. **Never recommend a tool because of the commission** — only recommend what you would use yourself
2. **Never put ads on Docs or use case pages** — these are conversion pages, not content
3. **Never use cookie consent pop-ups that obscure content** — if required, use a non-intrusive bottom banner
4. **Never sell user data** — no third-party data sharing beyond necessary analytics
5. **Never add ad networks that serve finance scams** — Google Display Network can surface crypto/debt scam ads; curate placement carefully
6. **Never implement intrusive ad formats** — no pop-ups, interstitials, auto-play video, or sticky mobile ads that cover content

---

## Metrics Tracking

All revenue metrics tracked in Growth DB:

```javascript
// Daily ad performance snapshot
db.ad_performance.insertOne({
  date: new Date(),
  ad_unit_id: ObjectId("..."),
  impressions: 1240,
  clicks: 18,
  ctr: 0.0145,
  revenue_usd: 4.32,
  cpm: 3.48
})

// Affiliate click
db.affiliate_clicks.insertOne({
  affiliate_link_id: ObjectId("..."),
  click_timestamp: new Date(),
  source_page: "/blog/expense-tracking-tips",
  utm_source: "blog",
  ip_hash: "sha256_hash"
})
```

Monthly revenue report query:
```javascript
db.ad_performance.aggregate([
  { $match: { date: { $gte: startOfMonth } } },
  { $group: { _id: null, total_revenue: { $sum: "$revenue_usd" } } }
])
```
