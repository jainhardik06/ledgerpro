# Money OS — Testing Guide

This document describes the **current** verification stack for Money OS.
(Historical note: an earlier Maestro mobile-flow setup existed but was removed
from the repository — E2E coverage is now carried entirely by the Bruno API
suites below, per the project's standing rule: *Bruno + Vitest only*.)

## The three layers

| Layer | Tool | Command | Scale (2026-09) |
| :--- | :--- | :--- | :--- |
| Unit + Integration | Vitest 5 | `npm run test:unit` | 55 files · 1251 tests |
| API E2E Regression | Bruno CLI | `npm run test:api` | 49 suites · 731 requests · 2161 assertions |
| Secret scanning | gitleaks | CI (`backend-ci.yml`) | blocks on any finding |

Static gates that must stay green before any release:

```bash
npx tsc --noEmit     # 0 errors
npx eslint src       # 0 errors, 0 warnings
npm run build        # production build (GA4/GSC prerender noise is known)
```

## Running the API regression

The Bruno suites run against a **production build** with a real MongoDB —
never a dev server:

```bash
npm run build
npm run start          # serves on :3000
npm run test:api       # = cd tests/bruno && bru run --env local
```

The `local` environment (`tests/bruno/environments/local.bru`) defines
`BASE_URL` and the test-only webhook secret
(`RAZORPAY_WEBHOOK_SECRET=whsec_local_e2e_test_only` — never a real
credential).

## What the 49 suites cover

- **Core**: auth, transactions, accounts, budgets, recurring, clients, logs.
- **Agency vertical (suites 30–48)**: every module end-to-end — signup →
  agency mode → clients → projects (wizard, milestones, work items, team) →
  rate cards (versioning, snapshots) → time (timer, manual entry, timesheet
  approval) → expenses (approval, markup) → invoices (GST/HSN, TDS,
  finalization, voiding) → payments (manual, partial, reversal) → Razorpay
  payment links + **signed-webhook attack proofs** (including cross-tenant
  signature-binding negatives, suite 47 requests 57–63) → profitability →
  receivables/aging → alerts → reports/exports → settings.
- **Cross-vertical (suite 40)**: Standard and Student Club tenants unchanged
  when Agency is active.
- **Reconciliation (suite 48)**: the release gate — one tenant, the full
  money journey, then six read surfaces (invoice store, core ledger,
  reconciliation overview, receivables engine, dashboard aggregate, reports)
  must all agree on the same numbers.
- **Privilege gates (suite 49)**: tenant sessions get 401 on every
  super-admin surface, including the platform agency analytics.

### Bruno scripting notes

The Bruno QuickJS sandbox has **no `Intl`** — timezone math in `.bru`
pre-request scripts is pure JS (fixed UTC offsets + hand-rolled DST rules),
and webhook signatures are computed with a pure-JS HMAC-SHA256. Keep new
suites within those constraints.

## Dependency security

`npm audit` is kept at **0 vulnerabilities** (verified with the
`security-auditor` skill). Risky transitive versions are pinned via the
`overrides` block in `package.json` (workbox 7.4.1, axios 1.20, form-data
4.0.6, nanoid 3.3.19, csv-parse 7.0.2, faker 10.6, uuid 11.1.1). Re-audit
after ANY dependency change — a "fix" downgrade can introduce worse
advisories than it removes.
