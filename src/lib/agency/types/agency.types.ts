/**
 * Agency Vertical — Types (Step 0.4 skeleton)
 *
 * Client-safe type definitions for the Agency vertical.
 *
 * RULE: this directory (and the entities types it grows) must stay importable
 * from browser code — types/interfaces only. No imports of lib/db, mongodb,
 * or any server-only module. React components import from here, never from
 * domain repositories or analytics internals.
 *
 * This keeps the one-way dependency direction (agency → core, never core → agency)
 * while letting components render strongly-typed API responses.
 */
export const AGENCY_TYPES = 'agency';
