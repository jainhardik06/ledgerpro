# Money OS Discovery Design Constitution v2

> **Supreme Design Authority**: This document is the permanent and absolute design authority for `money-os-discovery`, Documentation, Blog, Changelog, Use Cases, Comparison Pages, Landing Pages, Product Hunt Assets, and all future AI-generated content pages. Every future page, component, layout, section, article, card, CTA, navigation system, footer, and landing page MUST strictly inherit from this document.

---

## 1. FOUNDATIONAL DESIGN PHILOSOPHY

Money OS Discovery must feel like **Linear, Stripe, Vercel, Raycast, Resend, Warp, and Arc** combined into a single, cohesive design language. 

The goal is to create an atmosphere that is:
- **Premium**: Every pixel must feel intentional and expensive.
- **Trustworthy**: Financial software requires absolute reliability; the design must convey security without saying it.
- **Calm**: Whitespace is a feature. Visual noise is actively hostile to the user.
- **Professional**: Founder-grade presentation. We do not treat our users like children.
- **Fast**: Zero perceived latency. Interactions snap.
- **Modern & Technical**: Built for builders, operators, and founders.

We must **NEVER** build interfaces that feel:
- Generic, Template-like, or Corporate.
- Like a cheap Bootstrap theme.
- "AI-generated" (e.g., no unicorn-vomit gradients, no generic robotic copywriting).
- Over-decorated or Over-animated.

---

## 2. MANDATORY DESIGN INFLUENCES

This project MUST explicitly incorporate and operationalize the following three principles. All future design decisions must pass these quality standards.

### 2.1 Taste Skill v2
- **Brief Inference**: Anticipate the user's real goal. Design for the unspoken intent.
- **Design System Mapping**: Never invent a new token when an existing one suffices. Reusability over novelty.
- **Typography Hierarchy**: Use size, weight, and color strictly. If everything is bold, nothing is bold.
- **Layout Discipline**: Adhere to the grid. No arbitrary padding or margins.
- **Dark Mode Protocol**: True black backgrounds (`#000000`), deep grays for elevation. Do not invert colors lazily.
- **Pre-flight Validation**: Check contrast, rhythm, and alignment before shipping.
- **Anti-Slop Guidelines**: Actively avoid "AI Slop" (meaningless blobs, excessive backdrop-blurs without purpose, `font-black` on generic headers). Avoid cookie-cutter SaaS sections and repetitive three-column feature cards unless executed immaculately.

### 2.2 Impeccable
- **Exceptional Spacing**: Give elements room to breathe. Density does not mean clutter.
- **Refined Rhythm**: Consistent mathematical relationships between elements (4pt/8pt grid).
- **Premium Composition**: Treat layouts like editorial magazines. High-end SaaS presentation.
- **Editorial Hierarchy**: Information must flow logically from macro to micro.
- **Visual Restraint**: Use borders, not drop-shadows, for depth. Use neutral tones, not primary colors, for structure.
- **Sophisticated Motion**: If it moves, it must mimic physics. No linear easing. No bouncing.

### 2.3 Emil Kowalski Design Principles
- **Clarity before Decoration**: If an element doesn't serve a clear purpose, delete it.
- **Strong Visual Hierarchy**: The user should know exactly where to look within 50 milliseconds.
- **Clear Communication**: Noun-first, actionable copy. Zero fluff.
- **Excellent Typography**: Type is 90% of the interface. Treat it with reverence.
- **Focused Interfaces**: Eliminate distractions. Every page must answer *"What is most important here?"* within 3 seconds.
- **Product-First Thinking**: The design exists to serve the content and the product, not to show off CSS skills.

---

## 3. DESIGN IDENTITY

### Brand Personality
Money OS is the "Financial Command Center." It is clinical, precise, quiet, and fast. It does not try to be your friend; it tries to be your most reliable tool.

### Brand Voice
Direct, noun-first, and actionable. Zero fluff. 
- *Bad*: "Supercharge your financial workflows with our magical AI!"
- *Good*: "Automate expense categorization."
We do not use exclamation points. We do not use emojis in professional copy.

### Visual Personality
Monochrome dominance. We use color solely to convey status, never to decorate. Sharp borders, subtle contrasts, tabular data.

### Interaction Philosophy
Instantaneous feedback. Hover states must activate in under 50ms. Focus states must be highly visible but elegant. The interface should feel like a native C++ application, not a bloated web app.

### Motion Philosophy
"Nothing bounces or springs past its mark." Transitions help maintain context. They must be fast (`100ms`-`200ms`) and use custom easing (`cubic-bezier`).

### Reading Experience Philosophy
Documentation and blogs must read like technical whitepapers. Optimal line lengths (65-75 characters). High-contrast body text. Generous line heights.

### Trust Philosophy
Trust is built through precision. Aligned tabular numbers, bug-free components, and fast load times build more trust than a "Bank Grade Security" badge.

### Information Density Philosophy
High data density where required (tables, metrics), low visual density everywhere else. Use whitespace to separate dense blocks of information.

---

## 4. COLOR SYSTEM

Color is functional, not decorative.

### Light Mode
- **Background Base**: `#ffffff`
- **Background Secondary**: `#fcfcfc` or `#f9fafb` (neutral-50)
- **Borders**: `#e2e8f0` (slate-200) or `#e5e5e5` (neutral-200)
- **Text Primary**: `#171717` (neutral-900)
- **Text Secondary**: `#737373` (neutral-500)
- **Text Tertiary**: `#a3a3a3` (neutral-400)

### Dark Mode (OLED/Vercel standard)
- **Background Base**: `#000000`
- **Background Secondary**: `#0a0a0a` (neutral-950)
- **Borders**: `#262626` (neutral-800)
- **Text Primary**: `#ededed` (neutral-200)
- **Text Secondary**: `#a1a1aa` (zinc-400)
- **Text Tertiary**: `#525252` (neutral-600)

### Semantic Colors
Must be used sparingly and *only* in these contexts:
- **Success/Credit**: 
  - Light: `text-emerald-700 bg-emerald-500/10 border-emerald-500/20`
  - Dark: `text-emerald-400 bg-emerald-500/10 border-emerald-500/20`
- **Danger/Debit**: 
  - Light: `text-rose-600 bg-rose-500/10 border-rose-500/20`
  - Dark: `text-rose-400 bg-rose-500/10 border-rose-500/20`
- **Warning**: 
  - Light: `text-amber-700 bg-amber-500/10`
  - Dark: `text-amber-400 bg-amber-500/10`
- **Info**: 
  - Light: `text-blue-600 bg-blue-500/10`
  - Dark: `text-blue-400 bg-blue-500/10`

### Brand Accent
- **Primary Accent**: Monochrome. Black in light mode, White in dark mode.
- **Secondary Accent**: Subtle Blue (`indigo-500` or `blue-500`) used *exclusively* for primary CTAs or active active navigational states. NEVER as a background gradient.

### UI Layers & States
- **Hover States**: Subtle background shift (e.g., `hover:bg-neutral-100` in light mode, `hover:bg-neutral-900` in dark mode). Never change border colors on hover unless it's an input.
- **Focus States**: `ring-1 ring-neutral-900 dark:ring-neutral-200 ring-offset-1 dark:ring-offset-black`.
- **Disabled States**: `opacity-50 cursor-not-allowed grayscale`.

### Data Visualization / Charts
- Do not use random colors. Use the primary monochrome accent for main lines. Use subtle semantic colors for comparisons (e.g., Income vs Expenses).
- Grid lines must be barely visible (`stroke-neutral-200 dark:stroke-neutral-800`).

---

## 5. TYPOGRAPHY SYSTEM

Typography is the absolute core of Money OS Discovery.

### Font Stack
- **Sans-serif (Primary)**: `Geist`, `Inter`, `-apple-system`, `BlinkMacSystemFont`.
- **Monospace (Data/Code)**: `Geist Mono`, `SF Mono`, `JetBrains Mono`.

### Scale & Hierarchy
- **Display/Hero**: `text-[48px]` to `text-[72px]`. `tracking-tighter`. `font-semibold`.
- **Heading 1 (H1)**: `text-[32px]`. `tracking-tight`. `font-semibold`.
- **Heading 2 (H2)**: `text-[24px]`. `tracking-tight`. `font-medium`.
- **Heading 3 (H3)**: `text-[18px]`. `font-medium`.
- **Base (Body)**: `text-[14px]`. `font-normal`. `leading-relaxed`.
- **Small (UI/Components)**: `text-[13px]`. `font-normal`. (Standard for buttons, table rows, and dense UI).
- **Micro (Labels)**: `text-[11px]`. `uppercase tracking-wider font-medium text-neutral-500`.

### Specific Typography Rules
- **Financial Data / Tables**: MUST use `tabular-nums` and `font-mono` (Geist Mono).
- **Code Typography**: `text-[13px] font-mono leading-relaxed bg-neutral-100 dark:bg-neutral-900 p-0.5 rounded`.
- **Line Heights**: 
  - Headings: `leading-tight` or `leading-none` (1.1 to 1.2).
  - Body: `leading-relaxed` (1.6 to 1.7).
- **Letter Spacing**: Tighter for large text (`tracking-tighter`), wider for micro text (`tracking-wider`).
- **Content Width**: Maximum 65-75 characters per line (`max-w-prose` or `max-w-2xl`).

---

## 6. SPACING SYSTEM

Strict adherence to a mathematical 4pt/8pt grid system.

### Container Widths
- **Hero/Landing**: `max-w-6xl` (1152px) or `max-w-7xl` (1280px).
- **Documentation/Blog**: `max-w-3xl` (768px) for reading content, `max-w-7xl` for the full layout including sidebars.
- **Dashboard/App**: `max-w-5xl` (1024px) for optimal data density.

### Spacing Rhythm (Tailwind Scale)
- **Micro**: `gap-1` (4px), `gap-2` (8px). (Inside buttons, between label and input).
- **Component**: `gap-4` (16px), `gap-6` (24px). (Between cards in a grid, between paragraphs).
- **Section**: `py-16` (64px), `py-24` (96px). (Between landing page sections).
- **Hero**: `py-32` (128px) or `py-40` (160px).

### Whitespace Rules
- Whitespace is an active design element. Do not cram elements together to "save space."
- If a section feels overwhelming, double the padding.
- Consistent padding inside cards: always `p-4` or `p-6`. Never `p-3` on one card and `p-5` on another.

---

## 7. LAYOUT SYSTEM

### Page Blueprints
- **Homepage**: 
  - Crisp Navigation -> Massive Typography Hero -> Social Proof (Logos) -> Product Demo (Interactive or High-Res Image) -> Feature Grid (Bento Box style) -> Technical Deep Dive -> CTA -> Massive Footer.
- **Documentation**:
  - Sticky Top Nav -> Left Sidebar (Navigation, Sticky) -> Main Content Area (`max-w-3xl`) -> Right Sidebar (Table of Contents, Sticky).
- **Blog / Changelog**:
  - Centered layout. Date and Author top metadata. Massive Title. Impeccable typography content body. Subtle newsletter CTA at the bottom.
- **Comparisons (Alternative to X)**:
  - Hero stating exactly why Money OS is better -> Side-by-side spec comparison table (tabular nums) -> Testimonials -> Migration CTA.
- **Pricing**:
  - Extremely clear toggle (Monthly/Annual). 1-3 crisp cards. Exhaustive feature comparison table below the cards.

### Content Flow & Conversion
- Every page has exactly ONE primary conversion goal (e.g., "Start for free").
- The reading journey must flow down the center spine of the page or follow an F-pattern.
- CTAs are placed at the top (Hero) and the absolute bottom of the page. Do not litter CTAs in every paragraph.

---

## 8. COMPONENT SYSTEM

Every component must be over-engineered for perfection.

### Buttons
- **Purpose**: Trigger actions.
- **Primary**: `bg-black text-white dark:bg-white dark:text-black rounded-md px-4 py-2 text-[13px] font-medium`.
- **Secondary**: `bg-transparent border border-neutral-200 dark:border-neutral-800 rounded-md px-4 py-2 text-[13px] hover:bg-neutral-50 dark:hover:bg-neutral-900`.
- **States**: `disabled:opacity-50 disabled:cursor-not-allowed`. Focus rings on all.

### Cards
- **Hierarchy**: Structural separators.
- **Style**: `bg-white dark:bg-[#000000] border border-neutral-200 dark:border-neutral-800 rounded-xl`.
- **Padding**: `p-6`.
- **Rule**: NO dropshadows (`shadow-sm` is allowed, nothing larger). NO `hover:-translate-y-1`.

### Inputs & Search
- **Style**: `h-9 px-3 text-[13px] rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent`.
- **Focus**: `focus:ring-1 focus:ring-black dark:focus:ring-white`.
- **Search**: Must always have a keyboard shortcut indicator (e.g., `⌘K`) visually embedded on the right side.

### Tables & Data Grids
- **Header**: `text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-neutral-800 pb-2`.
- **Rows**: `text-[13px] border-b border-neutral-100 dark:border-neutral-900 py-3`.
- **Hover**: Subtle background shift.

### Code Blocks
- **Style**: `bg-[#0a0a0a] text-neutral-200 p-4 rounded-xl border border-neutral-800 text-[13px] font-mono overflow-x-auto`.
- **Features**: Always include a "Copy to Clipboard" button that appears on hover.

### Alerts / Callouts
- **Style**: `border-l-2 p-4 text-[13px] bg-neutral-50 dark:bg-neutral-900 rounded-r-md`.
- **Colors**: Border color corresponds to semantic intent (Info=Blue, Warning=Amber).

### Navigation & Breadcrumbs
- **Top Nav**: `h-14`, absolute minimalist. Logo on left. Links in center (`text-[13px] text-neutral-500 hover:text-black`). CTA on right.
- **Breadcrumbs**: `text-[13px] text-neutral-500`. Separator: `/` or `>`. Last item is `text-neutral-900 font-medium`.

### Documentation Sidebar
- **Hierarchy**: Group -> Link.
- **Style**: Group headers are `text-[11px] uppercase font-medium mt-6 mb-2`. Links are `text-[13px] text-neutral-500 hover:text-black py-1`. Active link is `text-black font-medium dark:text-white`.

---

## 9. MOTION SYSTEM

Motion must be elegant, physics-based, and completely unobtrusive.

### Rules & Limits
- **Page Transitions**: Instant. Or maximum `150ms` cross-fade.
- **Hover States**: Colors and opacity ONLY. `duration-150 ease-out`.
- **Microinteractions**: Button presses scale down to `scale-[0.98]` instantly, and release with a quick spring.
- **Modals / Drawers**: Slide in from bottom/side `duration-200` with `cubic-bezier(0.16, 1, 0.3, 1)`.
- **BANNED**: No bouncy scroll-jacking. No generic `slide-in-from-top` that delays reading.

### Loading States & Skeletons
- No spinning wheels for page content.
- Use skeletons: `animate-pulse bg-neutral-200 dark:bg-neutral-800 rounded-md`.
- Skeletons must exactly match the dimensions of the final content to prevent layout shift.

### Accessibility
- Must respect `prefers-reduced-motion`. If true, bypass all slide/scale animations and default to instant or simple opacity fades.

---

## 10. CONTENT DESIGN SYSTEM

Content is the interface. The way we present text is as important as the code.

### Reading Flow & Hierarchy
- **H1**: The absolute core premise (e.g., "The Engineering behind Money OS").
- **Lead Paragraph**: Larger text (`text-[18px] text-neutral-500`). Sets the hook.
- **H2 / H3**: Break the content every 300 words. Never present a wall of text.
- **Bullets**: Use them aggressively. People scan, they do not read.

### SEO & AI Discovery Optimization
- Pages must be structured with strict semantic HTML (`<article>`, `<section>`, `<nav>`, `<aside>`).
- Only ONE `<h1>` per page.
- Direct, descriptive URLs (`/docs/api/authentication`, not `/d/123-auth`).
- Provide distinct, comprehensive Meta Descriptions and Open Graph images.
- AI bots (Perplexity, ChatGPT) favor high-density, well-structured markdown-like data. Use tables for comparisons.

---

## 11. AI CONTENT FUTURE ARCHITECTURE

This system must be bulletproof enough to ingest programmatic and AI-generated content without degrading the brand quality.

### Metadata & Schema Rules
- Every content piece (Blog, Case Study, Glossary term) MUST have a strictly typed frontmatter:
  - `title`, `description`, `date`, `author`, `slug`, `category`, `tags`.
- Every page MUST inject structured JSON-LD schema (Article, SoftwareApplication, FAQPage).

### Content Templates
- AI-generated content must map into pre-defined React components (e.g., `<Prose>`, `<ComparisonTable>`, `<CodeSnippet>`). 
- Do not let AI generate raw HTML. The AI outputs Markdown/MDX, and the Design System renders it securely.

### Anti-AI-Slop Rules
- **No Fluff Intros**: AI loves to write "In today's fast-paced digital world...". This is banned. The human reviewer or the generation prompt must strictly enforce "Nouns-first, start immediately."
- **Visual Consistency**: Programmatic pages (e.g., "Money OS vs Quickbooks") must use the exact same `<ComparisonLayout>` component. No unique layouts for generated pages.

### Human Review Protocol
- Generated content must pass a manual review for:
  1. Voice & Tone (Is it clinical and precise?)
  2. Factuality.
  3. Formatting (Are tables rendering properly in dark mode?)

---

## 12. RESPONSIVE DESIGN

The design must be flawless on a 4k monitor and an iPhone SE.

### Breakpoints (Tailwind)
- `sm` (640px): Mobile landscape / Large phones.
- `md` (768px): Tablets. Sidebars usually collapse into hamburger menus here.
- `lg` (1024px): Laptops. Desktop layouts activate.
- `xl` (1280px): Desktops.
- `2xl` (1536px): Ultra-wide. Use max-width containers to prevent infinite stretching.

### Specific Rules
- **Mobile Typography**: Drop H1s from `text-[72px]` to `text-[40px]`.
- **Navigation**: On mobile, use a crisp, full-screen drawer overlay. No complex dropdowns on touch devices.
- **Tables**: On mobile, tables must horizontally scroll (`overflow-x-auto`). Do NOT stack table rows into cards unless specifically designed as a list view.
- **Hover**: Do not rely on hover states for critical actions, as they do not exist on touch devices.

---

## 13. ACCESSIBILITY

We build for everyone. Excellence requires inclusivity.

- **WCAG Compliance**: Aim for AA standard minimum.
- **Keyboard Navigation**: Everything must be operable via `Tab`, `Enter`, `Space`, and `Arrows`.
- **Focus Rings**: Never use `outline-none` unless replaced by a custom, highly visible focus ring.
- **Contrast Standards**: Text must have a minimum contrast ratio of 4.5:1 against its background. `#737373` on `#ffffff` is the absolute lightest acceptable gray.
- **Screen Readers**: Use `aria-label` for icon-only buttons. Use `aria-hidden="true"` for purely decorative SVG elements.
- **Forms**: Every input MUST have an associated `<label>` (visually hidden via `sr-only` is acceptable, but it must exist).

---

## 14. DESIGN GOVERNANCE

Nothing ships to a discovery property unless it passes these checklists.

### 14.1 Design Review Checklist
- [ ] Does it look like Vercel/Linear/Stripe?
- [ ] Is the spacing mathematically consistent (multiples of 4/8)?
- [ ] Is there exactly ONE primary CTA?
- [ ] Does Dark Mode use `#000` background and appropriate subtle borders?
- [ ] Is the typography hierarchy clear without using `font-black`?

### 14.2 Component Approval Checklist
- [ ] Does it use existing design system tokens (colors, text sizes)?
- [ ] Does it have defined Hover, Focus, and Disabled states?
- [ ] Does it work correctly on mobile (`< 640px`)?
- [ ] Is it fully keyboard accessible?

### 14.3 Future AI Content Approval Checklist
- [ ] Does the MDX output render perfectly within the `<Prose>` wrapper?
- [ ] Is the tone direct and fluff-free?
- [ ] Does it include proper JSON-LD schema?
- [ ] Are all external/internal links working and styled correctly?

---

*End of Constitution. This document is final and active.*
