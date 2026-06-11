# Money OS Domain Architecture

This document finalizes the top-level routing strategy to guarantee zero overlap between the SaaS workload and marketing/SEO workflows.

## 1. Product Engine
**Domain**: `moneyos.webasthetic.in`
**Repository**: `ledger` (Next.js App Router)
**Purpose**: Secure, authenticated SaaS platform.
- Handles user accounts, Stripe billing, transactions, budgets, auth, and the Super Admin dashboards.
- Zero public marketing content.

## 2. Discovery Engine
**Domain**: `discover.moneyos.webasthetic.in`
**Repository**: `money-os-discovery` (Astro v6)
**Purpose**: High-velocity static marketing footprint.
- All unauthenticated traffic routes here.

### Discovery Routing Strategy
The Astro repository will generate static HTML for the following pathways:
- `discover.moneyos.webasthetic.in/docs` -> Technical documentation and API references.
- `discover.moneyos.webasthetic.in/blog` -> Editorial and founder journey articles.
- `discover.moneyos.webasthetic.in/changelog` -> Engineering updates and release notes.
- `discover.moneyos.webasthetic.in/comparisons` -> Competitor matrices (e.g. `.../comparisons/money-os-vs-quickbooks`).
- `discover.moneyos.webasthetic.in/use-cases` -> Audience-specific landing pages (e.g. `.../use-cases/freelancers`).

### Deployment Infrastructure
- **Vercel Project 1**: Deploys `moneyos.webasthetic.in` connected to the `ledger` repository and the Primary DB.
- **Vercel Project 2**: Deploys `discover.moneyos.webasthetic.in` connected to the `money-os-discovery` repository and the Growth DB. 

This strict boundary prevents any SEO spikes or bot traffic from impacting product latency.
