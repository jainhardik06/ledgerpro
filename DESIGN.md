# Money OS Design System (DESIGN.md)

## 1. Typography System
- **Primary Typeface**: Geist / Geist Mono (already configured via Next.js `next/font/google`).
- **Scale**:
  - `text-[11px]` (Micro): Labels, overlines, subtle timestamps.
  - `text-[13px]` (Small): Body text, table rows, standard buttons (Linear/Vercel standard).
  - `text-[14px]` (Base): Settings headers, slightly larger body.
  - `text-[18px]` (Heading 3): Section titles.
  - `text-[24px]` (Heading 2): Page headers.
  - `text-[32px]` (Heading 1): Major metrics.
- **Hierarchy**:
  - Headings: `font-medium` or `font-semibold`. Avoid `font-black` (current slop pattern).
  - Body: `font-normal`.
  - Financial Data: Always use tabular numbers (`tabular-nums`) and Geist Mono for exact alignment.

## 2. Color System
- **Light Mode**:
  - Background: `#ffffff` (Base), `#fcfcfc` (Secondary areas).
  - Borders: `slate-200` (`#e2e8f0`) -> `border-neutral-200`.
  - Text: `neutral-900` (Primary), `neutral-500` (Secondary).
- **Dark Mode** (Defaulting to OLED/Vercel style):
  - Background: `#000000` (Base), `#0a0a0a` (Secondary).
  - Borders: `#1a1a1a` to `#262626` (`neutral-800` / `neutral-900`).
  - Text: `#ededed` (Primary), `#a1a1aa` (Secondary).
- **Semantic/Financial Colors**:
  - **Credit (Income)**: Subtle green. Light: `text-emerald-600 bg-emerald-500/10`, Dark: `text-emerald-400 bg-emerald-500/10`. No heavy backgrounds.
  - **Debit (Expense)**: Subtle red/rose. Light: `text-rose-600 bg-rose-500/10`, Dark: `text-rose-400 bg-rose-500/10`.
  - **Brand Accent**: Subtle blue (`indigo-500` or `blue-500`), used *only* for primary actions and active states. No more fuchsia/rose gradients.

## 3. Spacing System
- Strict 4px baseline grid.
- **Rhythm**:
  - Micro: `gap-1` (4px), `gap-2` (8px).
  - Component: `gap-4` (16px).
  - Section: `gap-8` (32px), `gap-12` (48px).
- **Containers**: Max-width constraints instead of full-bleed stretched layouts. Dashboard max width `1200px` for optimal readability.

## 4. Radius System
- **Sharp/Crisp**: `rounded-md` (6px) for inputs and small buttons.
- **Cards**: `rounded-xl` (12px) for structural containers.
- **Avoid**: Huge pill buttons (`rounded-full` on massive buttons) or `rounded-[2rem]` massive popups.

## 5. Shadow System
- **Depth via Borders**: Primary structural separation should use 1px borders, not shadows.
- **Subtle Elevation**: Modals and dropdowns use `shadow-xl` with very low opacity (`rgba(0,0,0,0.05)`).
- **Avoid**: Colored shadows (e.g. `shadow-indigo-500/20`).

## 6. Dashboard Layout Architecture
- **Navigation**: Switch from heavy Top Navbar to a crisp Sidebar (Left Navigation) or a very minimal sticky header with breadcrumbs.
- **Information Hierarchy**: 
  - Top: Context (Breadcrumbs, Title, Date range).
  - Middle: Key metrics (3-4 crisp cards).
  - Bottom: Data tables (Transactions, recent activity).
- **Grid**: 12-column internal grid for precise alignment.

## 7. AI-Slop Eradication Plan
- **Banned**: 
  - `<div className="bg-gradient-to-tr from-indigo-500 to-fuchsia-500..." />` (Unicorn vomit).
  - `hover:-translate-y-1` on structural cards (UI shouldn't jump around).
  - `font-black` on standard headers.
  - Opaque, high-saturation colored boxes.
  - Nested, excessive `backdrop-blur-md` on standard elements.
