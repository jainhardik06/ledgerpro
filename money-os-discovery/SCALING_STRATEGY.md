# Money OS Discovery — Scaling Strategy

> **Constraint Context**: Vercel Free, MongoDB Atlas Free, GitHub Student Pack, Single Founder.
> **Target**: 0 → 100,000+ monthly visitors without architecture rewrites.

---

## 1. Philosophy

Every architectural decision is evaluated against two questions:

1. Does this work on Vercel Free today?
2. Does this scale to 100,000 monthly visitors without changing the design?

If both answers are yes, we build it. If no, we find a different approach.

---

## 2. Static Site Generation — The Core Scaling Unlock

The discovery engine is 100% statically generated. This is not optional.

**Why Static:**
- Vercel Free serves static assets from CDN edge nodes at zero compute cost
- A page cached at the edge serves 100,000 visitors identically to 1 visitor
- No function cold starts, no database reads per page request, no SSR latency
- Lighthouse scores near 100, which directly improves organic ranking

**Implication:** No server-side rendering in the discovery repo. Every page that needs data (blog, docs, changelog) pulls it at build time from MDX files or static JSON. The only dynamic layer lives in the main SaaS app.

**Build Frequency:** On each push to `main`, Vercel rebuilds the static site. At 5,000+ pages, builds will exceed Vercel Free's 6-hour build limit. Mitigation: use Astro's incremental static regeneration or trigger per-section builds via Vercel's deploy hooks.

---

## 3. Content Scaling Limits & Mitigations

### Current Capacity (Vercel Free)
| Limit | Value | Our Mitigation |
|---|---|---|
| Build time | 45 min/build | Incremental builds after 1,000 pages |
| Bandwidth | 100 GB/month | Edge caching keeps this effectively unlimited |
| Deployments | 100/day | CI only triggers on content PRs, not per-commit |
| Serverless invocations | 100k/month | None needed — pure static |

### Content Volume Strategy
- **0–100 articles**: Direct MDX in `src/content/blog/`. No pipeline needed.
- **100–1,000 articles**: Automated CI jobs write MDX files, open PRs, build on merge.
- **1,000–5,000 articles**: Astro's `getStaticPaths` generates pages from a Growth DB seed file exported at build time.
- **5,000+ articles**: Evaluate Astro's on-demand rendering (ISR) or migrate to Vercel Pro if revenue justifies.

---

## 4. MongoDB Atlas Free — Growth Database Strategy

Atlas Free provides 512 MB storage shared across all collections.

### Storage Budget

| Collection | Est. Records | Avg Doc Size | Total |
|---|---|---|---|
| `directories` | 1,000 | 0.5 KB | 500 KB |
| `backlinks` | 5,000 | 0.3 KB | 1.5 MB |
| `crawler_visits` | 100,000 (TTL 90d) | 0.2 KB | 20 MB |
| `blog_posts` (registry) | 5,000 | 1 KB | 5 MB |
| `keyword_targets` | 10,000 | 0.3 KB | 3 MB |
| `content_topics` | 50,000 | 0.2 KB | 10 MB |
| All other collections | — | — | ~15 MB |
| **Total Estimated** | | | **~55 MB** |

Well within the 512 MB Atlas Free ceiling at full scale.

### TTL Indexes for Automatic Pruning

`crawler_visits` uses a MongoDB TTL index: `{ "timestamp": 1 }, { expireAfterSeconds: 7776000 }` (90 days). This is the only high-volume append-only collection and is automatically pruned.

### Read/Write Patterns

The Discovery Intelligence Center (admin dashboard) is the only service writing to the Growth DB. The discovery static site **never** reads from or writes to MongoDB. All reads in the dashboard are single-document lookups or small aggregations with indexes on every queried field.

---

## 5. Content Delivery & CDN Strategy

Vercel's edge CDN caches every static asset globally. Cache headers:

```
Cache-Control: public, max-age=31536000, immutable   # Fonts, images
Cache-Control: public, s-maxage=86400, stale-while-revalidate=3600  # HTML pages
```

OG images and featured images are pre-generated at build time and served as static files. No on-demand image generation services (Cloudinary, etc.) are needed until 100k+ images.

---

## 6. Search — Zero Server Cost

Docs and blog search uses [Pagefind](https://pagefind.app/), which is a static search index built at Astro build time. The search index is a set of static WASM + JSON files served from the CDN. Zero serverless function cost, zero external API dependency.

At 5,000+ pages, the Pagefind index will be ~5–10 MB. Still client-side, still free.

---

## 7. Image Strategy

| Phase | Approach | Cost |
|---|---|---|
| Now (0–100 images) | Manually designed PNGs in `public/` | $0 |
| Phase 2 (100–1,000) | Python script using Pillow + brand templates | $0 |
| Phase 3 (1,000+) | OpenAI DALL-E or Stability AI via GitHub Actions | ~$0.02/image |

OG images follow the pattern: `public/og/{slug}.png`. Generated once, served forever.

---

## 8. GitHub Student Pack — Leveraged Dependencies

| Service | Pack Benefit | How Used |
|---|---|---|
| GitHub Actions | Unlimited minutes for public repos | CI/CD for content publishing pipeline |
| Namecheap | Free `.me` domain | Redirect domain for campaigns |
| MongoDB Atlas | $200 credit | Extended Atlas capacity when Free tier exhausts |
| Canva Pro | Free 1 year | Manual OG image creation |
| Bootstrap Studio | Free license | Unused — we use Astro |

---

## 9. Future Migration Path

When revenue justifies cost:

| Trigger | Upgrade | Cost |
|---|---|---|
| >100 GB/month bandwidth | Vercel Pro | $20/month |
| >512 MB MongoDB | Atlas M10 | $57/month |
| >5,000 blog pages | ISR or on-demand builds | Included in Vercel Pro |
| AI image generation | OpenAI batch API | Pay-per-image |

These upgrades are additive — no architecture changes required. The system scales by paying, not by rewriting.

---

## 10. Automation Roadmap

### Phase 1 (Now)
Manual content creation. MDX files pushed by hand.

### Phase 2 (Month 3)
GitHub Actions workflow:
1. Nightly cron fetches trending topics from Google Trends API (free)
2. Generates brief via Claude API
3. Opens PR with new MDX file
4. Founder reviews and merges
5. Vercel triggers build

### Phase 3 (Month 6)
Full pipeline with human-in-the-loop approval:
1. AI drafts complete article
2. AI generates OG image
3. AI suggests internal links
4. Founder approves in Discovery Intelligence Center
5. CI commits and deploys

### Phase 4 (Month 12)
Autonomous publishing for low-stakes content types (changelog, glossary terms) with monthly audits.

---

*This document is the definitive scaling authority for the Money OS Discovery ecosystem. No scaling decision should be made without first consulting this document.*
