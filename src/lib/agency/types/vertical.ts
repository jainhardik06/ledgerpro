/**
 * Agency Vertical — Types: Vertical & Capability model (Step 0.5)
 *
 * CLIENT-SAFE: types and pure functions only. No server imports.
 *
 * This module is the single capability boundary for Money OS verticals.
 * Instead of scattering `if (tenant.appMode === "Agency")` checks across the
 * app, code asks: "does this tenant have capability X?"
 *
 * Model (PRD §86):
 *   Tenant → Vertical → Capabilities
 *
 * Adding a future vertical means adding one entry to VERTICAL_CAPABILITIES —
 * no changes to consumers.
 */

/** The Money OS verticals. Mirrors Tenant.appMode values in src/lib/db.ts. */
export type Vertical = 'Standard' | 'Student_Club' | 'Agency';

/** Capabilities exposed by the Agency vertical in Phase 1. */
export type AgencyCapability =
  | 'AGENCY_DASHBOARD'
  | 'PROJECTS'
  | 'TIME_TRACKING'
  | 'BILLING'
  | 'PROFITABILITY';

/**
 * The vertical → capabilities registry.
 * Types are structurally fixed at Step 0; values grow per-sprint and per-vertical.
 */
export const VERTICAL_CAPABILITIES: Readonly<Record<Vertical, readonly AgencyCapability[]>> = {
  Standard: [],
  Student_Club: [],
  Agency: [
    'AGENCY_DASHBOARD',
    'PROJECTS',
    'TIME_TRACKING',
    'BILLING',
    'PROFITABILITY',
  ],
};

/**
 * Resolve a tenant's appMode into a typed Vertical (defensive: unknown/legacy
 * values fall back to Standard so old tenants keep their exact current behavior).
 */
export function resolveVertical(appMode: unknown): Vertical {
  return appMode === 'Agency' || appMode === 'Student_Club' || appMode === 'Standard'
    ? (appMode as Vertical)
    : 'Standard';
}

/** Pure check: does the given vertical have the capability? */
export function verticalHasCapability(vertical: Vertical, capability: AgencyCapability): boolean {
  return VERTICAL_CAPABILITIES[vertical].includes(capability);
}

/**
 * Tenant-facing check. Accepts the raw tenant object as returned by
 * /api/tenant (appMode is optional on it) so UI code never touches appMode
 * comparison directly.
 */
export function tenantHasCapability(tenant: { appMode?: string } | null | undefined, capability: AgencyCapability): boolean {
  return verticalHasCapability(resolveVertical(tenant?.appMode), capability);
}
