# Ad Placement System

## Architecture Overview

The ad placement system runs on Astro's static site with no server-side logic. Ads are injected by third-party scripts (Carbon Ads / AdSense) directly into designated slot elements. No custom ad server is needed at current scale.

**Constraint**: Ads only on Blog and Resources sections. Docs and use case pages are permanently ad-free.

---

## Ad Slot Definitions

### Slot 1 — Blog Sidebar (Desktop Only)

**Component**: Sidebar right column on blog posts, visible only on `xl:` breakpoint and above.

```astro
<!-- Blog sidebar ad slot -->
<div class="hidden xl:block sticky top-20" id="ad-sidebar">
  <p class="text-xs text-neutral-600 uppercase tracking-widest mb-2">Sponsored</p>
  <!-- Carbon Ads script injected here -->
  <script async type="text/javascript" src="//cdn.carbonads.com/carbon.js?serve=XXXXXXXX&placement=discovermoneyosapp" id="_carbonads_js"></script>
</div>
```

**Size**: 300×250 (Medium Rectangle) or Carbon's native format (130×100 + text)
**Condition**: Only on blog posts with 1000+ word content. Short posts get no sidebar ad.

### Slot 2 — In-Content Blog Ad (After Section 2)

**Position**: After the second H2 heading in blog posts. Only fires for posts over 1,500 words.

```astro
<!-- In-content ad placement — inserted by BlogLayout.astro after second H2 -->
<div class="my-8 p-4 border border-neutral-800 rounded" id="ad-in-content">
  <p class="text-xs text-neutral-600 mb-2">Advertisement</p>
  <ins class="adsbygoogle"
    style="display:block"
    data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
    data-ad-slot="XXXXXXXXXX"
    data-ad-format="auto"
    data-full-width-responsive="true"></ins>
</div>
```

**Fallback behavior**: If no ad fills within 2 seconds (no-fill response), the container is hidden with `display:none`.

### Slot 3 — Resources Page Sidebar

**Position**: Right sidebar on the `/resources` index page.

```astro
<div class="border border-neutral-800 rounded p-4" id="ad-resources">
  <p class="text-xs text-neutral-600 mb-2">Sponsored</p>
  <!-- Carbon or AdSense slot -->
</div>
```

---

## Carbon Ads Integration (Primary)

### Approval Process

1. Apply at `carbonads.com`
2. Requirements: 10K monthly page views, tech/finance audience, clean UX
3. Approval time: 1-3 weeks
4. If rejected: reapply at 25K page views or apply to EthicalAds as alternative

### Implementation

After Carbon approval, replace placeholder with actual `serve` and `placement` IDs:

```html
<script async type="text/javascript" 
  src="//cdn.carbonads.com/carbon.js?serve=CE7DTKJM&placement=discovermoneyosapp" 
  id="_carbonads_js">
</script>
```

### Carbon Styling Override

Carbon injects its own HTML structure. Override to match design system:

```css
/* money-os-discovery/src/styles/global.css */

#carbonads {
  background: transparent;
  border: 1px solid #262626;
  border-radius: 6px;
  padding: 12px;
  font-family: var(--font-sans);
}

#carbonads .carbon-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

#carbonads .carbon-img img {
  border-radius: 4px;
  width: 100%;
  height: auto;
}

#carbonads .carbon-text {
  font-size: 12px;
  color: #a3a3a3;
  line-height: 1.4;
}

#carbonads .carbon-poweredby {
  font-size: 10px;
  color: #525252;
  text-decoration: none;
}
```

---

## AdSense Integration (Fallback)

### Setup

1. Apply at `adsense.google.com`
2. Add site: `discover.moneyos.app`
3. Paste verification code in `<head>` via Layout.astro
4. Create ad units in AdSense dashboard: "Blog Sidebar", "In-Content"
5. Add ad unit code to the designated slots

### Performance Configuration

```javascript
// Auto ads disabled — manual placement only
// In AdSense dashboard: Auto ads → Off
// Manual ad units only
```

**Why manual placement**: Auto ads insert ads into Docs and use case pages if not controlled. Manual placement ensures ads only appear in approved slots.

### AdSense Policy Compliance

- Finance content: AdSense allows finance content but prohibits "get rich quick" or misleading financial claims
- Review all blog posts for AdSense compliance before publishing
- No ads on pages that make specific financial return claims

---

## BlogLayout.astro — Ad Integration Pattern

The `BlogLayout.astro` component handles ad slot injection automatically based on post metadata:

```astro
---
interface Props {
  title: string;
  description: string;
  wordCount?: number;
  publishDate: Date;
  // ... other props
}

const { wordCount = 0 } = Astro.props;
const showSidebarAd = wordCount >= 1000;
const showInContentAd = wordCount >= 1500;
---

<article class="max-w-2xl mx-auto">
  <!-- Article content renders here -->
  <slot />
</article>

{showSidebarAd && (
  <aside class="hidden xl:block w-72">
    <div id="ad-sidebar">
      <!-- Carbon or AdSense slot -->
    </div>
  </aside>
)}
```

**Word count injection**: The MDX frontmatter includes a `wordCount` field updated at publish time. Alternatively, calculate at build time from content length.

---

## Ad Performance Tracking

### MongoDB Schema (from `GROWTH_DATABASE_ARCHITECTURE.md`)

```javascript
db.ad_performance.insertOne({
  date: new Date(),
  ad_unit_id: ObjectId("..."),        // ref to ad_units collection
  ad_placement_id: ObjectId("..."),   // ref to ad_placements collection  
  impressions: 1240,
  clicks: 18,
  ctr: 0.0145,
  revenue_usd: 4.32,
  cpm: 3.48
})
```

### Carbon Ads Reporting

Carbon Ads provides a dashboard at `carbonads.com/publishers`. Pull monthly stats manually and log to Growth DB on the 1st of each month.

Future: Use Carbon Ads API (when available) to automate daily sync.

### Revenue Benchmarks

| Traffic | Expected Monthly Revenue |
|---------|--------------------------|
| 5,000 blog sessions | $15-40 (Carbon) |
| 10,000 blog sessions | $30-80 (Carbon) |
| 25,000 blog sessions | $75-200 (Carbon) |
| 50,000 blog sessions | $150-400 (Carbon) |
| 100,000 blog sessions | $300-800 (Carbon) |

Finance content CPM is higher than general content ($3-8 vs $1-3) because advertisers targeting financial decision-makers pay more.

---

## Ad Quality Standards

### Allowed Ad Categories

- Financial software tools
- Accounting and bookkeeping services
- Business banking and fintech
- Productivity tools
- Developer tools (tech-adjacent)

### Blocked Categories (Manually Block in Carbon/AdSense)

- Cryptocurrency and NFTs
- "Get rich quick" schemes
- Debt consolidation with misleading claims
- Credit card advertising with hidden fees
- Personal loan advertising without APR disclosure

In AdSense: Sensitive Category Blocks → Block Finance > Cryptocurrency, Finance > Loans, Finance > Credit

---

## Ad-Free Guarantee

The following pages will **never** display ads, regardless of traffic or revenue pressure:

1. All documentation pages (`/docs/*`)
2. All use case pages (`/use-cases/*`)
3. Homepage (`/`)
4. Comparison pages (`/comparisons/*`)
5. Pricing page (when it exists)
6. Any page in the sign-up or onboarding flow

This is a product principle, not a configuration option. It is enforced by never including ad slot markup in `DocLayout.astro`, `UseCaseLayout.astro`, or `Layout.astro` directly.
