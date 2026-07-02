# Money OS Design DNA

Extracted from the live Money OS product (`src/app/(marketing)/page.tsx`,
`globals.css`, `layout.tsx`) so the Discovery platform reads as the same company.
This is the authority the discovery site is aligned to.

## The recognizable signature

What makes a Money OS page identifiable without the logo:

- **Near-black canvas.** Surfaces are `#000000` and `#0a0a0a`, not blue-black or
  gradients. Calm, high-contrast, editorial.
- **Geist typeface.** Geist Sans for UI/prose, Geist Mono for code/figures. This
  is the single strongest brand cue — and was the one thing the discovery site
  had wrong (it shipped Inter). Now aligned.
- **Neutral greyscale with a single emerald accent.** Text steps through
  `neutral-100 → 400 → 600`; the only color is `emerald-500` used sparingly for
  "live/positive/free" signals. No secondary brand colors, no decorative gradients.
- **White primary button on black.** The main CTA is `bg-white text-black`; the
  secondary is a thin `border-neutral-800` ghost button. Consistent everywhere.
- **Large radius, soft borders.** `rounded-2xl` for hero/cards, `rounded-xl`/`lg`
  for smaller elements. Hairline `border-neutral-800/900` separators instead of
  shadows.
- **Generous, deliberate whitespace.** Wide vertical rhythm, content capped at a
  readable measure, sections divided by thin top borders rather than boxes.
- **Restrained motion.** `fadeIn` ~150ms on a `cubic-bezier(0.16, 1, 0.3, 1)`
  easing; hover states are color transitions, not transforms.

## Tokens (as applied to Discovery)

| Token | Value |
|-------|-------|
| Background | `#000000` (page), `#0a0a0a`/`neutral-950` (cards) |
| Borders | `neutral-800` (interactive), `neutral-900` (dividers) |
| Text | `neutral-100` (headings), `neutral-300/400` (body), `neutral-600` (meta) |
| Accent | `emerald-400/500` (sparingly) |
| Font (sans) | **Geist** |
| Font (mono) | **Geist Mono** |
| Primary CTA | `bg-white text-black`, `rounded-lg`/`md` |
| Card radius | `rounded-2xl` / `rounded-xl` |
| Easing | `cubic-bezier(0.16, 1, 0.3, 1)`, ~150ms |

## Preserve / Evolve / Never-change

- **Preserve:** the black canvas, neutral+emerald palette, white CTA, hairline
  borders, generous whitespace.
- **Evolve (discovery-specific):** long-form reading typography (larger prose,
  1.8 line-height), table-of-contents, editorial blog index — all built on the
  same tokens.
- **Never change:** introduce a second accent color, add gradients/shadows for
  decoration, switch off Geist, or use a light theme. Any of these breaks the
  "same company" recognition.

## What was aligned in the discovery build

1. **Font:** Inter → **Geist** across the site (`Layout.astro`) and the OG image
   engine (`src/lib/og.ts`) — so pages *and* social cards match the product.
2. **Radius rhythm:** cards use `rounded-2xl`/`rounded-xl` consistent with the
   marketing site.
3. **Palette/CTA:** already matched (black canvas, neutral text, emerald accent,
   white primary button) — confirmed against the live marketing page.

Applying Taste Skill v2 (hierarchy, anti-slop, dark-mode protocol), Impeccable
(whitespace, editorial rhythm) and Emil Kowalski (clarity before decoration) on
top of these tokens is what keeps every discovery page feeling product-grade.
