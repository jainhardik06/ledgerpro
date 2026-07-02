# Money OS Social Asset System

This document is the supreme visual authority for all external-facing Money OS assets. It extends the `DISCOVERY_DESIGN_CONSTITUTION_V2.md` into social media, open graph images, and directory logos.

> **Taste Skill v2 & Emil Kowalski Principles**: Every asset must exhibit profound restraint. We reject generic Canva templates, 3D clay-morphism, and "unicorn vomit" gradients. All assets must feel premium, founder-grade, and technically precise. If an asset requires a drop shadow to be legible, the composition has failed.

---

## 1. Global Visual Primitives

### Color Palette
- **Canvas Base**: `#000000` (True Black). Used as the absolute background for 90% of assets.
- **Surface Elevation 1**: `#0a0a0a` (Vercel Dark). Used for "cards" or floating dashboard windows within the canvas.
- **Structural Borders**: `#262626` (Neutral 800). All borders are strictly `1px` solid.
- **Typography Primary**: `#ededed` (Off-white). Used for headlines and core text. Never pure white.
- **Typography Secondary**: `#a1a1aa` (Zinc 400). Used for subtext, metadata, and code snippets.
- **Accent Highlighting**: `rgba(255, 255, 255, 0.05)`. Used for subtle active-state backgrounds on dashboard UI snippets.

### Typography Rules
- **Font Family**: `Geist` (Sans) and `Geist Mono` (for metrics/code).
- **Headings**: `tracking-tighter` (-0.04em to -0.05em), `font-semibold`.
- **Data Points**: Strictly `tabular-nums font-mono`.
- **Alignment**: Left-aligned is default. Center-alignment is reserved ONLY for symmetric banner lockups.

### Layout System (The 8pt Grid)
- All margins, paddings, and absolute positioning coordinates must be divisible by `8`.
- Dense UI snippets (like the dashboard) can drop to a `4pt` sub-grid for internal padding.
- **Negative Space**: Treat whitespace as a structural element. 40% of the canvas must remain empty True Black.

---

## 2. Profile Images (Logos)

### General Specifications
- **Format**: PNG (transparent background) for general web; JPG (black background) for social platforms.
- **Safe Zone**: The logomark must fit entirely within a circle representing 60% of the total canvas width. If the platform applies a circle crop, the logo must breathe comfortably inside it.

### Required Exports
1. **LinkedIn / X / GitHub**: `400 x 400 px`
2. **YouTube**: `800 x 800 px`
3. **Favicon Pipeline**: `512 x 512 px`

### Design Execution
- **Background**: Strictly `#000000`.
- **Mark**: The sharp, monochrome Money OS geometric logomark in `#ffffff`.
- **Border**: None. Let the platform handle the avatar stroke.

---

## 3. Banner Architecture

Banners are the largest billboard we own. They must convey technical precision immediately. Do NOT clutter banners with long sentences or marketing slogans.

### LinkedIn Banner
- **Dimensions**: `1584 x 396 px` (Aspect Ratio: 4:1)
- **Safe Zone Layout**: 
  - The bottom-left `400 x 150 px` is a dead zone (covered by the profile picture).
  - The top and bottom `24px` are margin constraints.
- **Visual Composition**:
  - **Background**: `#000000` with an SVG grid overlay. The grid lines must be exactly `1px` thick, `#262626`, with a `32px` square size.
  - **Left Area** (Above Profile Pic): Micro-text (`text-[12px] uppercase tracking-widest text-[#a1a1aa]`): `MONEY OS // FINANCIAL COMMAND CENTER`.
  - **Right Area**: A high-resolution, perfectly sharp 1:1 render of the Money OS dashboard (specifically the tabular transaction ledger). The dashboard should appear to "float" with a `#262626` 1px border.
- **Rule**: No floating logos.

### X (Twitter) Banner
- **Dimensions**: `1500 x 500 px` (Aspect Ratio: 3:1)
- **Safe Zone Layout**: 
  - Bottom-left `400 x 200 px` is the profile picture dead zone.
  - Top `50px` and bottom `50px` are routinely cropped by Twitter's mobile app. Do not place text here.
- **Visual Composition**: 
  - Almost identical to the LinkedIn layout, but the right-side dashboard render must be scaled appropriately to fit the taller aspect ratio. 
  - Add a subtle radial gradient (`rgba(255,255,255, 0.03)`) directly behind the dashboard render to create a "glow" against the true black grid.

### GitHub Organization Banner
- **Dimensions**: `1280 x 640 px` (Used as the Open Graph image when sharing the `/MoneyOSHQ` link).
- **Safe Zone Layout**: Dead center alignment.
- **Visual Composition**:
  - Extremely developer-focused. 
  - **Left 50%**: A monospaced code snippet in `Geist Mono` demonstrating the `connectGrowthDb()` function or a webhook initialization. Syntax highlighting must use a monochrome + single accent color theme (e.g., Vercel's dark theme).
  - **Right 50%**: The corresponding UI output (e.g., the Directory Tracking metrics block).
  - **Separator**: A single vertical `1px` `#262626` line dividing the code from the UI.

### YouTube Channel Banner
- **Dimensions**: `2560 x 1440 px`
- **Safe Zone Layout**: The "TV" size is the full canvas. The "Desktop/Mobile" safe zone is strictly the dead center `1546 x 423 px`.
- **Visual Composition**: 
  - Only place critical brand elements in the safe zone. The remaining `1440px` height must just be the `#000000` background grid.
  - **Dead Center**: "Money OS" logotype in `Geist`, `tracking-tighter`, size `80px`.
  - **Below Logotype**: "The financial command center for SaaS founders." in `#a1a1aa`, size `24px`.
  - **Padding**: Exact `32px` spacing between logotype and subtitle.

---

## 4. Open Graph & Social Cards

This is what appears when someone drops a link in iMessage, Slack, or Discord. It must compel a click through sheer aesthetic dominance.

### Primary Open Graph (Homepage & Marketing Pages)
- **Dimensions**: `1200 x 630 px`
- **Visual Composition**:
  - **Background**: `#000000`.
  - **Center**: A massive, perfectly crisp render of the Money OS dashboard. The dashboard should overflow the bottom edge of the canvas.
  - **Top Left (Padding: `48px`)**: The logomark (`48x48px`).
  - **Bottom Left (Padding: `48px` from left, `48px` from bottom)**: "Money OS — Financial Command Center" in `Geist text-[40px] font-semibold tracking-tighter text-[#ededed]`.

### Blog & Documentation Open Graph (Programmatic Template)
- **Dimensions**: `1200 x 630 px`
- **Visual Composition**:
  - **Layout**: Split 60/40.
  - **Left 60%**: 
    - Padding: `64px` all around.
    - Top: Breadcrumb (e.g., `DOCS / DIRECTORY ENGINE`) in `text-[14px] font-mono text-[#a1a1aa] uppercase tracking-widest`.
    - Middle: Title of the article in `text-[64px] font-semibold tracking-tighter text-[#ededed] leading-[1.1]`.
    - Bottom: Author name and read time.
  - **Right 40%**: Abstract geometric representation of data, or a stylized code snippet related to the article, placed against a `#0a0a0a` background panel.

---

## 5. Directory & Community Logos

For sites like Y Combinator Startup School, Indie Hackers, G2, Capterra, or TrustPilot.

### Standard Square (Icon)
- **Dimensions**: `512 x 512 px`
- **Visual Composition**: Pure black background (`#000000`), white logo mark perfectly centered.

### Transparent Wordmark
- **Format**: SVG & PNG.
- **Visual Composition**: The text "Money OS" next to the logo mark. 
- **Typography**: `Geist font-semibold tracking-tighter`.
- **Variants**:
  - `wordmark-dark.svg`: Pure White (`#ffffff`) for dark mode interfaces.
  - `wordmark-light.svg`: Pure Black (`#000000`) for light mode interfaces.

---

## 6. Anti-Slop Check for Export (The Emil Kowalski Test)
Before exporting ANY asset to the `social_assets` DB, the designer must verify:
- [ ] **Shadows**: Are there drop shadows? **Remove them.** Use a `1px border-[#262626]` instead to define depth.
- [ ] **Radii**: Are the corners rounded? Ensure exactly `8px` or `12px` border-radius max. No pill shapes. No 50px iOS-style rounding.
- [ ] **Legibility**: Is the `tabular-nums` data legible when scaled down to 25%?
- [ ] **Contrast**: Check the contrast ratio of `#a1a1aa` against `#000000`. It must pass WCAG AA for large text.
- [ ] **Gradients**: Are there any gradients with more than 2 color stops? If yes, flatten them entirely.
- [ ] **Vibe Check**: Does it look like an internal dashboard built by Vercel or Linear engineers? If not, start over.
