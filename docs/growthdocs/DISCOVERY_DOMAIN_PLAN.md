# Money OS Domain Architecture

This document finalizes the top-level routing strategy to guarantee zero overlap between the SaaS workload and marketing/SEO workflows.

## 1. Product Engine
**Domain**: `moneyos.webasthetic.in`
**Repository**: `ledgerpro` (Next.js App Router)
**Purpose**: Secure, authenticated SaaS platform.
- Handles user accounts, transactions, budgets, auth, and the Super Admin dashboards.
- Zero public marketing content.

## 2. Discovery Engine
**Domain**: `discovermoneyos.webasthetic.in`
**Repository**: `money-os-discovery` (Astro v6)
**Purpose**: High-velocity static marketing footprint.
- All unauthenticated traffic routes here.

### Discovery Routing Strategy
The Astro repository will generate static HTML for the following pathways:
- `discovermoneyos.webasthetic.in/docs` -> Technical documentation and API references.
- `discovermoneyos.webasthetic.in/blog` -> Editorial and founder journey articles.
- `discovermoneyos.webasthetic.in/changelog` -> Engineering updates and release notes.
- `discovermoneyos.webasthetic.in/comparisons` -> Competitor matrices (e.g. `.../comparisons/money-os-vs-quickbooks`).
- `discovermoneyos.webasthetic.in/use-cases` -> Audience-specific landing pages (e.g. `.../use-cases/freelancers`).
- `discovermoneyos.webasthetic.in/resources` -> Curated tool directory and supplemental content.

### Deployment Infrastructure
- **Vercel Project 1**: Deploys `moneyos.webasthetic.in` connected to the `ledgerpro` repository and the Primary DB.
- **Vercel Project 2**: Deploys `discovermoneyos.webasthetic.in` connected to the `money-os-discovery` repository and the Growth DB. 

This strict boundary prevents any SEO spikes or bot traffic from impacting product latency.
