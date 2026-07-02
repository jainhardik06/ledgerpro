# Image Prompting Guide

> **Purpose**: Standardize AI image generation prompts for the Money OS Visual Engine. Every prompt follows this guide to produce on-brand, premium visuals that never look "AI-generated" in the cheap sense.

---

## 1. Prompt Design Philosophy

The goal is NOT to generate realistic illustrations or photographic images. The goal is to generate abstract, dark, minimalist backgrounds that look expensive and technical.

Think: **Bloomberg terminal** meets **Vercel homepage** meets **Linear launch graphics**.

What we want:
- Dark (#000 or deep navy) backgrounds
- Subtle geometric patterns, grid lines, topology maps, circuit-like wireframes
- Faint light glow effects (not neon — subtle)
- Abstract financial/data visualization motifs
- Clean, negative space

What we never want:
- Faces, people, hands
- Generic "technology" imagery (random floating icons, circuit boards with glowing green lines)
- Colorful gradients (purple-to-blue, rainbow)
- Comic or illustrative styles
- Stock photo aesthetics

---

## 2. Base Prompt Template

Every image prompt is built from this base template:

```
[SUBJECT], [STYLE], [COMPOSITION], [MOOD], [TECHNICAL SPECS]
```

### Template variables:

| Variable | Definition | Example |
|---|---|---|
| SUBJECT | The abstract visual concept | "minimal geometric grid pattern" |
| STYLE | Visual style descriptors | "ultra-minimal, dark mode, monochrome" |
| COMPOSITION | How the image is framed | "centered composition, large negative space on the left" |
| MOOD | The feeling the image should convey | "precise, calm, technical, premium" |
| TECHNICAL SPECS | Quality and render descriptors | "sharp edges, 4K, no grain, no artifacts" |

---

## 3. Content-Type Specific Prompt Variations

### 3.1 Blog Posts (Educational)

**Concept**: Abstract data visualization — faint graphs, charts, flowing lines suggesting financial data in motion.

**Base prompt**:
```
abstract dark financial data visualization, subtle flowing graph lines on a black background, 
minimalist fintech aesthetic, barely visible grid lines, faint indigo glow on the right edge, 
ultra-minimal monochrome, centered composition, large empty space on the left for typography,
premium SaaS brand visual, 4K, no grain, sharp, no text, no people, no faces
```

**Negative prompt**:
```
colorful, rainbow, neon, gradient, people, faces, hands, emoji, stock photo, 
photorealistic humans, illustrated cartoon, busy background, cluttered, text, 
watermark, logo, numbers, charts with labels, bright colors, low quality
```

---

### 3.2 Documentation Pages

**Concept**: Terminal / code aesthetic. Dark, monospaced grid, suggesting developer precision.

**Base prompt**:
```
dark terminal grid background, subtle monospaced character pattern fading into black,
minimalist dark mode developer aesthetic, faint cyan grid lines barely visible,
large empty space in center for typography, ultra-clean, premium technical aesthetic,
no color, deep black, 4K, no grain, no text content, no code syntax, pure abstract pattern
```

**Negative prompt**:
```
colorful, bright, code snippets with text, readable text, logos, faces,
illustrative, cartoonish, gradient, neon, photorealistic
```

---

### 3.3 Comparison Pages

**Concept**: Clean split, division, two-sides aesthetic. Subtle boundary between two zones.

**Base prompt**:
```
minimal split composition, two dark zones with a subtle vertical dividing line at center,
left zone pure black, right zone deep charcoal #111, barely visible separation,
abstract dark monochrome, premium fintech aesthetic, no text, no icons, no logos,
clean horizontal negative space, 4K, no grain, sharp edges
```

**Negative prompt**:
```
colorful, gradient, people, faces, icons, logos, text, charts, neon, bright
```

---

### 3.4 Use Case Pages

**Concept**: Abstract silhouette of work — workspace, minimal tools, financial command.

**Base prompt**:
```
abstract minimal dark workspace visualization, subtle geometric shapes suggesting 
a clean desk setup, monochrome, deep black background, tiny faint detail elements,
premium SaaS aesthetic, calm and focused, single subject centered with large negative space,
4K, no people, no faces, no text, no recognizable objects
```

**Negative prompt**:
```
photorealistic desk photo, people, hands, bright colors, cluttered, stock photo
```

---

### 3.5 Resource Pages

**Concept**: Document, template, structured data — minimalist.

**Base prompt**:
```
abstract minimal dark document pattern, subtle grid paper texture on pure black,
faint horizontal lines suggesting rows, premium minimal aesthetic, monochrome,
left side empty for typography placement, right side subtle pattern,
4K, no text content, no numbers, no actual data
```

---

## 4. Quality Checklist for AI-Generated Images

Before accepting any AI-generated background image:

| Check | Pass Criteria |
|---|---|
| Background darkness | Average pixel brightness < 30 (near black) |
| No visible text | Zero readable text in the image |
| No faces/people | Zero human elements |
| Large empty zone | At least 40% of the image is dark empty space (for typography overlay) |
| Brand alignment | Feels like it belongs on vercel.com or linear.app |
| No artifacts | No visible AI generation artifacts, blurs, or color bleeding |
| Uniqueness | Perceptually different from the last 5 generated images |

Reject and regenerate if any check fails. Adjust the prompt and retry.

---

## 5. Typography Overlay Rules

After the background is generated, text is composited on top:

| Text Element | Position | Font | Size | Color |
|---|---|---|---|---|
| Category label | Top-left, 60px from edges | Geist Medium | 11px | `#525252` |
| Headline (max 2 lines) | Left-center, 60px from left | Geist SemiBold | 40px | `#ededed` |
| Description | Below headline | Geist Regular | 14px | `#a1a1aa` |
| URL watermark | Bottom-left | Geist Mono Regular | 11px | `#525252` |
| Logo mark | Top-right, 40px from edges | SVG | 24px | white |

---

## 6. Prompt Iteration Protocol

If the first generation is rejected:

1. **Increase specificity** — add more descriptors for what you want
2. **Strengthen negatives** — add the failing element explicitly to the negative prompt
3. **Adjust CFG scale** — increase for more prompt adherence, decrease for more creativity
4. **Change steps** — increase from 30 to 40–50 for more detail

**Maximum iterations**: 5 per image. If still failing after 5, use the Canva template fallback.

---

## 7. Canva Alternative Prompts

For manually created OG images in Canva (v1), use these background element descriptions:

| Background Type | Canva Elements |
|---|---|
| Grid pattern | `Elements > Graphics > Grid Dots > Opacity 15%` |
| Subtle texture | `Background > Subtle Patterns > Dark > Opacity 20%` |
| Gradient edge | `Elements > Gradient > Radial > Indigo at 5% opacity, far right edge only` |

Keep it minimal. The text is the hero, not the background.

---

*This guide is the authority for all image generation decisions in the Money OS Discovery Ecosystem.*
