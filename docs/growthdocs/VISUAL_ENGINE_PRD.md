# Visual Generation Engine — PRD

> **Purpose**: Every piece of content on the Money OS Discovery Ecosystem has exactly one visual identity. No content ships without an OG image, a featured image, and a social card. This document defines the requirements, standards, and future automation path for all visual assets.

---

## 1. Problem Statement

Every content piece needs:

1. **Open Graph Image** (1200×630) — shown when the link is shared on X, LinkedIn, Slack, WhatsApp, iMessage
2. **Featured Image** (1200×630 or 16:9 hero) — shown at the top of the article
3. **Social Card** (1:1 square, 1080×1080) — for Instagram/thread reposts
4. **Comparison Image** (custom) — for comparison pages, showing a clear winner table

Without these, links look naked. Engagement drops 50%+. Click-through rates from social are near zero for link-only posts.

---

## 2. Non-Negotiables

Every visual asset must:

- Follow the **Money OS Brand System** (`BRAND.md`)
- Follow the **Discovery Design Constitution v2** color and typography rules
- Be generated **before** the article is published (not after)
- Be stored in `public/og/{slug}.png` (OG image) and `public/images/{slug}.png` (featured)
- Load in under 50ms (static files, pre-generated, served from Vercel CDN edge)

Every visual asset must NOT:

- Use stock photo faces (uncanny valley effect, looks corporate)
- Use generic gradients (purple-to-blue, teal-to-green)
- Include text smaller than 32px (unreadable in social feed thumbnails)
- Contain more than 2 lines of text in the image itself
- Look like it was AI-generated carelessly (low quality prompt artifacts, wrong fonts)

---

## 3. Asset Specifications

### 3.1 Open Graph Image (OG)

```
Dimensions: 1200 × 630 px
Format: PNG (lossless)
File size: < 200 KB
Location: public/og/{slug}.png
```

**Template composition**:
```
Background: #000000 (solid black, per Constitution)

Top-left: Money OS logo mark (white, 32px)
Bottom-left: "discovermoneyos.webasthetic.in" (12px, #525252, monospaced)

Center-left: Category label (11px, uppercase, #525252)
Center: Article headline (32–40px, font-semibold, #ededed, max 2 lines, max-w 60%)
Center-below-headline: Subtitle or description (14px, #a1a1aa, max 1 line)

Right side: Category-specific visual element
  — Blog: Subtle grid pattern overlay
  — Docs: Terminal/code aesthetic
  — Comparison: Split-screen with checkmarks
  — Resource: Document icon
  — Use Case: Audience icon

Border: 1px solid #262626 (subtle inner border)
```

### 3.2 Featured Image (Blog Hero)

```
Dimensions: 1200 × 630 px (same as OG image in v1)
Format: PNG
File size: < 200 KB
Location: public/images/blog/{slug}.png
```

In v1, the OG image IS the featured image. Separate designs are a future enhancement.

### 3.3 Social Card (Square)

```
Dimensions: 1080 × 1080 px
Format: PNG
File size: < 300 KB
Location: public/social/{slug}.png
```

**Composition**: Same brand elements as OG, but reformatted for 1:1. Larger headline font (48px+). Less metadata.

### 3.4 Comparison Image

```
Dimensions: 1200 × 800 px
Format: PNG
File size: < 300 KB
Location: public/comparisons/{slug}.png
```

**Composition**:
- Split-screen: Money OS (left, black background) vs Competitor (right, #0a0a0a)
- 3–5 key features listed with ✅ (Money OS) vs ❌ or — (Competitor)
- Winner label at top: "Money OS wins for {audience}"

---

## 4. v1 Production Flow (Manual)

**Tool**: Canva Pro (GitHub Student Pack — 1 year free)

**Process**:
1. Open the Money OS Discovery OG Template in Canva
2. Duplicate the template page
3. Update: headline, category label, category icon
4. Export as PNG at 1200×630
5. Save to `money-os-discovery/public/og/{slug}.png`
6. Commit alongside the MDX file

**Time per asset**: 5–8 minutes (from template, not from scratch)

**Time per article (2 assets — OG + Social Card)**: 12–15 minutes

---

## 5. v2 Future: AI-Generated Images

**Target**: Month 6+, when publishing volume exceeds 10 articles/month

**Stack**:
- **Generator**: Stability AI (SDXL) or OpenAI DALL-E 3 Batch API
- **Prompt template**: Defined in `IMAGE_PROMPTING_GUIDE.md`
- **Post-processing**: Python script adds typography layer (Pillow library)
- **CI/CD**: GitHub Actions workflow triggers image generation on brief approval
- **Storage**: Committed to `public/og/` in the Astro repo

**Cost estimate**:
- Stability AI: $0.006/image at SDXL quality
- DALL-E 3: $0.04/image (1024×1024), $0.08/image (1792×1024)
- **Recommended**: Stability AI for cost, DALL-E 3 for quality

**Quality gate**: AI-generated images still pass human review before publishing. An image that looks cheap or AI-artsy gets rejected and regenerated with a refined prompt.

---

## 6. v3 Future: Fully Automated Visual Pipeline

**Target**: Month 12+

```
Brief Approved
    ↓
Image Prompt Generated (from brief fields)
    ↓
Stability AI API Called (background layer)
    ↓
Typography Layer Applied (Pillow)
    ↓
Brand Elements Composited (logo, URL, border)
    ↓
Quality Check (perceptual hash comparison against past images for similarity)
    ↓
Auto-committed to public/og/
    ↓
Human reviews in PR (30-second eyeball check)
    ↓
Merge → Deploy
```

---

## 7. Success Metrics

| Metric | Target | How Measured |
|---|---|---|
| OG coverage | 100% of published articles | Build script validation |
| Social card coverage | 100% of published articles | Build script validation |
| Asset load time | < 50ms | Vercel Analytics |
| Social share CTR | > 1.5% | PostHog / UTM tracking |
| Article shares with OG vs without | +50% engagement | A/B via social posting |

---

*Visual assets are not optional. No article ships without them.*
