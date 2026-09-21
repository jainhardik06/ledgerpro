/**
 * Module 6 (Sprints 6.3–6.4) — unit: rate domain service + resolution engine.
 *
 * Covers the spec's explicit test matrix (§103) plus the release-gate
 * scenario (§136) and the historical-integrity rules (§64/§77/§79/§122):
 *
 *   §103  version resolution across years (2025 → ₹700, 2026 → ₹900)
 *   §103  overlap rejection (Jan–Jun vs Apr–Dec)
 *   §103  client override (Agency ₹2,500 / Acme ₹3,000)
 *   §96   missing rate is NOT_CONFIGURED, never zero
 *   §77   open-ended replacement forward in time auto-closes (§79)
 *   §122  rate change closes the old version and creates a new one
 *   §76   archived cards accept no new entries/assignments
 *   §136  the full release-gate resolution (cost ₹900 + billing ₹2,500)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  getClientById: vi.fn(),
  getUserById: vi.fn(),
  getRateCards: vi.fn(),
  getRateCardById: vi.fn(),
  createRateCard: vi.fn(),
  updateRateCard: vi.fn(),
  listRateCardEntries: vi.fn(),
  listAllRateCardEntries: vi.fn(),
  getRateCardEntryById: vi.fn(),
  createRateCardEntry: vi.fn(),
  updateRateCardEntry: vi.fn(),
  createRateEntryVersion: vi.fn(),
  closeRateEntryVersion: vi.fn(),
  listRateEntryVersions: vi.fn(),
  getUserCostAssignments: vi.fn(),
  getUserCostAssignmentById: vi.fn(),
  getUserCostAssignmentsByCard: vi.fn(),
  createUserCostAssignment: vi.fn(),
  updateUserCostAssignment: vi.fn(),
  // imported by agency.clients (AuditContext/DomainResult home) — same module
  createClient: vi.fn(), getClients: vi.fn(), updateClient: vi.fn(),
  searchClients: vi.fn(), findClientByName: vi.fn(), getLogs: vi.fn(),
}));

import {
  getClientById, getUserById, getRateCards, getRateCardById,
  listRateCardEntries, getRateCardEntryById, updateRateCard as updateRateCardRepo,
  createRateEntryVersion, closeRateEntryVersion, listRateEntryVersions,
  getUserCostAssignments, getUserCostAssignmentById,
  createUserCostAssignment, updateUserCostAssignment,
} from '@/lib/db';
import {
  assignUserCostRate, updateRateEntry, createRateEntry,
  archiveRateCard, createRateCard, updateRateCard,
} from '@/lib/agency/domain/agency.rates';
import { resolveCostRate, resolveBillingRate } from '@/lib/agency/domain/rate-resolution';
import type { RateCard, RateCardEntry, UserCostAssignment } from '@/lib/agency/types/rate';

const TENANT = 'tenant-a';
const OTHER_TENANT = 'tenant-b';

function card(overrides: Partial<RateCard> = {}): RateCard {
  return {
    id: 'cost-card', tenantId: TENANT, name: 'Agency Cost 2026', type: 'COST',
    currency: 'INR', scope: 'ORGANIZATION', status: 'ACTIVE',
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function entry(overrides: Partial<RateCardEntry> = {}): RateCardEntry {
  return {
    id: 'entry-senior', tenantId: TENANT, rateCardId: 'cost-card',
    name: 'Senior Developer', unit: 'HOUR', amount: 900, currency: 'INR',
    billable: false, billingType: 'HOURLY',
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function assignment(overrides: Partial<UserCostAssignment> = {}): UserCostAssignment {
  return {
    id: 'assign-1', tenantId: TENANT, userId: 'user-1',
    rateCardId: 'cost-card', rateCardEntryId: 'entry-senior',
    effectiveFrom: '2026-01-01', effectiveTo: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

const audit = { username: 'admin', tenantId: TENANT, log: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  // Safe defaults so unspecified lookups return "nothing", never undefined.
  (getUserCostAssignments as Mock).mockResolvedValue([]);
  (getRateCards as Mock).mockResolvedValue([]);
  (getRateCardById as Mock).mockResolvedValue(null);
  (listRateCardEntries as Mock).mockResolvedValue([]);
  (getRateCardEntryById as Mock).mockResolvedValue(null);
  (listRateEntryVersions as Mock).mockResolvedValue([]);
  (getUserById as Mock).mockResolvedValue({ id: 'user-1', tenantId: TENANT, username: 'dev1', role: 'USER' });
  (getClientById as Mock).mockResolvedValue({ id: 'cl-1', tenantId: TENANT, name: 'Acme' });
  (updateRateCardRepo as Mock).mockResolvedValue(true);
});

// ---------- §103: rate resolution ----------

describe('Module 6 — resolveCostRate (§66/§103)', () => {
  it('resolves the version that covers the date: 2025 → ₹700, 2026 → ₹900 (§64/§103)', async () => {
    (getUserCostAssignments as Mock).mockResolvedValue([assignment({ effectiveFrom: '2025-01-01' })]);
    (getRateCardById as Mock).mockResolvedValue(card());
    (getRateCardEntryById as Mock).mockResolvedValue(entry());
    (listRateEntryVersions as Mock).mockResolvedValue([
      { id: 'v1', tenantId: TENANT, rateCardId: 'cost-card', rateCardEntryId: 'entry-senior',
        amount: 700, currency: 'INR', effectiveFrom: '2025-01-01', effectiveTo: '2025-12-31', createdAt: new Date() },
      { id: 'v2', tenantId: TENANT, rateCardId: 'cost-card', rateCardEntryId: 'entry-senior',
        amount: 900, currency: 'INR', effectiveFrom: '2026-01-01', effectiveTo: null, createdAt: new Date() },
    ]);

    const in2025 = await resolveCostRate(TENANT, 'user-1', '2025-06-15');
    expect(in2025.status).toBe('RESOLVED');
    expect(in2025.amount).toBe(700);
    expect(in2025.source).toBe('USER_ASSIGNMENT');

    const in2026 = await resolveCostRate(TENANT, 'user-1', '2026-06-15');
    expect(in2026.status).toBe('RESOLVED');
    expect(in2026.amount).toBe(900);
  });

  it('honors the INCLUSIVE range boundary: 2025-12-31 is old, 2026-01-01 is new (§79)', async () => {
    (getUserCostAssignments as Mock).mockResolvedValue([assignment({ effectiveFrom: '2025-01-01' })]);
    (getRateCardById as Mock).mockResolvedValue(card());
    (getRateCardEntryById as Mock).mockResolvedValue(entry());
    (listRateEntryVersions as Mock).mockResolvedValue([
      { id: 'v1', tenantId: TENANT, rateCardId: 'cost-card', rateCardEntryId: 'entry-senior',
        amount: 700, currency: 'INR', effectiveFrom: '2025-01-01', effectiveTo: '2025-12-31', createdAt: new Date() },
      { id: 'v2', tenantId: TENANT, rateCardId: 'cost-card', rateCardEntryId: 'entry-senior',
        amount: 900, currency: 'INR', effectiveFrom: '2026-01-01', effectiveTo: null, createdAt: new Date() },
    ]);
    expect((await resolveCostRate(TENANT, 'user-1', '2025-12-31')).amount).toBe(700);
    expect((await resolveCostRate(TENANT, 'user-1', '2026-01-01')).amount).toBe(900);
  });

  it('falls back to the organization default cost card by role when no assignment covers the date (§66)', async () => {
    (getRateCards as Mock).mockImplementation(async (_t: string, f: { type?: string }) =>
      f?.type === 'COST' ? [card({ id: 'org-cost' })] : []);
    (listRateCardEntries as Mock).mockResolvedValue([entry({ rateCardId: 'org-cost' })]);
    (listRateEntryVersions as Mock).mockResolvedValue([
      { id: 'v1', tenantId: TENANT, rateCardId: 'org-cost', rateCardEntryId: 'entry-senior',
        amount: 800, currency: 'INR', effectiveFrom: '2025-01-01', effectiveTo: null, createdAt: new Date() },
    ]);
    const resolved = await resolveCostRate(TENANT, 'user-9', '2026-06-15', 'senior developer');
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.amount).toBe(800);
    expect(resolved.source).toBe('ORGANIZATION_RATE_CARD');
  });

  it('returns NOT_CONFIGURED — never a fabricated zero — when nothing applies (§96)', async () => {
    const resolved = await resolveCostRate(TENANT, 'user-1', '2026-06-15');
    expect(resolved).toEqual({ status: 'NOT_CONFIGURED' });
    expect(resolved.amount).toBeUndefined();
  });
});

describe('Module 6 — resolveBillingRate (§67/§103)', () => {
  const orgBilling = card({
    id: 'org-billing', name: 'Standard Billing', type: 'BILLING', createdAt: new Date('2026-01-01'),
  });
  const acmeBilling = card({
    id: 'acme-billing', name: 'Acme Billing', type: 'BILLING', scope: 'CLIENT', clientId: 'cl-acme',
    createdAt: new Date('2026-02-01'),
  });

  function setupCards() {
    (getRateCards as Mock).mockImplementation(async (_t: string, f: { type?: string; scope?: string; clientId?: string }) => {
      if (f?.type === 'BILLING' && f?.scope === 'CLIENT') return f.clientId === 'cl-acme' ? [acmeBilling] : [];
      if (f?.type === 'BILLING') return [orgBilling];
      return [];
    });
    (listRateCardEntries as Mock).mockImplementation(async (cardId: string) => {
      if (cardId === 'org-billing') {
        return [entry({ id: 'org-entry', rateCardId: 'org-billing', name: 'Senior Developer', amount: 2500, billable: true, billingType: 'HOURLY' })];
      }
      if (cardId === 'acme-billing') {
        return [entry({ id: 'acme-entry', rateCardId: 'acme-billing', name: 'Senior Developer', amount: 3000, billable: true, billingType: 'HOURLY' })];
      }
      return [];
    });
    (listRateEntryVersions as Mock).mockImplementation(async (_t: string, cardId: string, entryId: string) => [
      { id: `v-${cardId}`, tenantId: TENANT, rateCardId: cardId, rateCardEntryId: entryId,
        amount: cardId === 'acme-billing' ? 3000 : 2500, currency: 'INR',
        effectiveFrom: '2026-01-01', effectiveTo: null, createdAt: new Date() },
    ]);
  }

  it('the client card overrides the agency default: Acme ₹3,000 (§103)', async () => {
    setupCards();
    const resolved = await resolveBillingRate(TENANT, 'cl-acme', null, '2026-06-15', 'Senior Developer');
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.amount).toBe(3000);
    expect(resolved.source).toBe('CLIENT_RATE_CARD');
  });

  it('a client without a card resolves the agency default: ₹2,500 (§103)', async () => {
    setupCards();
    const resolved = await resolveBillingRate(TENANT, 'cl-other', null, '2026-06-15', 'Senior Developer');
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.amount).toBe(2500);
    expect(resolved.source).toBe('ORGANIZATION_RATE_CARD');
  });

  it('a client card that lacks the role falls through to the agency default', async () => {
    setupCards();
    (listRateCardEntries as Mock).mockImplementation(async (cardId: string) => {
      if (cardId === 'acme-billing') {
        // Acme prices only Designers.
        return [entry({ id: 'acme-design', rateCardId: 'acme-billing', name: 'Designer', amount: 2200, billable: true })];
      }
      if (cardId === 'org-billing') {
        return [entry({ id: 'org-entry', rateCardId: 'org-billing', name: 'Senior Developer', amount: 2500, billable: true })];
      }
      return [];
    });
    const resolved = await resolveBillingRate(TENANT, 'cl-acme', null, '2026-06-15', 'Senior Developer');
    expect(resolved.amount).toBe(2500);
    expect(resolved.source).toBe('ORGANIZATION_RATE_CARD');
  });

  it('is NOT_CONFIGURED without a role — billing prices a service, never a person (§89/§96)', async () => {
    setupCards();
    expect(await resolveBillingRate(TENANT, 'cl-acme', null, '2026-06-15', '')).toEqual({ status: 'NOT_CONFIGURED' });
  });
});

// ---------- §103/§136: the release-gate scenario ----------

describe('Module 6 — §136 release gate (Website Redesign / Acme)', () => {
  it('resolves cost ₹900/hour and billing ₹2,500/hour for the Senior Developer on 2026-09-15', async () => {
    // Cost: user's assignment pins the Senior Developer entry at ₹900.
    (getUserCostAssignments as Mock).mockResolvedValue([assignment({ effectiveFrom: '2026-01-01' })]);
    (getRateCardById as Mock).mockResolvedValue(card());
    (getRateCardEntryById as Mock).mockResolvedValue(entry({ amount: 900 }));

    // Billing: org card prices Senior Developer at ₹2,500.
    const orgBilling = card({ id: 'org-billing', type: 'BILLING', name: 'Standard Billing' });
    (getRateCards as Mock).mockImplementation(async (_t: string, f: { type?: string; scope?: string }) => {
      if (f?.type === 'BILLING' && f?.scope === 'ORGANIZATION') return [orgBilling];
      return [];
    });
    (listRateCardEntries as Mock).mockResolvedValue([
      entry({ id: 'org-entry', rateCardId: 'org-billing', amount: 2500, billable: true }),
    ]);
    // Versions dispatch by card: cost ₹900, billing ₹2,500.
    (listRateEntryVersions as Mock).mockImplementation(async (_t: string, cardId: string) => [
      { id: `v-${cardId}`, tenantId: TENANT, rateCardId: cardId, rateCardEntryId: 'entry-x',
        amount: cardId === 'org-billing' ? 2500 : 900, currency: 'INR',
        effectiveFrom: '2026-01-01', effectiveTo: null, createdAt: new Date() },
    ]);

    const cost = await resolveCostRate(TENANT, 'user-1', '2026-09-15');
    const billing = await resolveBillingRate(TENANT, 'cl-acme', 'project-website', '2026-09-15', 'Senior Developer');

    expect(cost).toMatchObject({ status: 'RESOLVED', amount: 900, currency: 'INR', source: 'USER_ASSIGNMENT', unit: 'HOUR' });
    expect(billing).toMatchObject({ status: 'RESOLVED', amount: 2500, currency: 'INR', source: 'ORGANIZATION_RATE_CARD', unit: 'HOUR' });

    // §105 — the economics the future time entry will produce:
    expect(cost.amount! * 8).toBe(7200);   // internal cost
    expect(billing.amount! * 8).toBe(20000); // client value
  });
});

// ---------- §77/§79/§93: user cost assignments ----------

describe('Module 6 — assignUserCostRate (§68/§77/§79/§93)', () => {
  const payload = { rateCardId: 'cost-card', rateCardEntryId: 'entry-senior', effectiveFrom: '2026-04-01' };

  it('rejects an overlap with a CLOSED range (§77: Jan–Jun vs Apr–Dec)', async () => {
    (getUserCostAssignments as Mock).mockResolvedValue([
      assignment({ effectiveFrom: '2026-01-01', effectiveTo: '2026-06-30' }),
    ]);
    (getRateCardById as Mock).mockResolvedValue(card());
    (getRateCardEntryById as Mock).mockResolvedValue(entry());
    const result = await assignUserCostRate(TENANT, 'user-1', payload, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
  });

  it('auto-closes an OPEN-ENDED assignment the day before the new one starts (§79)', async () => {
    (getUserCostAssignments as Mock).mockResolvedValue([
      assignment({ effectiveFrom: '2025-01-01', effectiveTo: null }),
    ]);
    (getRateCardById as Mock).mockResolvedValue(card());
    (getRateCardEntryById as Mock).mockResolvedValue(entry());
    (createUserCostAssignment as Mock).mockResolvedValue(assignment(payload));

    const result = await assignUserCostRate(TENANT, 'user-1', payload, audit);
    expect(result.ok).toBe(true);
    // Old open-ended range closed at 2026-03-31 (inclusive, the day before).
    expect(updateUserCostAssignment).toHaveBeenCalledWith('assign-1', 'user-1', TENANT, { effectiveTo: '2026-03-31' });
    expect(audit.log).toHaveBeenCalledWith('USER_COST_RATE_ASSIGNED', expect.stringContaining('from 2026-04-01'));
  });

  it('rejects replacing an open-ended assignment with an EARLIER-or-equal start', async () => {
    (getUserCostAssignments as Mock).mockResolvedValue([
      assignment({ effectiveFrom: '2026-06-01', effectiveTo: null }),
    ]);
    (getRateCardById as Mock).mockResolvedValue(card());
    (getRateCardEntryById as Mock).mockResolvedValue(entry());
    const result = await assignUserCostRate(TENANT, 'user-1', { ...payload, effectiveFrom: '2026-05-01' }, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
  });

  it('accepts adjacent ranges — no false overlap (§77)', async () => {
    (getUserCostAssignments as Mock).mockResolvedValue([
      assignment({ effectiveFrom: '2026-01-01', effectiveTo: '2026-03-31' }),
    ]);
    (getRateCardById as Mock).mockResolvedValue(card());
    (getRateCardEntryById as Mock).mockResolvedValue(entry());
    (createUserCostAssignment as Mock).mockResolvedValue(assignment(payload));
    const result = await assignUserCostRate(TENANT, 'user-1', payload, audit);
    expect(result.ok).toBe(true);
  });

  it('rejects a BILLING card (§93: only COST cards assign to users)', async () => {
    (getRateCardById as Mock).mockResolvedValue(card({ type: 'BILLING' }));
    const result = await assignUserCostRate(TENANT, 'user-1', payload, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  it('rejects an ARCHIVED card (§76: no new assignments)', async () => {
    (getRateCardById as Mock).mockResolvedValue(card({ status: 'ARCHIVED' }));
    const result = await assignUserCostRate(TENANT, 'user-1', payload, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  it('rejects a cross-tenant user (§93 — indistinguishable from missing)', async () => {
    (getUserById as Mock).mockResolvedValue({ id: 'user-b', tenantId: OTHER_TENANT });
    const result = await assignUserCostRate(TENANT, 'user-b', payload, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  it('rejects an entry that does not belong to the card (§131)', async () => {
    (getRateCardById as Mock).mockResolvedValue(card());
    (getRateCardEntryById as Mock).mockResolvedValue(null);
    const result = await assignUserCostRate(TENANT, 'user-1', payload, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });
});

// ---------- §122: entry versioning ----------

describe('Module 6 — updateRateEntry (§64/§122)', () => {
  const openVersion = {
    id: 'v1', tenantId: TENANT, rateCardId: 'cost-card', rateCardEntryId: 'entry-senior',
    amount: 700, currency: 'INR', effectiveFrom: '2025-01-01', effectiveTo: null, createdAt: new Date(),
  };

  function setup() {
    (getRateCardById as Mock).mockResolvedValue(card());
    (getRateCardEntryById as Mock).mockResolvedValue(entry({ amount: 700 }));
    (listRateEntryVersions as Mock).mockResolvedValue([openVersion]);
  }

  it('a rate change CLOSES the old version and CREATES a new one — never mutates history (§122)', async () => {
    setup();
    const result = await updateRateEntry('cost-card', 'entry-senior', TENANT,
      { amount: 900, effectiveFrom: '2026-01-01' }, audit);
    expect(result.ok).toBe(true);
    // Old closed INCLUSIVELY the day before (§79).
    expect(closeRateEntryVersion).toHaveBeenCalledWith('v1', TENANT, '2025-12-31');
    expect(createRateEntryVersion).toHaveBeenCalledWith(TENANT, 'cost-card', 'entry-senior', {
      amount: 900, currency: 'INR', effectiveFrom: '2026-01-01',
    });
  });

  it('rejects a backdated change over existing history (§122: forward in time only)', async () => {
    setup();
    const result = await updateRateEntry('cost-card', 'entry-senior', TENANT,
      { amount: 900, effectiveFrom: '2025-01-01' }, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(closeRateEntryVersion).not.toHaveBeenCalled();
  });

  it('rejects an amount change without the new effective date', async () => {
    setup();
    const result = await updateRateEntry('cost-card', 'entry-senior', TENANT, { amount: 900 }, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  it('an idempotent same-amount PATCH is an honest 200 with no version churn', async () => {
    setup();
    const result = await updateRateEntry('cost-card', 'entry-senior', TENANT, { amount: 700 }, audit);
    expect(result.ok).toBe(true);
    expect(closeRateEntryVersion).not.toHaveBeenCalled();
    expect(createRateEntryVersion).not.toHaveBeenCalled();
  });

  it('a metadata-only PATCH (rename) does not touch versions', async () => {
    setup();
    const result = await updateRateEntry('cost-card', 'entry-senior', TENANT, { name: 'Lead Developer' }, audit);
    expect(result.ok).toBe(true);
    expect(closeRateEntryVersion).not.toHaveBeenCalled();
    expect(createRateEntryVersion).not.toHaveBeenCalled();
  });
});

// ---------- §73/§75/§76/§91: cards and entries ----------

describe('Module 6 — card & entry guards (§73/§75/§76/§91)', () => {
  it('createRateEntry forces HOUR-only on cost cards (§73)', async () => {
    (getRateCardById as Mock).mockResolvedValue(card());
    const result = await createRateEntry('cost-card', TENANT,
      { name: 'Senior Developer', unit: 'DAY', amount: 7200, effectiveFrom: '2026-01-01' }, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  it('createRateEntry rejects an archived card (§76)', async () => {
    (getRateCardById as Mock).mockResolvedValue(card({ status: 'ARCHIVED' }));
    const result = await createRateEntry('cost-card', TENANT,
      { name: 'Senior Developer', amount: 900, effectiveFrom: '2026-01-01' }, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  it('createRateCard demands a real same-tenant client for CLIENT scope (§91/§113)', async () => {
    (getClientById as Mock).mockResolvedValue(null);
    const result = await createRateCard(TENANT,
      { name: 'Acme Billing', type: 'BILLING', scope: 'CLIENT', clientId: 'cl-x', currency: 'INR' }, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  it('updateRateCard rejects type immutability violations', async () => {
    (getRateCardById as Mock).mockResolvedValue(card());
    const result = await updateRateCard('cost-card', TENANT, { type: 'BILLING' }, audit);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  it('archiveRateCard is a one-way ACTIVE → ARCHIVED (§75); re-archive is a 400', async () => {
    (getRateCardById as Mock).mockResolvedValue(card());
    const first = await archiveRateCard('cost-card', TENANT, audit);
    expect(first.ok).toBe(true);
    expect(audit.log).toHaveBeenCalledWith('RATE_CARD_ARCHIVED', expect.any(String));

    (getRateCardById as Mock).mockResolvedValue(card({ status: 'ARCHIVED' }));
    const second = await archiveRateCard('cost-card', TENANT, audit);
    expect(second.ok).toBe(false);
    expect(second.status).toBe(400);
  });
});
