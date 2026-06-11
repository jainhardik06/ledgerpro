# Content Strategy

## The Multi-Pronged Approach

The Discovery Engine is strictly designed to execute four parallel content strategies simultaneously without bleeding over dependencies.

### 1. Programmatic SEO
- **Format**: Templated Markdown/MDX inside `src/pages` or `src/content`.
- **Target**: High-volume, low-intent long-tail keywords (e.g., "Expense tracker for digital agencies in Ohio").
- **Execution**: Scalable from 10 to 1,000+ pages via uniform data structures.

### 2. High-Intent Use Cases & Comparisons
- **Format**: Bespoke landing pages leveraging reusable Astro components.
- **Target**: Bottom-of-funnel users actively evaluating competitors.
- **Execution**: Highly designed pages mapping Money OS features against legacy tools.

### 3. Developer & Platform Documentation
- **Format**: Hierarchical MDX under `src/content/docs`.
- **Target**: Existing users and developers integrating with our API (future).
- **Execution**: Fast, searchable, beautifully styled documentation using Astro Starlight or custom layouts.

### 4. AI Discovery (The New SEO)
- **Format**: Strict JSON-LD schemas, highly structured FAQs, and explicit semantic HTML.
- **Target**: Large Language Models (ChatGPT, Claude, Perplexity).
- **Execution**: Instead of just keywords, we provide explicit Q&A formats that models can easily scrape, parse, and cite.

## The Content Pipeline (Future)
We are preparing the structure for an automated pipeline:
1. Topics and Briefs live in the **Growth Database**.
2. AI agents generate raw MDX files.
3. Files are PR'd into this repository automatically.
4. Human review approves the PR.
5. Vercel automatically statically builds and deploys.
