# Directory Operations Guide

## Overview

This guide covers the week-by-week operational process for directory submissions — from preparation through monitoring. Follow sequentially. Do not skip preparation steps; incomplete listings get rejected or rank poorly within directories.

---

## Week 1 Preparation

### Day 1 — Asset Creation

**Logo**
- Size: 512×512 PNG with transparent background
- Colors: white "M" monogram on `#000000` background (alternative: transparent bg)
- File: `public/brand/logo-512.png`
- Also create: 192×192 variant for smaller thumbnails

**Screenshots** (capture from live production app)
1. `dashboard.png` — Main workspace view showing transactions and budget summary
2. `transactions.png` — Transaction list with category filters visible
3. `reports.png` — Expense Summary report showing category breakdown

Export all at exactly 1280×800. Compress with Squoosh to <200KB each.

**Brand Assets Checklist**
- [ ] Logo 512×512 PNG
- [ ] Logo 192×192 PNG
- [ ] Screenshot 1: Dashboard (1280×800)
- [ ] Screenshot 2: Transactions (1280×800)
- [ ] Screenshot 3: Reports (1280×800)
- [ ] Favicon 32×32 PNG (for directory profile page)

### Day 2 — Content Finalization

Copy the description variants from `DIRECTORY_ENGINE_PRD.md`. Run through:
- [ ] No spelling errors
- [ ] No feature claims not live yet (remove "integrations" if not live)
- [ ] CTA links to `https://moneyos.app` (not staging)
- [ ] Category selection: "Expense Management" primary, "Business Finance" secondary

---

## Submission Schedule

### Week 1 (Days 3-7)

**Day 3: Product Hunt**
- Claim your product at producthunt.com/posts
- Schedule a formal launch date (separate from submission — see `PRODUCT_HUNT_LAUNCH_KIT.md`)
- For now: submit as "upcoming" to build followers before launch

**Day 4: G2**
1. Go to g2.com/products/new
2. Fill all fields — do not leave optional fields empty
3. Upload all 3 screenshots
4. Submit for review (3-5 business days)
5. Note: G2 requires verification. Use `hello@moneyos.app`

**Day 5: Capterra + GetApp**
- Capterra and GetApp are owned by Gartner — one submission covers both
- Submit at capterra.com/vendors
- Approval: 5-7 business days

**Day 6: AlternativeTo**
1. Sign up at alternativeto.net
2. Add product manually
3. List Money OS as alternative to: Expensify, Wave, YNAB, Zoho Expense, FreshBooks (Expense only)
4. Being listed as an alternative to high-DA tools builds category authority

**Day 7: SaaSHub + ToolFinder**
- SaaSHub: saashub.com/new-product
- ToolFinder: toolfinder.app/submit

### Week 2 (Days 8-14)

**Day 8: BetaList**
- betalist.com/submit
- Frame as early access — highlight free tier and upcoming features
- BetaList has active email subscribers who sign up for new tools

**Day 9: SoftwareAdvice**
- softwareadvice.com/vendor-registration
- Category: Expense Management Software

**Day 10: Indie Hackers**
- indiehackers.com/product/new
- Write a genuine "why I built this" paragraph — IH community reads these
- Share your MRR and growth story (even $0 MRR is fine for early-stage)

**Day 11-14: Slant, StackShare, Crunchbase**
- Slant: slant.co (community-driven, add and vote)
- StackShare: stackshare.io/stacks/new (tag as a stack tool)
- Crunchbase: crunchbase.com/organization/new (company profile, not product)

### Weeks 3-4

**Tier 3 directories** (see list in `DIRECTORY_ENGINE_PRD.md`)

**Review acquisition**:
- After first 10 users have been active for 7+ days, send a review request email
- Template: "You've been using Money OS for a week. If it's been useful, a 2-minute review on [G2/Capterra] helps others find it: [direct link]"

---

## Listing Management

### Monthly Maintenance (1 hour/month)

**Review monitoring**
- Log into G2, Capterra, and GetApp
- Respond to any reviews (positive or negative) within 48 hours
- Flag spam reviews for removal

**Listing updates**
- Update screenshots when major UI changes ship
- Add new features to the feature list
- Update "Last Updated" date if the directory shows it

**Status check**
- Confirm all listings are still live (directories occasionally delist inactive products)
- Check that backlinks are still resolving (use Ahrefs free tier or Moz Link Explorer)

### Quarterly Review

**DA Score Update**: Note current DA of each directory in the Growth DB

**Traffic Analysis**: Pull referral traffic per directory source from PostHog. Sources sending <5 visitors/month after 90 days are low-priority for maintenance.

**Review Count Targets**:
- G2: 5 reviews by Month 3 (unlocks "Recognized" status)
- Capterra: 3 reviews by Month 3

---

## Tracking in Growth DB

Log every submission in `directory_submissions`:

```javascript
// After submission
db.directory_submissions.insertOne({
  directory_name: "G2",
  directory_url: "https://www.g2.com",
  listing_url: null,              // null until live
  da_score: 90,
  tier: 1,
  submission_date: new Date(),
  status: "submitted",
  has_backlink: false,
  backlink_type: null,
  review_count: 0,
  rating: null,
  notes: "Submitted 2024-06-14. Pending review approval."
})

// After listing goes live
db.directory_submissions.updateOne(
  { directory_name: "G2" },
  {
    $set: {
      listing_url: "https://www.g2.com/products/money-os",
      status: "live",
      has_backlink: true,
      backlink_type: "dofollow",
      notes: "Live 2024-06-20. Claiming listing now."
    }
  }
)
```

---

## Backlink Verification

After each listing goes live, verify the backlink:

1. Go to listing URL
2. Inspect page source or use browser DevTools → Find anchor pointing to moneyos.app
3. Confirm `rel` attribute: `dofollow` (no rel) or `nofollow`
4. Log in Growth DB: `backlink_type: "dofollow"` or `"nofollow"`

**Note**: Most directories use `nofollow`. This still builds referral traffic and brand visibility. The SEO value comes from the combination of many directory listings signaling topical authority, not from individual link equity.

---

## Response Templates

### Review Request Email

```
Subject: Quick favor — help others find Money OS

Hi [Name],

You've been using Money OS for [X] days. I hope it's been useful for [their use case].

If it has, I'd really appreciate a 2-minute review on G2:
[Direct link to G2 review page]

Your honest take helps others in similar situations find the right tool. Even a short review makes a difference.

Thank you,
[Your name]
Money OS
```

### Review Response — Positive

```
Thank you so much for taking the time to leave a review. Really glad Money OS is 
helping you [reference their specific use case from the review]. 

We have [specific feature they mentioned in review] improvements in the pipeline — 
stay tuned.
```

### Review Response — Critical

```
Thank you for the honest feedback. You're right about [specific issue they raised].

[Current status]: [what you've done or are doing about it]

If you're willing, I'd love to connect directly to understand the full picture: 
hello@moneyos.app

Your feedback helps us prioritize correctly.
```

---

## Anti-Patterns to Avoid

**Do not**:
- Submit the same boilerplate description to every directory — customize at minimum the first paragraph for each directory's audience
- Leave optional fields blank — partial listings rank lower within directories
- Ignore review notifications — unresponded reviews lower your rating score
- Submit to low-DA spam directories — low-quality backlinks can trigger Google spam signals
- Request reviews in exchange for anything — G2/Capterra will remove them

**Do**:
- Prioritize directories with active user communities (G2, Capterra, Product Hunt, IH)
- Keep listings updated as the product evolves
- Respond to every review within 48 hours
- Use the same canonical URL (with or without `www`, consistent)
