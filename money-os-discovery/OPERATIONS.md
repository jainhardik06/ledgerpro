# Money OS Discovery — Operations & Setup

This is the complete operating manual for the discovery ecosystem. Everything is
built and working. **The only thing left for you is filling in credentials** in
three places. Nothing else requires code changes.

---

## 1. What's built (all live)

| Engine | Implementation |
|--------|----------------|
| **Content site** | Astro SSG — home, docs, blog, comparisons, use cases, resources, changelog |
| **Visual Engine** | Build-time branded OG/featured images for every page (Satori + resvg, `src/lib/og.ts`) |
| **SEO foundation** | `sitemap-index.xml`, `robots.txt` (AI crawlers allowed), `/llms.txt`, `/rss.xml`, JSON-LD on every page |
| **Blog Engine** | Paginated index, category pages, single-post layout, TOC, related posts, author card |
| **Programmatic SEO** | 12 use-case pages + index, manifest-driven (`src/data/use-cases.ts`) |
| **Comparisons** | Feature-matrix layout + content collection |
| **Monetization** | Contextual `AdSlot` (Carbon→AdSense, off until configured), affiliate redirect `/go/<slug>` with click logging, FTC disclosure |
| **Content Engine** | `scripts/` — topic discovery, automated post generation, Growth DB seeding |
| **Automation** | GitHub Actions: 1 post / ~3 days + monthly topic replenishment |
| **Growth DB** | 23 collections, TTL pruning for Atlas Free, seeded |

---

## 2. The ONLY things you must do

### a) `.env.local` (local dev + running scripts)

Already set: `MONGODB_GROWTH_URI`, `GROQ_API_KEYS`. **Recommended addition:**

```
GEMINI_API_KEYS=AIza...              # free: aistudio.google.com/apikey
```

Both Groq and Gemini have free tiers with real rate limits. The content
engine (`scripts/lib/llm.mjs`) maintains a pool of keys from **both**
`GROQ_API_KEYS` and `GEMINI_API_KEYS` (each comma-separated — you can list
multiple keys of the same provider too) and automatically rotates to the
next available key the instant one gets rate-limited (429), instead of
stalling. A single key in either list still works fine; adding a second
provider just makes the free-tier automation more resilient.

Optional (ads stay off until set): the `PUBLIC_ADSENSE_*` / `PUBLIC_CARBON_*` keys (see §7).

### b) Vercel project → Settings → Environment Variables

```
MONGODB_GROWTH_URI=<same connection string>   # required: powers /go affiliate redirects
```
Optional: the `PUBLIC_ADSENSE_*` / `PUBLIC_CARBON_*` keys to turn ads on (§7).

### c) GitHub repo → Settings → Secrets and variables → Actions

```
GROQ_API_KEYS=gsk_...
GEMINI_API_KEYS=AIza...            # optional but recommended — see above
MONGODB_GROWTH_URI=<same connection string>
GROQ_MODEL=openai/gpt-oss-120b     # optional, this is the default
GEMINI_MODEL=gemini-2.0-flash      # optional, this is the default
```

That's the entire to-do list. Social profiles are added from the dashboard at
`/super-admin/discovery/social` (writes to the Growth DB).

---

## 3. Commands

```bash
npm run dev                # local dev server
npm run build              # production build (static + serverless /go function)

npm run growth:seed        # provision + seed the Growth DB (idempotent, safe to re-run)
npm run growth:topics      # discover new topics into the queue (needs ANTHROPIC_API_KEY)
npm run content:plan       # dry run: show the next topic that would be written
npm run content:generate   # write the next blog post (needs ANTHROPIC_API_KEY)
```

---

## 4. How the automation runs (hands-off)

1. **`.github/workflows/auto-blog.yml`** runs on days 1, 4, 7, …, 28 (≈ every 3 days).
   It generates the highest-priority queued topic, writes the MDX, commits it, and
   pushes. Vercel auto-deploys. The OG image for the new post is generated during
   that build automatically.
2. **`.github/workflows/replenish-topics.yml`** runs monthly to top up the topic
   queue so the blog never runs dry.
3. You can trigger either manually from the GitHub **Actions** tab (`workflow_dispatch`).

To change cadence, edit the `cron` in `auto-blog.yml`.

---

## 5. Adding content by hand

- **Blog post:** drop an `.mdx` file in `src/content/blog/` (see existing posts for
  frontmatter). It appears in the index, gets an OG image, and enters the RSS feed
  on the next build.
- **Use case:** create `src/pages/use-cases/<slug>.astro` using `UseCaseLayout`,
  then add one row to `src/data/use-cases.ts`.
- **Comparison:** add an `.mdx` to `src/content/comparisons/` with a `featureMatrix`.
- **Affiliate link:** add a row to the `affiliate_links` collection (or the
  `FALLBACK` map in `src/pages/go/[slug].ts`), then link to `/go/<slug>`.

---

## 6. Free-tier guarantees

- **Vercel Free:** site is static; only `/go/<slug>` is a serverless function (tiny,
  fast). OG images are prebuilt files, not runtime compute.
- **Atlas Free (512 MB):** `crawler_visits` (90-day) and `affiliate_clicks` (180-day)
  have TTL indexes that auto-prune. Seeded data is a few KB.
- **No paid dependency** is required to run the site. The Groq key is only used
  by the content scripts/CI, never at request time.

---

## 7. Ads — how to turn them on (second income stream)

Ads are **off by default** and the whole site is clean without them. When you're
ready, they switch on purely via env vars — no code change. Two income streams
run side by side: **affiliate links** (already live via `/go/<slug>`) and
**display ads** (below).

### Where ads appear (and where they never do)

| Page type | Ads |
|-----------|-----|
| Blog posts | **In-content** (after 3rd paragraph) + **sidebar** (desktop) = max 2 |
| Resource pages | 1 unit after content |
| Comparisons | 1 unit after content |
| **Docs, use cases, homepage** | **Never** — these convert users; kept pristine |

The in-content unit is injected at a natural reading break (never mid-sentence,
never above the fold) and labelled "Advertisement". This is the highest-earning
placement while staying within the design rules.

### Option A — Google AdSense (recommended; in-content + sidebar)

1. Create an account at **https://adsense.google.com**, add the site
   `discover.moneyos.webasthetic.in`, and verify it (the loader is auto-injected
   once your client id is set).
2. After approval, create **two ad units** (type: *Display* / *In-article*) and
   copy each unit's `data-ad-slot` id.
3. Set these env vars (Vercel → Environment Variables, and `.env.local` for local):

```
PUBLIC_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX   # your publisher id
PUBLIC_ADSENSE_SLOT_BLOG=1234567890             # in-content unit (blog + resource + comparison)
PUBLIC_ADSENSE_SLOT_SIDEBAR=0987654321          # sidebar unit (blog)
```

Redeploy. Ads appear only on the page types in the table above.

### Option B — Carbon Ads (single tasteful unit, design-matched)

Carbon is invite-based and shows one elegant unit (good for dev/finance
audiences). It fills the **sidebar** slot:

```
PUBLIC_CARBON_SERVE=ABCDEFGH
PUBLIC_CARBON_PLACEMENT=discovermoneyos
```

If `PUBLIC_CARBON_SERVE` is set it takes precedence for the sidebar; AdSense still
powers the in-content unit. Leave Carbon blank to use AdSense everywhere.

### Finding the values

- `PUBLIC_ADSENSE_CLIENT` → AdSense → Account → Settings → "Publisher ID" (`ca-pub-…`).
- `PUBLIC_ADSENSE_SLOT_*` → AdSense → Ads → By ad unit → each unit's slot id.
- `PUBLIC_CARBON_*` → from your Carbon Ads dashboard once accepted.

That's it — fill the keys, redeploy, and the display-ad income stream is live
without touching a single page.
