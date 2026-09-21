/**
 * Agency Vertical — Test fixtures: two-isolated-agencies baseline (Step 0.16)
 *
 * The foundation for tenant-isolation testing. Two complete, disjoint agency
 * workspaces with the same shape — every agency test that proves isolation
 * (PRD §102: Tenant A cannot access Tenant B's anything) loads these and
 * attempts cross-tenant probes.
 *
 * Fixture shape follows the real entities:
 *   Tenant (appMode: 'Agency') → Users → Client → Project → Account → Transactions
 *
 * IDs are stable deterministic strings so tests can reference them.
 * This module is test-only — never imported by production code.
 *
 * Module 1 note: projects/invoices/payments entities don't exist yet, so the
 * fixtures carry their CONTRACT shape (the fields the definitions doc needs).
 * When Sprint 1 implements Project, this file gains repository-level factory
 * helpers that persist these shapes; the constants remain the source of truth.
 */

// ---------- AGENCY A (the "home" tenant in isolation tests) ----------

export const AGENCY_A = {
  tenant: {
    id: 'a00000000000000000000000a',
    name: 'Agency A Studios',
    status: 'ACTIVE' as const,
    plan: 'FREE' as const,
    appMode: 'Agency' as const,
  },
  admin: {
    userId: 'a10000000000000000000000a',
    username: 'agency_a_admin',
    role: 'TENANT_ADMIN' as const,
    tenantId: 'a00000000000000000000000a',
  },
  member: {
    userId: 'a20000000000000000000000a',
    username: 'agency_a_dev',
    role: 'USER' as const,
    tenantId: 'a00000000000000000000000a',
  },
  client: {
    id: 'a30000000000000000000000a',
    tenantId: 'a00000000000000000000000a',
    name: 'Client A Industries',
    email: 'billing@clienta.example',
  },
  project: {
    id: 'a40000000000000000000000a',
    tenantId: 'a00000000000000000000000a',
    clientId: 'a30000000000000000000000a',
    name: 'Project A — Website Redesign',
    billingModel: 'FIXED_FEE' as const,
    contractValue: 500000,
    plannedHours: 400,
    targetMargin: 40,
    status: 'Active' as const,
    currency: 'INR',
  },
  account: {
    id: 'a50000000000000000000000a',
    tenantId: 'a00000000000000000000000a',
    name: 'Agency A Operating',
    type: 'Bank',
    initialBalance: 100000,
  },
  transactions: [
    {
      id: 'a60000000000000000000000a',
      tenantId: 'a00000000000000000000000a',
      userId: 'a10000000000000000000000a',
      type: 'Debit' as const,
      description: 'Stock photos for Project A',
      amount: 12000,
      date: '2026-08-15',
      clientId: 'a30000000000000000000000a',
      // agency expense metadata (per data boundary §3 — all optional)
      projectId: 'a40000000000000000000000a',
      billable: true,
      markupPercent: 20,
      expenseStatus: 'Approved',
      invoiceId: null,
    },
    {
      id: 'a60000000000000000000000000b',
      tenantId: 'a00000000000000000000000a',
      userId: 'a20000000000000000000000a',
      type: 'Debit' as const,
      description: 'Team travel (internal)',
      amount: 4500,
      date: '2026-08-20',
      clientId: null,
      projectId: null,
      billable: false,
      invoiceId: null,
    },
  ] as const,
} as const;

// ---------- AGENCY B (the "foreign" tenant — probes must miss) ----------

export const AGENCY_B = {
  tenant: {
    id: 'b00000000000000000000000b',
    name: 'Agency B Digital',
    status: 'ACTIVE' as const,
    plan: 'FREE' as const,
    appMode: 'Agency' as const,
  },
  admin: {
    userId: 'b10000000000000000000000b',
    username: 'agency_b_admin',
    role: 'TENANT_ADMIN' as const,
    tenantId: 'b00000000000000000000000b',
  },
  client: {
    id: 'b30000000000000000000000b',
    tenantId: 'b00000000000000000000000b',
    name: 'Client B Retail',
    email: 'ap@clientb.example',
  },
  project: {
    id: 'b40000000000000000000000b',
    tenantId: 'b00000000000000000000000b',
    clientId: 'b30000000000000000000000b',
    name: 'Project B — Mobile App',
    billingModel: 'TIME_AND_MATERIALS' as const,
    contractValue: 0,
    plannedHours: 600,
    targetMargin: 35,
    status: 'Active' as const,
    currency: 'INR',
  },
  transactions: [
    {
      id: 'b60000000000000000000000b',
      tenantId: 'b00000000000000000000000b',
      userId: 'b10000000000000000000000b',
      type: 'Debit' as const,
      description: 'Contractor cost for Project B',
      amount: 30000,
      date: '2026-08-18',
      clientId: 'b30000000000000000000000b',
      projectId: 'b40000000000000000000000b',
      billable: true,
      markupPercent: 0,
      expenseStatus: 'Approved',
      invoiceId: null,
    },
  ] as const,
} as const;

// ---------- a NON-AGENCY control tenant (capability gating tests) ----------

export const STANDARD_TENANT = {
  tenant: {
    id: 'c00000000000000000000000c',
    name: 'Standard Shop',
    status: 'ACTIVE' as const,
    plan: 'FREE' as const,
    appMode: 'Standard' as const,
  },
  admin: {
    userId: 'c10000000000000000000000c',
    username: 'standard_admin',
    role: 'TENANT_ADMIN' as const,
    tenantId: 'c00000000000000000000000c',
  },
} as const;

// ---------- isolation test expectations ----------

/**
 * Cross-tenant probes: Agency A's session must NOT reach any of B's resources.
 * Used by future Bruno/invariant tests (401/403/404 matrix, definitions §102).
 */
export const CROSS_TENANT_PROBES = [
  { probe: 'Agency A session → Agency B project', tenantId: AGENCY_A.tenant.id, resourceId: AGENCY_B.project.id, expected: 404 },
  { probe: 'Agency A session → Agency B client', tenantId: AGENCY_A.tenant.id, resourceId: AGENCY_B.client.id, expected: 404 },
  { probe: 'Agency A session → Agency B transaction', tenantId: AGENCY_A.tenant.id, resourceId: AGENCY_B.transactions[0].id, expected: 404 },
  { probe: 'Standard session → agency dashboard', tenantId: STANDARD_TENANT.tenant.id, expected: 403 },
] as const;
