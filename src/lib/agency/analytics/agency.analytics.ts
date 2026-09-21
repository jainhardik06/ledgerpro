/**
 * Agency Vertical — Analytics (Step 0.4 skeleton)
 *
 * The financial calculation engine (PRD §83/§84): pure, deterministic functions
 * consumed by API routes, reports, and alerts — never imported by React components.
 * Bound by docs/agency/phase-1/01-architecture-map.md §2 (layer contract):
 *   - May import from domain/ and queries/ only (plus their types).
 *   - No app/, components/, React imports.
 *
 * Future: cost.ts, revenue.ts, profitability.ts, billing.ts, receivables.ts,
 * tax.ts, alerts.ts — one formula, one home, never duplicated in routes/pages.
 */
export const AGENCY_ANALYTICS = 'agency';
