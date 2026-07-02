# Affiliate System

## Architecture

All affiliate links use a redirect layer hosted on the main Next.js app. This provides:
- Click tracking in MongoDB
- Clean URLs for readers (`moneyos.app/go/wise` vs raw affiliate URL)
- Ability to update destination URLs without changing content
- Centralized disclosure and UTM management

---

## Redirect Implementation

### Route Handler

```typescript
// src/app/go/[slug]/route.ts

import { NextResponse } from 'next/server';
import { connectGrowthDb } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const db = await connectGrowthDb();
  
  const link = await db.collection('affiliate_links').findOne({
    slug: params.slug,
    is_active: true
  });
  
  if (!link) {
    return NextResponse.redirect('https://moneyos.app');
  }
  
  // Log click (fire-and-forget — don't await)
  db.collection('affiliate_clicks').insertOne({
    affiliate_link_id: link._id,
    click_timestamp: new Date(),
    source_page: request.headers.get('referer') || null,
    user_agent: request.headers.get('user-agent') || null,
    ip_hash: null, // Do not store raw IPs — hash only if needed for fraud detection
  }).catch(() => {}); // Swallow logging errors — never block the redirect
  
  return NextResponse.redirect(link.destination_url, { status: 302 });
}
```

### MongoDB Schema

```javascript
// affiliate_links collection
{
  _id: ObjectId,
  slug: "wise",                           // URL: /go/wise
  partner_name: "Wise (TransferWise)",
  destination_url: "https://wise.com/invite/...",
  program_url: "https://wise.com/affiliates",
  commission_type: "flat",                 // flat | percentage | recurring
  commission_amount: 35,
  commission_currency: "USD",
  payment_threshold: 50,                   // minimum payout
  payment_schedule: "monthly",
  category: "banking",
  audience: ["freelancers", "agencies"],
  content_placement: [                     // which pages/posts use this link
    "/blog/best-banking-for-freelancers",
    "/use-cases/freelancers"               // Note: only if genuinely helpful — no ads on use case pages
  ],
  is_active: true,
  created_at: ISODate,
  last_updated: ISODate,
  notes: "Pays $35 per funded account. 30-day cookie."
}

// affiliate_clicks collection (TTL: 180 days)
{
  _id: ObjectId,
  affiliate_link_id: ObjectId,
  click_timestamp: ISODate,
  source_page: "/blog/...",
  user_agent: "Mozilla/5.0...",
  ip_hash: null,
  converted: false,                        // updated manually when conversion is confirmed
  conversion_id: null                      // from affiliate_conversions when tracked
}

// affiliate_conversions collection
{
  _id: ObjectId,
  affiliate_link_id: ObjectId,
  click_id: ObjectId,                      // ref to affiliate_clicks
  conversion_timestamp: ISODate,
  commission_earned: 35.00,
  status: "pending",                       // pending | confirmed | paid
  payout_date: null,
  notes: "Wise conversion confirmed in partner dashboard 2024-07-01"
}
```

---

## Link Inventory

### Initial Links to Create

```javascript
db.affiliate_links.insertMany([
  {
    slug: "wise",
    partner_name: "Wise",
    destination_url: "https://wise.com/invite/u/XXXXX",
    commission_type: "flat",
    commission_amount: 35,
    commission_currency: "USD",
    category: "banking",
    audience: ["freelancers", "agencies", "creators"],
    is_active: true,
    notes: "International money transfers. Great for freelancers with foreign clients."
  },
  {
    slug: "bonsai",
    partner_name: "Bonsai",
    destination_url: "https://www.hellobonsai.com/r/XXXXX",
    commission_type: "percentage",
    commission_amount: 25,
    commission_currency: "USD",
    category: "invoicing",
    audience: ["freelancers"],
    is_active: true,
    notes: "Contracts + invoicing for freelancers. 25% of first payment."
  },
  {
    slug: "honeybook",
    partner_name: "HoneyBook",
    destination_url: "https://www.honeybook.com/referral/XXXXX",
    commission_type: "percentage",
    commission_amount: 35,
    commission_currency: "USD",
    category: "client-management",
    audience: ["freelancers", "agencies"],
    is_active: true,
    notes: "Client management + invoicing. 35% of first month."
  },
  {
    slug: "mercury",
    partner_name: "Mercury Bank",
    destination_url: "https://mercury.com/r/XXXXX",
    commission_type: "flat",
    commission_amount: 75,
    commission_currency: "USD",
    category: "banking",
    audience: ["startups", "small-businesses"],
    is_active: true,
    notes: "US business banking. $75 per funded account. US entities only."
  }
])
```

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
[Wise](https://moneyos.app/go/wise)* is the best option for international freelancers.

*Affiliate link — we earn a small commission if you sign up.
```

---

## Partner Onboarding Process

For each new affiliate partnership:

1. **Apply** to the affiliate program directly or via their network (Impact, ShareASale, PartnerStack, Paddle)
2. **Get approval** (usually 1-5 business days)
3. **Generate tracking link** from partner dashboard
4. **Insert into MongoDB** `affiliate_links` collection with the slug you choose
5. **Test the redirect**: `https://moneyos.app/go/[slug]` → should redirect to partner URL
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
