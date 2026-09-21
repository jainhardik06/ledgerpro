# Visual Generation Engine — Architecture

> **Scope**: Technical implementation of the visual asset pipeline. Covers file structure, Astro integration, Canva template system, Python automation scripts, and future AI pipeline architecture.

---

## 1. File Structure

```
money-os-discovery/
└── public/
    ├── og/                    ← Open Graph images (1200×630)
    │   ├── blog/
    │   │   └── {slug}.png
    │   ├── docs/
    │   │   └── {slug}.png
    │   ├── comparisons/
    │   │   └── {slug}.png
    │   └── use-cases/
    │       └── {slug}.png
    ├── images/                ← Featured images (hero images)
    │   ├── blog/
    │   └── comparisons/
    ├── social/                ← Square social cards (1080×1080)
    │   └── blog/
    └── brand/                 ← Reusable brand elements
        ├── logo-white.svg
        ├── logo-black.svg
        ├── wordmark-white.svg
        └── favicon.ico
```

---

## 2. Astro Integration

### 2.1 Build-Time OG Image Factory (as implemented)

Every page's OG image is **pre-rendered at build time** by an Astro endpoint:

- `src/pages/og/[...slug].png.ts` enumerates every published content entry
  (docs, blog, comparisons, resources) plus the site default, and prerenders
  a unique 1200×630 PNG to `/og/<section>/<slug>.png`.
- `src/lib/og.ts` (`renderOgImage`) composes each image (satori-based,
  TypeScript — not the Python pipeline sketched in §4, which was superseded
  by this approach).
- Because the outputs are static files, social/AI previews cost nothing to
  serve and scale to any traffic level.

Pages reference their image via `ogImage` props into `Layout.astro` —
there is no runtime generation and no `getOgImageUrl` helper.

### 2.2 OG Image Fallback

The build also emits a site-default image used when a page has no
content-specific OG image, so previews are never broken during drafts.

### 2.3 Image Dimensions in Markdown

When images are used within MDX content (not OG), always specify dimensions to prevent CLS:

```mdx
<img 
  src="/images/blog/expense-categories-chart.png" 
  alt="Freelance expense categories breakdown" 
  width="1200" 
  height="630" 
/>
```

---

## 3. Canva Template System (v1)

### 3.1 Template Setup

Create ONE master template in Canva for each visual type:

**Template files**:
- `MoneyOS_OG_Blog_Template.canva` — Blog OG images
- `MoneyOS_OG_Docs_Template.canva` — Doc OG images
- `MoneyOS_OG_Comparison_Template.canva` — Comparison OG images
- `MoneyOS_OG_UseCase_Template.canva` — Use case OG images
- `MoneyOS_Social_Square_Template.canva` — Social cards

### 3.2 Template Variables (editable per article)

| Field | Location in Template | Example |
|---|---|---|
| Category label | Top section, 11px uppercase | `FREELANCER GUIDE` |
| Headline (line 1) | Center, 36px semibold | `Expense Tracking for` |
| Headline (line 2) | Center, 36px semibold | `Freelancers` |
| Description (optional) | Below headline, 14px | `The complete system` |

**Lock everything else**: Logo, border, URL, background, brand colors are all locked in the template. Only text variables change per article.

### 3.3 Export Settings

```
Format: PNG
Quality: Maximum
Color profile: sRGB
Resolution: 72 DPI (sufficient for screen, minimizes file size)
Compression: Enable Canva's optimization
Target: < 200 KB per file
```

---

## 4. Python Automation Script (v2 — SUPERSEDED, kept for reference)

> **Status:** this Python pipeline was never built. The build-time OG factory
> in §2.1 (TypeScript/satori, prerendered by `src/pages/og/[...slug].png.ts`)
> delivered the same outcome with zero runtime cost, and is the implemented
> approach. The sketch below is retained only as historical design context.

When manual volume exceeds 10 articles/month, replace Canva with a Python script.

### 4.1 Dependencies

```python
# requirements.txt
Pillow==10.3.0       # Image composition
requests==2.31.0     # API calls
python-dotenv==1.0.0 # Environment variables
```

### 4.2 Core Script

```python
# scripts/generate_og.py
from PIL import Image, ImageDraw, ImageFont
import os

BRAND = {
    "bg": "#000000",
    "text_primary": "#ededed",
    "text_secondary": "#a1a1aa",
    "text_muted": "#525252",
    "border": "#262626",
    "width": 1200,
    "height": 630,
}

def generate_og(slug: str, title: str, category: str, description: str = "") -> str:
    img = Image.new("RGB", (BRAND["width"], BRAND["height"]), color=BRAND["bg"])
    draw = ImageDraw.Draw(img)

    # Fonts (use local Geist fonts)
    font_headline = ImageFont.truetype("assets/fonts/Geist-SemiBold.ttf", 40)
    font_category = ImageFont.truetype("assets/fonts/Geist-Medium.ttf", 12)
    font_url = ImageFont.truetype("assets/fonts/GeistMono-Regular.ttf", 12)

    # Border
    draw.rectangle([(1, 1), (BRAND["width"]-2, BRAND["height"]-2)], outline=BRAND["border"])

    # Category label
    draw.text((60, 60), category.upper(), fill=BRAND["text_muted"], font=font_category)

    # Headline (wrapped at 60 chars)
    import textwrap
    lines = textwrap.wrap(title, width=40)
    y = 120
    for line in lines[:2]:  # Max 2 lines
        draw.text((60, y), line, fill=BRAND["text_primary"], font=font_headline)
        y += 56

    # URL watermark
    draw.text((60, BRAND["height"] - 40), "discovermoneyos.webasthetic.in", fill=BRAND["text_muted"], font=font_url)

    # Save
    output_path = f"public/og/blog/{slug}.png"
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img.save(output_path, "PNG", optimize=True)
    return output_path


if __name__ == "__main__":
    import sys
    slug = sys.argv[1]
    title = sys.argv[2]
    category = sys.argv[3]
    path = generate_og(slug, title, category)
    print(f"Generated: {path}")
```

### 4.3 Usage

```bash
# Generate OG for a new article
python scripts/generate_og.py \
  "expense-tracker-for-freelancers" \
  "Expense Tracking for Freelancers: The Complete System" \
  "Freelancer Guide"
```

### 4.4 GitHub Actions Integration (future)

```yaml
# .github/workflows/generate-og.yml
name: Generate OG Images
on:
  pull_request:
    paths:
      - 'src/content/blog/*.mdx'

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r scripts/requirements.txt
      - name: Extract frontmatter and generate OG
        run: python scripts/generate_og_from_mdx.py
      - name: Commit generated images
        run: |
          git config user.name "github-actions"
          git add public/og/
          git commit -m "ci: generate OG images" || exit 0
          git push
```

---

## 5. AI Image Generation Architecture (v3)

### 5.1 Pipeline

```
Content Brief (approved)
    ↓
extract: title, category, description
    ↓
build_prompt() → structured image prompt
    ↓
Stability AI API call (background layer)
    ↓
Download generated background
    ↓
Composite: add typography layer via Pillow
    ↓
Quality hash check (no similar images)
    ↓
Save to public/og/{content-type}/{slug}.png
    ↓
Commit to PR
```

### 5.2 Stability AI Integration

```python
import requests

def generate_background(prompt: str, negative_prompt: str) -> bytes:
    response = requests.post(
        "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image",
        headers={"Authorization": f"Bearer {STABILITY_KEY}", "Accept": "application/json"},
        json={
            "text_prompts": [
                {"text": prompt, "weight": 1},
                {"text": negative_prompt, "weight": -1}
            ],
            "cfg_scale": 7,
            "height": 640,
            "width": 1216,
            "steps": 30,
            "samples": 1,
        }
    )
    return base64.b64decode(response.json()["artifacts"][0]["base64"])
```

---

## 6. Build-Time Validation

At Astro build time, a custom integration checks for missing OG images:

```javascript
// astro.config.mjs
import { defineConfig } from 'astro/config';

const validateOgImages = {
  name: 'validate-og-images',
  hooks: {
    'astro:build:done': async ({ pages }) => {
      for (const { pathname } of pages) {
        const slug = pathname.replace('/blog/', '').replace('/', '');
        const ogPath = `public/og/blog/${slug}.png`;
        if (slug && !fs.existsSync(ogPath)) {
          console.warn(`⚠ Missing OG image: ${ogPath}`);
        }
      }
    }
  }
};
```

This produces warnings (not build failures) in v1. In v2, it becomes a build failure.

---

*The Visual Engine ensures every content piece has professional visual identity without requiring design skills at scale.*
