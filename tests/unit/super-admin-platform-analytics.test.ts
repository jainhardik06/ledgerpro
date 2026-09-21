/**
 * Post-Phase-1 super-admin surface — platform analytics.
 *
 * Pins the pure summarizer (adoption / §80 activation funnel / volume /
 * per-tenant rows — no database involved) and the query's local-JSON
 * fallback semantics (counts, hours windows, issued vs open invoice money,
 * confirmed − reversed payments, currency folding).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  connectDb: vi.fn(),
  initLocalDb: vi.fn(),
}));

import { connectDb, initLocalDb } from '@/lib/db';
import {
  foldGroupedMoney, getPlatformAgencyRows, utcCutoff,
  type PlatformTenantAgencyRow,
} from '@/lib/agency/queries/platform-analytics';
import { summarizePlatformAgency, type PlatformTenantIdentity } from '@/lib/agency/analytics/platform-summary';

// ---------- pure helpers ----------

describe('foldGroupedMoney (never convert, never fake)', () => {
  it('returns 0 with no currency when nothing carries value', () => {
    expect(foldGroupedMoney({})).toEqual({ total: 0, currency: null, byCurrency: {} });
    expect(foldGroupedMoney({ INR: 0 })).toEqual({ total: 0, currency: null, byCurrency: { INR: 0 } });
  });

  it('returns the single-currency total', () => {
    expect(foldGroupedMoney({ INR: 150 })).toEqual({ total: 150, currency: 'INR', byCurrency: { INR: 150 } });
  });

  it('folds to null when currencies mix — byCurrency stays real', () => {
    const r = foldGroupedMoney({ INR: 150, USD: 10 });
    expect(r.total).toBeNull();
    expect(r.currency).toBeNull();
    expect(r.byCurrency).toEqual({ INR: 150, USD: 10 });
  });
});

describe('utcCutoff', () => {
  it('is the UTC business date N days back', () => {
    const now = new Date('2026-09-15T12:00:00Z');
    expect(utcCutoff(30, now)).toBe('2026-08-16');
  });
});

// ---------- summarizePlatformAgency (pure) ----------

function row(tenantId: string, over: Partial<PlatformTenantAgencyRow> = {}): PlatformTenantAgencyRow {
  return {
    tenantId,
    clients: 1,
    totalProjects: 2,
    activeProjects: 1,
    hoursLogged: 10,
    billableHours: 6,
    hours30d: 4,
    hasRateSetup: true,
    hasTimeEntries: true,
    hasIssuedInvoices: true,
    invoiced: { total: 100, currency: 'INR', byCurrency: { INR: 100 } },
    collected: { total: 60, currency: 'INR', byCurrency: { INR: 60 } },
    outstanding: { total: 40, currency: 'INR', byCurrency: { INR: 40 } },
    ...over,
  };
}

const TENANTS: PlatformTenantIdentity[] = [
  { id: 't-agency-full', name: 'Full Agency', appMode: 'Agency', status: 'ACTIVE', plan: 'ENTERPRISE' },
  { id: 't-agency-fresh', name: 'Fresh Agency', appMode: 'Agency', status: 'ACTIVE', plan: 'FREE' },
  { id: 't-agency-suspended', name: 'Suspended Agency', appMode: 'Agency', status: 'SUSPENDED', plan: 'STARTER' },
  { id: 't-standard', name: 'Standard Co', appMode: 'Standard', status: 'ACTIVE', plan: 'FREE' },
];

describe('summarizePlatformAgency', () => {
  it('counts adoption over ACTIVE tenants only — suspended excluded from the share', () => {
    const s = summarizePlatformAgency([], TENANTS);
    expect(s.adoption.agencyTenants).toBe(2);          // full + fresh; suspended excluded
    expect(s.adoption.activeTenants).toBe(3);          // agency-full, agency-fresh, standard
    expect(s.adoption.agencySharePercent).toBeCloseTo((2 / 3) * 100, 5);
  });

  it('renders an honest all-zero row for a fresh agency tenant with no activity', () => {
    const s = summarizePlatformAgency([], TENANTS);
    const fresh = s.tenants.find(t => t.tenantId === 't-agency-fresh');
    expect(fresh).toBeDefined();
    expect(fresh!.clients).toBe(0);
    expect(fresh!.invoiced.total).toBe(0);
    expect(fresh!.activeProjects).toBe(0);
  });

  it('counts the §80 funnel over ACTIVE agency tenants only', () => {
    const rows = [
      row('t-agency-full'),                                                     // everything
      row('t-agency-suspended', { clients: 0, totalProjects: 0, hasRateSetup: false, hasTimeEntries: false, hasIssuedInvoices: false }),
      // t-agency-fresh deliberately has NO row — it activated but did nothing.
    ];
    const s = summarizePlatformAgency(rows, TENANTS);
    expect(s.activation.withClients).toBe(1);
    expect(s.activation.withProjects).toBe(1);
    expect(s.activation.withRates).toBe(1);
    expect(s.activation.withTime).toBe(1);
    expect(s.activation.withInvoices).toBe(1);
  });

  it('sums volume across tenants per currency — null total on platform currency mix', () => {
    const rows = [
      row('t-agency-full'),
      row('t-standard', {
        invoiced: { total: 10, currency: 'USD', byCurrency: { USD: 10 } },
        collected: { total: 5, currency: 'USD', byCurrency: { USD: 5 } },
        outstanding: { total: 5, currency: 'USD', byCurrency: { USD: 5 } },
      }),
    ];
    const s = summarizePlatformAgency(rows, TENANTS);
    expect(s.volume.invoiced.total).toBeNull();           // INR + USD across tenants
    expect(s.volume.invoiced.byCurrency).toEqual({ INR: 100, USD: 10 }); // per-currency stays real
    expect(s.volume.activeProjects).toBe(2);
  });

  it('sorts agency tenants first, most invoiced value at the top', () => {
    const rows = [
      row('t-standard', { invoiced: { total: 999, currency: 'USD', byCurrency: { USD: 999 } } }),
      row('t-agency-suspended', { invoiced: { total: 500, currency: 'INR', byCurrency: { INR: 500 } } }),
      row('t-agency-full', { invoiced: { total: 100, currency: 'INR', byCurrency: { INR: 100 } } }),
    ];
    const s = summarizePlatformAgency(rows, TENANTS, 10);
    expect(s.tenants[0].tenantId).toBe('t-agency-suspended'); // agency + most invoiced
    expect(s.tenants[1].tenantId).toBe('t-agency-full');      // agency + less invoiced
    expect(s.tenants[2].tenantId).toBe('t-agency-fresh');     // zero-adoption agency still visible
    expect(s.tenants[3].tenantId).toBe('t-standard');         // activity-only tenant last
  });

  it('caps the tenant table without touching the volume sums', () => {
    const rows = [row('t-agency-full')];
    const s = summarizePlatformAgency(rows, TENANTS, 1);
    expect(s.tenants).toHaveLength(1);
    expect(s.volume.activeProjects).toBe(1);
  });
});

// ---------- getPlatformAgencyRows — local-JSON fallback semantics ----------

describe('getPlatformAgencyRows (local fallback)', () => {
  beforeEach(() => {
    (connectDb as unknown as Mock).mockReset().mockResolvedValue({ client: null, db: null });
    (initLocalDb as unknown as Mock).mockReset().mockReturnValue({
      clients: [
        { tenantId: 't1', status: 'ACTIVE' },
        { tenantId: 't1', status: 'ARCHIVED' },   // a prospect/archive is still a client row
        { tenantId: 't2' },
      ],
      projects: [
        { tenantId: 't1', status: 'ACTIVE' },
        { tenantId: 't1', status: 'DRAFT' },
        { tenantId: 't1', status: 'COMPLETED' },
        { tenantId: 't2', status: 'ON_HOLD' },
      ],
      timeEntries: [
        { tenantId: 't1', date: '2026-09-10', durationMinutes: 120, billable: true },
        { tenantId: 't1', date: '2020-01-01', durationMinutes: 60, billable: false }, // outside 30d
        { tenantId: 't2', date: '2026-09-12', durationMinutes: 30, billable: true },
      ],
      rateCards: [{ tenantId: 't1' }],
      invoices: [
        { tenantId: 't1', status: 'SENT', total: { amount: 1000, currency: 'INR' }, amountDue: { amount: 1000, currency: 'INR' } },
        { tenantId: 't1', status: 'DRAFT', total: { amount: 500, currency: 'INR' }, amountDue: { amount: 500, currency: 'INR' } },   // §74 — drafts carry no number
        { tenantId: 't1', status: 'VOID', total: { amount: 700, currency: 'INR' }, amountDue: { amount: 0, currency: 'INR' } },      // retired
        { tenantId: 't1', status: 'PAID', total: { amount: 300, currency: 'INR' }, amountDue: { amount: 0, currency: 'INR' } },      // issued, nothing outstanding
        { tenantId: 't2', status: 'OVERDUE', total: { amount: 200, currency: 'USD' }, amountDue: { amount: 150, currency: 'USD' } },
      ],
      payments: [
        { tenantId: 't1', status: 'CONFIRMED', amount: { amount: 800, currency: 'INR' } },
        { tenantId: 't1', status: 'REVERSED', amount: { amount: 300, currency: 'INR' } },   // §104 — nets zero
        { tenantId: 't1', status: 'PENDING', amount: { amount: 100, currency: 'INR' } },   // never settled
      ],
    });
  });

  it('aggregates per-tenant counts, hours, money with the vertical\'s status rules', async () => {
    const rows = await getPlatformAgencyRows(new Date('2026-09-15T00:00:00Z'));
    const byId = new Map(rows.map(r => [r.tenantId, r]));
    const t1 = byId.get('t1')!;

    expect(t1.clients).toBe(2);
    expect(t1.totalProjects).toBe(3);
    expect(t1.activeProjects).toBe(1);
    expect(t1.hasRateSetup).toBe(true);
    // 120 in-window + 60 outside
    expect(t1.hours30d).toBe(2);
    expect(t1.hoursLogged).toBe(3);
    expect(t1.billableHours).toBe(2);
    // issued = SENT 1000 + PAID 300; draft and void never count
    expect(t1.invoiced).toEqual({ total: 1300, currency: 'INR', byCurrency: { INR: 1300 } });
    // open = SENT only (PAID carries no balance)
    expect(t1.outstanding.total).toBe(1000);
    // collected = confirmed 800 − reversed 300; PENDING never settled
    expect(t1.collected.total).toBe(500);
    expect(t1.hasIssuedInvoices).toBe(true);

    const t2 = byId.get('t2')!;
    expect(t2.hours30d).toBe(0.5);
    expect(t2.outstanding.total).toBe(150);
    expect(t2.hasRateSetup).toBe(false);
  });

  it('folds a tenant mixing invoice currencies to null money with real byCurrency', async () => {
    (initLocalDb as unknown as Mock).mockReturnValue({
      clients: [], projects: [], timeEntries: [], rateCards: [], payments: [],
      invoices: [
        { tenantId: 't1', status: 'SENT', total: { amount: 1000, currency: 'INR' }, amountDue: { amount: 1000, currency: 'INR' } },
        { tenantId: 't1', status: 'SENT', total: { amount: 20, currency: 'USD' }, amountDue: { amount: 20, currency: 'USD' } },
      ],
    });
    const rows = await getPlatformAgencyRows(new Date('2026-09-15T00:00:00Z'));
    const t1 = rows.find(r => r.tenantId === 't1')!;
    expect(t1.invoiced.total).toBeNull();
    expect(t1.invoiced.byCurrency).toEqual({ INR: 1000, USD: 20 });
  });

  it('produces no row for a tenant absent from every store', async () => {
    const rows = await getPlatformAgencyRows(new Date('2026-09-15T00:00:00Z'));
    expect(rows.find(r => r.tenantId === 't-nothing')).toBeUndefined();
  });
});
