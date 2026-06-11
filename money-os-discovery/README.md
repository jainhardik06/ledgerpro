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

## Constraints & Rules

- **No Authentication:** Pure public-facing content.
- **No User Accounts:** SaaS logic belongs in the main `money-os` repo.
- **No Dashboard:** Dashboards run in the Product Engine.
- **No Direct Mongo Dependency:** Content is built statically during deployment. DB connections (if any) are strictly build-time for static generation.

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
