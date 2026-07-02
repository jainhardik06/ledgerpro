# Money OS Discovery Engine

This repository represents the **Discovery Engine** for Money OS.

**IMPORTANT:** This is NOT the SaaS product. 

It is a pure static engine designed to capture, educate, and convert traffic for Money OS.

## Goals

1. **SEO:** Serve highly optimized, blazing-fast programmatic pages.
2. **Documentation:** Host developer and user documentation (500+ pages future-ready).
3. **Landing Pages:** Convert organic traffic with targeted use-cases.
4. **AI Discovery:** Structure content for LLMs (ChatGPT, Claude, Perplexity) via robust schemas.
5. **Content Marketing:** Host a scalable blog and resource hub.
6. **Product Hunt Assets:** Store static assets for launches.
7. **Comparison & Use Case Pages:** Educate users on alternatives and capabilities.

## Technology Stack

- **Framework:** Astro (for pure static output, near-zero runtime, and ultra-fast builds).
- **Language:** TypeScript.
- **Content Formatting:** MDX natively supported.
- **Generation Model:** Static Site Generation (SSG).

> **Setup & operations:** see [OPERATIONS.md](./OPERATIONS.md) for the (short) list
> of credentials to fill in and how the automated content engine runs.

## Constraints & Rules

- **No Authentication:** Pure public-facing content.
- **No User Accounts:** SaaS logic belongs in the main `money-os` repo.
- **Static-first:** Every content page is prerendered (SSG). The single exception is
  the affiliate redirect `/go/<slug>`, a tiny serverless function that logs a click
  and 302-redirects. The Growth DB is otherwise touched only by build/CI scripts.
- **Isolated Growth DB:** All data lives in the separate `money_os_growth` cluster,
  never the production SaaS database.

## Engines

- **Visual Engine** (`src/lib/og.ts`, `src/pages/og/`) — branded OG images at build time.
- **Content Engine** (`scripts/`) — topic discovery → article generation → publish, automated via GitHub Actions (~1 post / 3 days).
- **Monetization Engine** (`src/components/AdSlot.astro`, `src/pages/go/`) — contextual ads (off by default) + affiliate redirects with click tracking.
- **SEO/AI Discovery** — sitemap, RSS, `robots.txt`, `/llms.txt`, JSON-LD on every page.

## Directory Structure

- `/src/content/docs` - Product documentation
- `/src/content/blog` - Articles and thought leadership
- `/src/content/changelog` - Product updates
- `/src/content/comparisons` - Competitor comparisons
- `/src/content/use-cases` - Niche specific landing pages
- `/src/pages` - Astro file-based routing
- `/src/components` - Reusable UI components
- `/src/layouts` - Page wrappers

## Future Scaling

This foundation is built to scale seamlessly to **1000+ programmatic SEO pages**, handle automated AI content generation pipelines, and endure massive crawler traffic without costing server resources.
