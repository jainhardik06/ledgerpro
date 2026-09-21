# Affiliate System

## Architecture

All affiliate links use a redirect layer hosted on the **money-os-discovery**
Astro site (an on-demand serverless route). This provides:
- Click tracking in the Growth DB (MongoDB)
- Clean URLs for readers (`discovermoneyos.webasthetic.in/go/wise` vs raw affiliate URL)
- Ability to update destination URLs without changing content (DB rows take
  precedence over the static fallback map)
- Centralized disclosure and UTM management

---

## Redirect Implementation

### Route Handler (as implemented)

```typescript
// money-os-discovery/src/pages/go/[slug].ts  (Astro APIRoute, prerender = false)

import type { APIRoute } from 'astro';
import { getGrowthDb } from '../../lib/growth-db';

export const GET: APIRoute = async ({ params, request }) => {
  const slug = (params.slug ?? '').toLowerCase();

  let target: string | null = null;
  // 1. Prefer the database row (source of truth — links can change without a deploy).
  try {
    const db = await getGrowthDb();
    const link = await db.collection('affiliate_links').findOne({ slug, active: { $ne: false } });
    if (link?.target_url) {
      target = link.target_url as string;
      // 2. Fire-and-forget click log — never blocks or breaks the redirect.
      void db.collection('affiliate_clicks').insertOne({
        slug, target_url: target,
        user_agent: request.headers.get('user-agent') ?? '',
        referer: request.headers.get('referer') ?? '',
        clicked_at: new Date(),
      }).catch(() => {});
    }
  } catch { /* DB unavailable — fall through to the static map */ }

  target ??= FALLBACK[slug] ?? null;   // static fallback for core partners
  if (!target) return new Response(null, { status: 302, headers: { Location: '/comparisons' } });
  return new Response(null, { status: 302, headers: { Location: target, 'Cache-Control': 'no-store' } });
};
```

### MongoDB Schema (as implemented — seeded by `scripts/seed-growth-db.mjs`)

```javascript
// affiliate_links collection (unique index on slug)
{
  _id: ObjectId,
  slug: "wise",                           // URL: /go/wise
  partner: "Wise",
  target_url: "https://wise.com/",
  category: "banking",
  active: true,
  recommended_for: "International payments & FX",
  added_at: ISODate,
  created_at: ISODate
}

// affiliate_clicks collection (one row per redirect served from a DB row)
{
  _id: ObjectId,
  slug: "wise",
  target_url: "https://wise.com/",
  user_agent: "Mozilla/5.0...",
  referer: "https://discovermoneyos.webasthetic.in/blog/...",
  clicked_at: ISODate
}

// affiliate_conversions collection — exists in the growth DB (created by the
// seed script) but is not yet written by any code; conversions are confirmed
// manually in partner dashboards until tracking is wired.
```

---

## Link Inventory

### Seeded Links (as implemented — `scripts/seed-growth-db.mjs`)

The seed upserts these rows by `slug` (replace `target_url` with your tracked
referral link once each partner program approves you — the DB row always wins
over the static fallback):

```javascript
// money-os-discovery/scripts/seed-growth-db.mjs — seedAffiliateLinks()
const links = [
  { slug: 'wise',      partner: 'Wise',        target_url: 'https://wise.com/',                  category: 'banking',           active: true, recommended_for: 'International payments & FX', added_at: now },
  { slug: 'bonsai',    partner: 'Bonsai',      target_url: 'https://www.hellobonsai.com/',       category: 'freelance-suite',   active: true, recommended_for: 'Freelance contracts & invoicing', added_at: now },
  { slug: 'honeybook', partner: 'HoneyBook',   target_url: 'https://www.honeybook.com/',         category: 'client-management', active: true, recommended_for: 'Client management for creatives', added_at: now },
  { slug: 'mercury',   partner: 'Mercury',     target_url: 'https://mercury.com/',               category: 'banking',           active: true, recommended_for: 'Startup business banking', added_at: now },
  { slug: 'quickbooks', partner: 'QuickBooks', target_url: 'https://quickbooks.intuit.com/',     category: 'accounting',        active: true, recommended_for: 'Full accounting when you outgrow tracking', added_at: now },
  { slug: 'wave',      partner: 'Wave',        target_url: 'https://www.waveapps.com/',          category: 'accounting',        active: true, recommended_for: 'Free invoicing + bookkeeping', added_at: now },
  { slug: 'expensify', partner: 'Expensify',   target_url: 'https://www.expensify.com/',         category: 'expense',           active: true, recommended_for: 'Receipt scanning at company scale', added_at: now },
];
```

Commission terms (type, amount, payout schedule) are tracked in the partner
dashboards, not in the collection — add them to `recommended_for` or a notes
field if you want them alongside the link.

---

## Content Placement Rules

### Where to Place Affiliate Links

**Blog Posts** — Primary placement location.

Place affiliate links:
- In a "Tools we recommend" section at the end of relevant posts
- Inline when genuinely the best recommendation for the context
- Never more than 3 affiliate links per post

**Resources Page** — Curated tool directory.

The `/resources` page lists tools by category with affiliate links for all enrolled tools. Non-affiliate tools also listed (never exclude a good tool just because there's no commission).

### Where NOT to Place Affiliate Links

- Documentation pages — never commercial
- Use case pages — focus is on Money OS sign-up, not outbound
- Comparison pages — affiliate links in comparisons are a conflict of interest (even if disclosed)
- Homepage — too early in the funnel

---

## Disclosure Standards

### FTC Compliance

All affiliate relationships must be disclosed. This is both legally required (FTC 16 CFR Part 255) and an ethical standard.

**Blog post top disclosure**:

```html
<div class="text-sm text-neutral-500 border border-neutral-800 rounded p-3 mb-6">
  <strong>Affiliate disclosure:</strong> Some links in this post are affiliate links. 
  Money OS may earn a commission if you sign up — at no additional cost to you. 
  We only recommend tools we've evaluated and believe are genuinely useful.
</div>
```

**Resources page header**:

```html
<p class="text-sm text-neutral-500">
  Some links below are affiliate links. 
  <a href="/docs/affiliate-policy" class="underline">See our affiliate policy.</a>
</p>
```

**Inline link disclosure** (optional, for high-value links):

```markdown
[Wise](https://discovermoneyos.webasthetic.in/go/wise)* is the best option for international freelancers.

*Affiliate link — we earn a small commission if you sign up.
```

---

## Partner Onboarding Process

For each new affiliate partnership:

1. **Apply** to the affiliate program directly or via their network (Impact, ShareASale, PartnerStack, Paddle)
2. **Get approval** (usually 1-5 business days)
3. **Generate tracking link** from partner dashboard
4. **Insert into MongoDB** `affiliate_links` collection with the slug you choose
5. **Test the redirect**: `https://discovermoneyos.webasthetic.in/go/[slug]` → should redirect to partner URL
6. **Confirm click logging**: Check `affiliate_clicks` collection after clicking
7. **Add disclosure** to any page that links to this partner

---

## Monthly Reconciliation

On the 1st of each month:

1. **Log into each partner dashboard**
   - Check click counts
   - Check confirmed conversions
   - Check earned commissions (pending vs confirmed)

2. **Update MongoDB**
   - Update `converted: true` on any confirmed clicks
   - Insert new `affiliate_conversions` records for confirmed payouts

3. **Revenue Report Query**:
```javascript
db.affiliate_conversions.aggregate([
  { 
    $match: { 
      conversion_timestamp: { 
        $gte: new Date('2024-06-01'), 
        $lt: new Date('2024-07-01')
      }
    }
  },
  {
    $group: {
      _id: "$affiliate_link_id",
      total_earned: { $sum: "$commission_earned" },
      conversion_count: { $sum: 1 }
    }
  }
])
```

4. **Deactivate underperforming links** — if a link has 0 conversions after 200 clicks, either the tool is wrong for the audience or the placement context needs revision. Do not replace with a worse tool just because it pays more.

---

## Anti-Pattern Rules

**Never**:
- Recommend a tool primarily because of commission rate
- Hide that a link is an affiliate link
- Include affiliate links in documentation
- Use affiliate links in email sequences without disclosure
- Create fake "reviews" or "comparisons" where the winner is predetermined by commission

**Always**:
- List the non-affiliated alternative in every category even if it earns nothing
- Include an honest "who this is NOT for" section in tool recommendations
- Update or remove affiliate links for tools that have declined in quality
- Put user interest above commission revenue in every content decision
