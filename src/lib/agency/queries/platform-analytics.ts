/**
 * Agency Vertical — Queries: PLATFORM analytics (post-Phase-1 super-admin surface)
 *
 * Cross-tenant agency analytics for the Platform Console (super-admin).
 *
 * PLATFORM SCOPE EXCEPTION (deliberate, documented): every other query in
 * this directory starts its $match with the session tenantId (conventions
 * rule 3). This module intentionally does NOT — its job is to aggregate the
 * agency stores GROUPED BY tenantId across the whole platform. The exception
 * is safe because the module is reachable ONLY through the super-admin API
 * routes, which gate on role === 'SUPER_ADMIN' before calling in. It is
 * never imported by a tenant-session path.
 *
 * Everything else follows queries/conventions.ts:
 *   - aggregation in the database ($group), never find-then-sum
 *   - $project-minimal (group keys and sums only)
 *   - local-JSON fallback with IDENTICAL semantics
 *   - money is currency-grouped; a tenant mixing currencies gets null money
 *     (never converted, never faked — the receivables-summary rule)
 *   - no caching until telemetry demands it
 *
 * Metric ownership (single owner per number, Module 1.19 pattern):
 *   clients          count of tenant clients (all statuses — a prospect is
 *                    still an agency relationship)
 *   projects         total + ACTIVE counts (planned/completed work)
 *   hours            all-time logged + billable minutes, and the last-30-day
 *                    window (activity signal). The 30-day cutoff is a UTC
 *                    business date — platform scope has no single tenant
 *                    timezone to anchor to; the drift vs a tenant's own
 *                    agency-today window is at most a day and is documented
 *                    here rather than hidden.
 *   rateSetup        any rate card exists (§80 activation step "configure
 *                    rates")
 *   invoiced         Σ total.amount over ISSUED invoices (§2 statuses)
 *   collected        Σ CONFIRMED payment amounts − Σ REVERSED (§3/§104: a
 *                    reversed payment nets zero)
 *   outstanding      Σ amountDue.amount over OPEN invoices (§9 statuses)
 */
import { connectDb, initLocalDb } from '@/lib/db';
import type { Invoice, InvoiceStatus } from '../types/invoice';
import type { Payment } from '../types/payment';
import type { Project } from '../types/project';

/** §79/§2 — issued invoices carry a number; DRAFT does not, VOID is retired. */
const ISSUED_STATUSES: readonly InvoiceStatus[] = ['SENT', 'PARTIALLY_PAID', 'OVERDUE', 'PAID'];
/** §9 — the receivable statuses. */
const OPEN_STATUSES: readonly InvoiceStatus[] = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'];

/** One currency-grouped money result: a single real total, or null on mix. */
export interface GroupedMoney {
  total: number | null;
  currency: string | null;
  /** Real per-currency sums — always populated even when `total` is null. */
  byCurrency: Record<string, number>;
}

/** The same fold rule as receivables-summary.sumGrouped, kept per-currency
 *  map form: exactly one currency carrying value → that total; more → null. */
export function foldGroupedMoney(byCurrency: Record<string, number>): GroupedMoney {
  const withAmount = Object.entries(byCurrency).filter(([, v]) => v > 0);
  if (withAmount.length === 0) return { total: 0, currency: null, byCurrency };
  if (withAmount.length === 1) {
    return { total: withAmount[0][1], currency: withAmount[0][0], byCurrency };
  }
  return { total: null, currency: null, byCurrency };
}

/** One tenant's platform-analytics row (tenant identity is joined by the caller). */
export interface PlatformTenantAgencyRow {
  tenantId: string;
  clients: number;
  totalProjects: number;
  activeProjects: number;
  /** All-time logged hours. */
  hoursLogged: number;
  /** All-time billable hours. */
  billableHours: number;
  /** Hours logged in the trailing 30 days (UTC cutoff — see header). */
  hours30d: number;
  hasRateSetup: boolean;
  hasTimeEntries: boolean;
  hasIssuedInvoices: boolean;
  invoiced: GroupedMoney;
  collected: GroupedMoney;
  outstanding: GroupedMoney;
}

/** UTC business date (YYYY-MM-DD) `days` before today — the 30d window cutoff. */
export function utcCutoff(days: number, now: Date = new Date()): string {
  const d = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/** Accumulator the per-store passes merge into (one row per tenantId). */
type RowAcc = Omit<PlatformTenantAgencyRow, 'invoiced' | 'collected' | 'outstanding'> & {
  invoicedBy: Map<string, number>;
  collectedBy: Map<string, number>;
  outstandingBy: Map<string, number>;
};

function blankRow(tenantId: string): RowAcc {
  return {
    tenantId,
    clients: 0,
    totalProjects: 0,
    activeProjects: 0,
    hoursLogged: 0,
    billableHours: 0,
    hours30d: 0,
    hasRateSetup: false,
    hasTimeEntries: false,
    hasIssuedInvoices: false,
    invoicedBy: new Map(),
    collectedBy: new Map(),
    outstandingBy: new Map(),
  };
}

function toRow(acc: RowAcc): PlatformTenantAgencyRow {
  const toMap = (m: Map<string, number>) => Object.fromEntries(m);
  return {
    tenantId: acc.tenantId,
    clients: acc.clients,
    totalProjects: acc.totalProjects,
    activeProjects: acc.activeProjects,
    hoursLogged: acc.hoursLogged,
    billableHours: acc.billableHours,
    hours30d: acc.hours30d,
    hasRateSetup: acc.hasRateSetup,
    hasTimeEntries: acc.hasTimeEntries,
    hasIssuedInvoices: acc.hasIssuedInvoices,
    invoiced: foldGroupedMoney(toMap(acc.invoicedBy)),
    collected: foldGroupedMoney(toMap(acc.collectedBy)),
    outstanding: foldGroupedMoney(toMap(acc.outstandingBy)),
  };
}

/** Merge one money observation into a currency map. Zero is a no-op; NEGATIVE
 *  amounts are real (§104 — a reversal subtracts its earlier confirmation)
 *  and must land in the map, never be dropped. */
function mergeMoney(map: Map<string, number>, currency: string | undefined, amount: number | undefined) {
  if (!currency || !amount) return;
  map.set(currency, (map.get(currency) ?? 0) + amount);
}

/**
 * The platform pass: one row per tenantId that appears in ANY agency-relevant
 * store. Tenants with no agency activity at all are simply absent — the
 * caller joins tenant identity and treats absence as zero adoption.
 */
export async function getPlatformAgencyRows(now: Date = new Date()): Promise<PlatformTenantAgencyRow[]> {
  const cutoff = utcCutoff(30, now);
  const rows = new Map<string, RowAcc>();
  const row = (tenantId: string): RowAcc => {
    let r = rows.get(tenantId);
    if (!r) { r = blankRow(tenantId); rows.set(tenantId, r); }
    return r;
  };

  const { db } = await connectDb();
  if (db) {
    try {
      // Each pipeline is a full-collection $group by tenantId — the platform
      // scope (see header). Group keys + sums only ($project-minimal). Money
      // pipelines group by tenantId + currency so a multi-currency tenant
      // folds to null in JS rather than silently converting.
      const [clientRows, projectRows, timeRows, rateRows, invoiceRows, paymentRows] = await Promise.all([
        db.collection('clients').aggregate([
          { $group: { _id: '$tenantId', count: { $sum: 1 } } },
        ]).toArray() as unknown as Promise<Array<{ _id: string; count: number }>>,
        db.collection('projects').aggregate([
          {
            $group: {
              _id: '$tenantId',
              total: { $sum: 1 },
              active: { $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] } },
            },
          },
        ]).toArray() as unknown as Promise<Array<{ _id: string; total: number; active: number }>>,
        db.collection('time_entries').aggregate([
          {
            $group: {
              _id: '$tenantId',
              minutes: { $sum: '$durationMinutes' },
              billableMinutes: { $sum: { $cond: [{ $eq: ['$billable', true] }, '$durationMinutes', 0] } },
              recentMinutes: { $sum: { $cond: [{ $gte: ['$date', cutoff] }, '$durationMinutes', 0] } },
            },
          },
        ]).toArray() as unknown as Promise<Array<{
          _id: string; minutes: number; billableMinutes: number; recentMinutes: number;
        }>>,
        db.collection('rate_cards').aggregate([
          { $group: { _id: '$tenantId', count: { $sum: 1 } } },
        ]).toArray() as unknown as Promise<Array<{ _id: string; count: number }>>,
        db.collection('invoices').aggregate([
          {
            $group: {
              _id: { tenantId: '$tenantId', currency: '$total.currency' },
              issued: { $sum: { $cond: [{ $in: ['$status', ISSUED_STATUSES] }, '$total.amount', 0] } },
              outstanding: { $sum: { $cond: [{ $in: ['$status', OPEN_STATUSES] }, '$amountDue.amount', 0] } },
            },
          },
        ]).toArray() as unknown as Promise<Array<{
          _id: { tenantId: string; currency?: string }; issued: number; outstanding: number;
        }>>,
        db.collection('payments').aggregate([
          {
            $group: {
              _id: { tenantId: '$tenantId', currency: '$amount.currency' },
              confirmed: { $sum: { $cond: [{ $eq: ['$status', 'CONFIRMED'] }, '$amount.amount', 0] } },
              reversed: { $sum: { $cond: [{ $eq: ['$status', 'REVERSED'] }, '$amount.amount', 0] } },
            },
          },
        ]).toArray() as unknown as Promise<Array<{
          _id: { tenantId: string; currency?: string }; confirmed: number; reversed: number;
        }>>,
      ]);

      for (const r of clientRows) row(r._id).clients = r.count;
      for (const r of projectRows) {
        const acc = row(r._id);
        acc.totalProjects = r.total;
        acc.activeProjects = r.active;
      }
      for (const r of timeRows) {
        const acc = row(r._id);
        acc.hoursLogged = r.minutes / 60;
        acc.billableHours = r.billableMinutes / 60;
        acc.hours30d = r.recentMinutes / 60;
        acc.hasTimeEntries = r.minutes > 0;
      }
      for (const r of rateRows) row(r._id).hasRateSetup = r.count > 0;
      for (const r of invoiceRows) {
        const acc = row(r._id.tenantId);
        mergeMoney(acc.invoicedBy, r._id.currency, r.issued);
        mergeMoney(acc.outstandingBy, r._id.currency, r.outstanding);
        acc.hasIssuedInvoices = acc.invoicedBy.size > 0;
      }
      for (const r of paymentRows) {
        // §104 — a reversed payment nets zero: +amount when confirmed,
        // −amount when reversed. Never delete the operational record.
        const net = r.confirmed - r.reversed;
        mergeMoney(row(r._id.tenantId).collectedBy, r._id.currency, net);
      }
      return [...rows.values()].map(toRow);
    } catch {
      // fall through to the local store
    }
  }

  // ---- Local JSON fallback: IDENTICAL semantics over the local store ----
  const data = initLocalDb();
  for (const c of data.clients) row(c.tenantId).clients += 1;
  for (const p of (data.projects as Project[])) {
    const acc = row(p.tenantId);
    acc.totalProjects += 1;
    if (p.status === 'ACTIVE') acc.activeProjects += 1;
  }
  for (const t of data.timeEntries) {
    const acc = row(t.tenantId);
    acc.hoursLogged += t.durationMinutes / 60;
    if (t.billable) acc.billableHours += t.durationMinutes / 60;
    if (t.date >= cutoff) acc.hours30d += t.durationMinutes / 60;
    acc.hasTimeEntries = acc.hoursLogged > 0;
  }
  for (const rc of data.rateCards) row(rc.tenantId).hasRateSetup = true;
  for (const i of (data.invoices as Invoice[])) {
    const acc = row(i.tenantId);
    if ((ISSUED_STATUSES as readonly string[]).includes(i.status)) {
      mergeMoney(acc.invoicedBy, i.total?.currency, i.total?.amount);
      acc.hasIssuedInvoices = true;
    }
    if ((OPEN_STATUSES as readonly string[]).includes(i.status)) {
      mergeMoney(acc.outstandingBy, i.amountDue?.currency, i.amountDue?.amount);
    }
  }
  for (const p of (data.payments as Payment[])) {
    if (p.status === 'CONFIRMED') mergeMoney(row(p.tenantId).collectedBy, p.amount?.currency, p.amount?.amount);
    if (p.status === 'REVERSED') mergeMoney(row(p.tenantId).collectedBy, p.amount?.currency, -(p.amount?.amount ?? 0));
  }
  return [...rows.values()].map(toRow);
}
