/**
 * Agency Vertical — Validators (Step 0.4 skeleton)
 *
 * Agency input validation, following the conventions of src/lib/validation.ts.
 * PRD §68: every Agency API authenticates → resolves tenant → validates role →
 * validates body → executes domain operation → audits → returns normalized response.
 *
 * Validators are pure functions; no DB access, no React imports.
 * Populated per-sprint alongside the entities they guard.
 */
export const AGENCY_VALIDATORS = 'agency';
