/**
 * Agency Vertical — Query: receivables + invoice-money summary (Module 10, §105/§106, §117/§119;
 * Module 14 §85–§106 — the A/R operating view)
 *
 * Wires the Module 9/10 invoice + payment + milestone stores into the
 * dashboard contract (definitions §2/§3/§9, spec §105/§106). Follows
 * queries/conventions.ts: tenant-scoped $match first, $project-minimal,
 * registered compound indexes where they exist, local-JSON fallback with
 * the SAME semantics.
 *
 * Module 14 (§96/§98/§99/§102): the SAME filtered pass now also produces
 * the A/R list rows (stored facts + DERIVED age/aging/risk/display — never
 * stored, so never stale) and the per-project breakdown (§95). Summary,
 * buckets, byClient, byProject and rows read ONE fact set — no surface can
 * disagree with another.
 *
 * Metrics owned here (single owner per number — Module 1.19):
 *
 *   §9   Outstanding — Σ amountDue over OPEN invoices (SENT /
 *        PARTIALLY_PAID / OVERDUE; drafts carry no number §74, VOID is
 *        retired, PAID has nothing outstanding).
 *   §105 DueSoon — Σ amountDue over open invoices whose dueDate falls
 *        inside [today, today + 7 days] (the definitions §9 window).
 *   §105 Overdue — Σ amountDue + count over open invoices past their
 *        dueDate as of `today`.
 *   §105 Aging — outstanding money bucketed by days past due over the
 *        REMAINING balance (amountDue), never the invoice total: CURRENT
 *        (not yet due), 1-30, 31-60, 61-90, 90+ (types/dates.ts).
 *   §106 Client receivables — the same outstanding/overdue money grouped
 *        per client.
 *   §2   InvoicedRevenue — Σ total over ISSUED invoices (SENT /
 *        PARTIALLY_PAID / OVERDUE / PAID; DRAFT unnumbered, VOID retired).
 *   §3   CollectedRevenue — Σ amount over currently-CONFIRMED payments.
 *        Equals the tenant-wide §104 settled money: a REVERSED payment
 *        nets zero (it was +amount when confirmed, −amount when reversed).
 *   §119 UnbilledMilestones — Σ commercial value over COMPLETED + UNBILLED
 *        milestones (the §62 invoice-eligible set; RESERVED ones are held
 *        by a draft, mirroring the time query). Amount milestones count
 *        their amount; percentage milestones value at percentage ×
 *        project.contractValue (§73) — a percentage milestone on a project
 *        without a contract value is NOT fabricatable and is skipped.
 *
 * Mixed currencies: money sums are grouped per currency; when more than one
 * currency carries amounts the total is NULL (money.ts rule — never
 * convert, never fake one number). Counts stay real (currency-free). The
 * dashboard then leaves the affected metrics pending; the receivables
 * endpoint reports the nulls explicitly with mixedCurrencies: true.
 */
import { connectDb, initLocalDb } from '@/lib/db';
import type { Invoice, InvoiceStatus } from '../types/invoice';
import { displayStatusFor } from '../types/invoice';
import type { ProjectMilestone } from '../types/project';
import type { Project } from '../types/project';
import {
  addDays, agingBucket, collectionRisk, daysOverdue,
  type AgingBucket,
} from '../types/dates';

/** §79 — the receivable statuses: issued, not retired, money possibly owed. */
const OPEN_STATUSES: readonly InvoiceStatus[] = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'];
/** Issued invoices — §2 counts every one that ever carried a number (VOID is retired). */
const ISSUED_STATUSES: readonly InvoiceStatus[] = ['SENT', 'PARTIALLY_PAID', 'OVERDUE', 'PAID'];

/** §9 "Due Soon" window (days, inclusive). */
export const DUE_SOON_WINDOW_DAYS = 7;

/** One currency-grouped sum: a single real total, or null when mixed. */
function sumGrouped(map: Map<string, number>): { total: number | null; currency: string | null } {
  const withAmount = [...map.entries()].filter(([, v]) => v > 0);
  if (withAmount.length === 0) return { total: 0, currency: null };
  if (withAmount.length > 1) return { total: null, currency: null };
  return { total: withAmount[0][1], currency: withAmount[0][0] };
}

/** Per-currency bucket totals (all real numbers — the null-on-mixed fold happens once, at the end). */
type BucketTotals = Record<AgingBucket, number>;

// The view contract (rows, filters, metrics shape) lives in the CLIENT-SAFE
// types file so React can import the shapes without dragging the db layer;
// re-exported here for the existing server-side import sites.
export type {
  AgingBuckets, ClientReceivablesRow, ProjectReceivablesRow, ReceivableInvoiceRow,
  ReceivablesFilters, ReceivablesMetrics,
} from '../types/receivables';
import type {
  AgingBuckets, ClientReceivablesRow, ProjectReceivablesRow, ReceivableInvoiceRow,
  ReceivablesFilters, ReceivablesMetrics,
} from '../types/receivables';

/** The minimal invoice shape this query needs (§113 — the rest never loads). */
interface OpenInvoiceSlice {
  id: string;
  invoiceNumber: string | null;
  projectId: string | null;
  clientId: string;
  dueDate: string;
  status: InvoiceStatus;
  total: { amount: number; currency: string };
  amountPaid: { amount: number; currency: string };
  amountDue: { amount: number; currency: string };
}

/**
 * §99 — a display-status filter maps to the STORED statuses that can produce
 * it: anything open can display OVERDUE (§80 derivation), while SENT and
 * PARTIALLY_PAID only ever display as themselves. Keeps the index doing the
 * narrowing while the derivation stays the single source of truth.
 */
function storedStatusesFor(display: InvoiceStatus): readonly InvoiceStatus[] {
  return display === 'OVERDUE' ? OPEN_STATUSES : [display];
}

async function loadOpenInvoices(tenantId: string, filters?: ReceivablesFilters): Promise<OpenInvoiceSlice[]> {
  const match: Record<string, unknown> = {
    tenantId,
    status: { $in: filters?.status ? [...storedStatusesFor(filters.status)] : [...OPEN_STATUSES] },
  };
  if (filters?.clientId) match.clientId = filters.clientId;
  if (filters?.projectId) match.projectId = filters.projectId;
  const mapRow = (r: Record<string, unknown>): OpenInvoiceSlice => ({
    id: (r.id ?? r._id?.toString()) as string,
    invoiceNumber: (r.invoiceNumber as string | undefined) ?? null,
    projectId: (r.projectId as string | undefined) ?? null,
    clientId: r.clientId as string,
    dueDate: r.dueDate as string,
    status: r.status as InvoiceStatus,
    total: {
      amount: (r.total as { amount?: number } | undefined)?.amount ?? 0,
      currency: (r.total as { currency?: string } | undefined)?.currency ?? 'INR',
    },
    amountPaid: {
      amount: (r.amountPaid as { amount?: number } | undefined)?.amount ?? 0,
      currency: (r.amountPaid as { currency?: string } | undefined)?.currency ?? 'INR',
    },
    amountDue: {
      amount: (r.amountDue as { amount?: number } | undefined)?.amount ?? 0,
      currency: (r.amountDue as { currency?: string } | undefined)?.currency ?? 'INR',
    },
  });

  const { db } = await connectDb();
  if (db) {
    try {
      const rows = await db.collection('invoices')
        .find(match, {
          projection: {
            invoiceNumber: 1, projectId: 1, clientId: 1, dueDate: 1, status: 1,
            'total.amount': 1, 'total.currency': 1,
            'amountPaid.amount': 1, 'amountPaid.currency': 1,
            'amountDue.amount': 1, 'amountDue.currency': 1,
          },
        })
        .toArray() as unknown as Array<Record<string, unknown>>;
      return rows.map(mapRow);
    } catch {
      // fall through to the local store
    }
  }
  const data = initLocalDb();
  return data.invoices
    .filter(i => i.tenantId === tenantId
      && ((match.status as { $in: readonly string[] }).$in.includes(i.status))
      && (!filters?.clientId || i.clientId === filters.clientId)
      && (!filters?.projectId || i.projectId === filters.projectId))
    .map(i => ({
      id: i.id!,
      invoiceNumber: i.invoiceNumber ?? null,
      projectId: i.projectId ?? null,
      clientId: i.clientId,
      dueDate: i.dueDate,
      status: i.status,
      total: { amount: i.total?.amount ?? 0, currency: i.total?.currency ?? 'INR' },
      amountPaid: { amount: i.amountPaid?.amount ?? 0, currency: i.amountPaid?.currency ?? 'INR' },
      amountDue: { amount: i.amountDue?.amount ?? 0, currency: i.amountDue?.currency ?? 'INR' },
    }));
}

/** Local-store twin of loadOpenInvoices for issued (§2) sums. */
function localIssuedInvoices(tenantId: string): Invoice[] {
  const data = initLocalDb();
  return data.invoices
    .filter(i => i.tenantId === tenantId && (ISSUED_STATUSES as readonly string[]).includes(i.status));
}

/**
 * §9/§105/§106 — the full receivables position as of `today` (business
 * date, resolved in the TENANT's timezone by the caller — Module 1.16).
 *
 * Module 14: `filters` (§98) narrow the SAME pass — summary, buckets,
 * byClient, byProject and the A/R list rows all read one filtered fact set,
 * so no surface can disagree with another (the Module 13 one-engine rule).
 */
export async function getReceivablesMetrics(
  tenantId: string,
  today: string,
  dueSoonDays: number = DUE_SOON_WINDOW_DAYS,
  filters?: ReceivablesFilters
): Promise<ReceivablesMetrics> {
  const open = await loadOpenInvoices(tenantId, filters);
  const dueSoonLimit = addDays(today, dueSoonDays);

  // Only invoices still owed money drive the buckets (§105 — the aging is
  // over the REMAINING balance; a zero-balance open invoice adds nothing
  // anywhere and is not a receivable §86/§92).
  const owed = open.filter(i => i.amountDue.amount > 0);

  const totalsByCurrency = new Map<string, number>();
  const dueSoonByCurrency = new Map<string, number>();
  const overdueByCurrency = new Map<string, number>();
  const bucketByCurrency = new Map<string, BucketTotals>();
  const clientRows = new Map<string, {
    invoiceCount: number;
    byCurrency: Map<string, { outstanding: number; overdue: number }>;
  }>();
  const projectRows = new Map<string | null, {
    invoiceCount: number;
    byCurrency: Map<string, { outstanding: number; overdue: number }>;
  }>();
  const invoiceRows: ReceivableInvoiceRow[] = [];

  const add = (map: Map<string, number>, currency: string, amount: number) =>
    map.set(currency, (map.get(currency) ?? 0) + amount);

  let overdueCount = 0;
  for (const invoice of owed) {
    const { amount, currency } = invoice.amountDue;
    const daysPastDue = daysOverdue(invoice.dueDate, today);
    const bucket = agingBucket(daysPastDue);
    // §80/§91 — the OPERATIONAL status (displayStatusFor is the one derivation).
    const display = displayStatusFor(
      { status: invoice.status, dueDate: invoice.dueDate, amountDue: invoice.amountDue },
      today
    );

    // Derived filters (§102 — age/bucket/window/currency are "today"-math,
    // applied here in the query layer, never stored).
    if (filters?.status && display !== filters.status) continue;
    if (filters?.agingBucket && bucket !== filters.agingBucket) continue;
    if (filters?.from && invoice.dueDate < filters.from) continue;
    if (filters?.to && invoice.dueDate > filters.to) continue;
    if (filters?.currency && currency !== filters.currency) continue;

    add(totalsByCurrency, currency, amount);
    let buckets = bucketByCurrency.get(currency);
    if (!buckets) {
      buckets = { CURRENT: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
      bucketByCurrency.set(currency, buckets);
    }
    buckets[bucket] += amount;

    if (daysPastDue > 0) {
      overdueCount += 1;
      add(overdueByCurrency, currency, amount);
    } else if (invoice.dueDate <= dueSoonLimit) {
      // Not past due AND due within the window (the due date itself counts).
      add(dueSoonByCurrency, currency, amount);
    }

    let client = clientRows.get(invoice.clientId);
    if (!client) {
      client = { invoiceCount: 0, byCurrency: new Map() };
      clientRows.set(invoice.clientId, client);
    }
    client.invoiceCount += 1;
    let clientMoney = client.byCurrency.get(currency);
    if (!clientMoney) {
      clientMoney = { outstanding: 0, overdue: 0 };
      client.byCurrency.set(currency, clientMoney);
    }
    clientMoney.outstanding += amount;
    if (daysPastDue > 0) clientMoney.overdue += amount;

    // §95 — the same money grouped by project; standalone invoices fold
    // under the null key (one honest "no project" row, never dropped).
    let project = projectRows.get(invoice.projectId);
    if (!project) {
      project = { invoiceCount: 0, byCurrency: new Map() };
      projectRows.set(invoice.projectId, project);
    }
    project.invoiceCount += 1;
    let projectMoney = project.byCurrency.get(currency);
    if (!projectMoney) {
      projectMoney = { outstanding: 0, overdue: 0 };
      project.byCurrency.set(currency, projectMoney);
    }
    projectMoney.outstanding += amount;
    if (daysPastDue > 0) projectMoney.overdue += amount;

    // §96 — the list row: stored facts + derived age/bucket/risk/display.
    invoiceRows.push({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      clientId: invoice.clientId,
      projectId: invoice.projectId,
      dueDate: invoice.dueDate,
      ageDays: daysPastDue,
      agingBucket: bucket,
      collectionRisk: collectionRisk(daysPastDue),
      status: invoice.status,
      displayStatus: display,
      total: invoice.total,
      paid: invoice.amountPaid,
      due: invoice.amountDue,
    });
  }

  const outstanding = sumGrouped(totalsByCurrency);
  const dueSoon = sumGrouped(dueSoonByCurrency);
  const overdueAmount = sumGrouped(overdueByCurrency);
  const mixed = outstanding.total === null || dueSoon.total === null || overdueAmount.total === null;

  // Buckets: per-currency bucket maps summed into ONE currency when single,
  // nulled when mixed — same honesty rule as the headline totals.
  const byAgingBucket: AgingBuckets = { CURRENT: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  if (bucketByCurrency.size <= 1) {
    for (const buckets of bucketByCurrency.values()) {
      for (const key of Object.keys(buckets) as AgingBucket[]) {
        byAgingBucket[key] = buckets[key];
      }
    }
  } else {
    for (const key of Object.keys(byAgingBucket) as AgingBucket[]) byAgingBucket[key] = null;
  }

  const foldGroupRow = (
    row: { invoiceCount: number; byCurrency: Map<string, { outstanding: number; overdue: number }> }
  ): { invoiceCount: number; outstanding: number | null; overdue: number | null; currency: string | null } => {
    const curr = sumGrouped(
      new Map([...row.byCurrency.entries()].map(([c, m]) => [c, m.outstanding]))
    );
    const overdueSingle = [...row.byCurrency.entries()].length <= 1
      ? [...row.byCurrency.values()].reduce((sum, m) => sum + m.overdue, 0)
      : null;
    return {
      invoiceCount: row.invoiceCount,
      outstanding: curr.total,
      overdue: overdueSingle,
      currency: curr.currency,
    };
  };

  const byClient: ClientReceivablesRow[] = [...clientRows.entries()]
    .map(([clientId, row]) => ({ clientId, ...foldGroupRow(row) }))
    .sort((a, b) => (b.outstanding ?? 0) - (a.outstanding ?? 0) || a.clientId.localeCompare(b.clientId));

  const byProject: ProjectReceivablesRow[] = [...projectRows.entries()]
    .map(([projectId, row]) => ({ projectId, ...foldGroupRow(row) }))
    // Real projects first (outstanding desc), the standalone row last.
    .sort((a, b) =>
      Number(a.projectId === null) - Number(b.projectId === null)
      || (b.outstanding ?? 0) - (a.outstanding ?? 0)
      || (a.projectId ?? '').localeCompare(b.projectId ?? ''));

  return {
    outstanding: outstanding.total,
    dueSoon: dueSoon.total,
    overdueAmount: overdueAmount.total,
    overdueCount,
    openInvoiceCount: invoiceRows.length,
    byAgingBucket,
    byClient,
    byProject,
    invoices: sortReceivableRows(invoiceRows),
    currency: outstanding.currency,
    mixedCurrencies: mixed,
  };
}

/**
 * Module 14 §97 — the A/R list order. Default: most overdue / highest
 * financial risk first; then outstanding amount desc, due date asc, client
 * name asc. The final invoice-number tiebreak keeps the order fully
 * deterministic (§84-style reproducibility). Names are resolved by the
 * caller (route); a missing name falls back to the id, never a guess.
 */
export function sortReceivableRows(
  rows: ReceivableInvoiceRow[],
  clientNames?: Record<string, string>
): ReceivableInvoiceRow[] {
  return [...rows].sort((a, b) =>
    b.ageDays - a.ageDays                                        // most overdue first
    || b.due.amount - a.due.amount                               // then outstanding desc
    || (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0) // then earliest due date
    || (clientNames?.[a.clientId] ?? a.clientId).localeCompare(clientNames?.[b.clientId] ?? b.clientId)
    || (a.invoiceNumber ?? a.invoiceId).localeCompare(b.invoiceNumber ?? b.invoiceId)
  );
}

/** §2/§3 — invoiced and collected revenue, currency-grouped (all-time, state-based). */
export interface InvoiceMoneyMetrics {
  /** §2 — Σ total over issued invoices; null when currencies mix. */
  invoicedRevenue: number | null;
  /** §3 — Σ amount over CONFIRMED payments; null when currencies mix. */
  collectedRevenue: number | null;
  invoicedCurrency: string | null;
  collectedCurrency: string | null;
  mixedInvoicedCurrencies: boolean;
  mixedCollectedCurrencies: boolean;
}

export async function getInvoiceMoneyMetrics(tenantId: string): Promise<InvoiceMoneyMetrics> {
  const { db } = await connectDb();
  if (db) {
    try {
      const [invoicedRows, collectedRows] = await Promise.all([
        db.collection('invoices').aggregate([
          { $match: { tenantId, status: { $in: ISSUED_STATUSES } } },
          { $group: { _id: '$total.currency', amount: { $sum: '$total.amount' } } },
          { $project: { _id: 1, amount: 1 } },
        ]).toArray() as unknown as Promise<Array<{ _id: string | null; amount: number }>>,
        db.collection('payments').aggregate([
          { $match: { tenantId, status: 'CONFIRMED' } },
          { $group: { _id: '$amount.currency', amount: { $sum: '$amount.amount' } } },
          { $project: { _id: 1, amount: 1 } },
        ]).toArray() as unknown as Promise<Array<{ _id: string | null; amount: number }>>,
      ]);
      const invoiced = sumGrouped(new Map(
        invoicedRows.filter(r => r._id).map(r => [r._id as string, r.amount])
      ));
      const collected = sumGrouped(new Map(
        collectedRows.filter(r => r._id).map(r => [r._id as string, r.amount])
      ));
      return {
        invoicedRevenue: invoiced.total,
        collectedRevenue: collected.total,
        invoicedCurrency: invoiced.currency,
        collectedCurrency: collected.currency,
        mixedInvoicedCurrencies: invoiced.total === null,
        mixedCollectedCurrencies: collected.total === null,
      };
    } catch {
      // fall through to the local store
    }
  }
  // Local fallback — same semantics over the JSON store.
  const data = initLocalDb();
  const invoicedMap = new Map<string, number>();
  for (const invoice of localIssuedInvoices(tenantId)) {
    if (invoice.total) {
      invoicedMap.set(invoice.total.currency, (invoicedMap.get(invoice.total.currency) ?? 0) + invoice.total.amount);
    }
  }
  const collectedMap = new Map<string, number>();
  for (const payment of data.payments) {
    if (payment.tenantId !== tenantId || payment.status !== 'CONFIRMED') continue;
    if (payment.amount) {
      collectedMap.set(payment.amount.currency, (collectedMap.get(payment.amount.currency) ?? 0) + payment.amount.amount);
    }
  }
  const invoiced = sumGrouped(invoicedMap);
  const collected = sumGrouped(collectedMap);
  return {
    invoicedRevenue: invoiced.total,
    collectedRevenue: collected.total,
    invoicedCurrency: invoiced.currency,
    collectedCurrency: collected.currency,
    mixedInvoicedCurrencies: invoiced.total === null,
    mixedCollectedCurrencies: collected.total === null,
  };
}

/** §119 — the milestone line of the unbilled breakdown. */
export interface MilestoneMoneyMetrics {
  /** Σ commercial value over COMPLETED + UNBILLED milestones; null when currencies mix. */
  unbilledMilestones: number | null;
  unbilledCurrency: string | null;
  mixedCurrencies: boolean;
  /**
   * Percentage milestones on projects WITHOUT a contract value: their value
   * is not computable (§73 refuses the same combination at invoice time) —
   * counted here so the number is visible instead of silently absent.
   */
  unvaluedCount: number;
}

export async function getUnbilledMilestonesMetrics(tenantId: string): Promise<MilestoneMoneyMetrics> {
  const { db } = await connectDb();
  let milestones: Pick<ProjectMilestone, 'projectId' | 'amount' | 'percentage'>[] = [];
  let projects: Pick<Project, 'id' | 'currency' | 'contractValue'>[] = [];
  if (db) {
    try {
      const [milestoneRows, projectRows] = await Promise.all([
        db.collection('project_milestones')
          .find(
            { tenantId, status: 'COMPLETED', billingStatus: 'UNBILLED' },
            { projection: { projectId: 1, amount: 1, percentage: 1 } }
          ).toArray() as unknown as Promise<Array<Record<string, unknown>>>,
        db.collection('projects')
          .find({ tenantId }, { projection: { currency: 1, contractValue: 1 } })
          .toArray() as unknown as Promise<Array<Record<string, unknown>>>,
      ]);
      milestones = milestoneRows.map(m => ({
        projectId: m.projectId as string,
        amount: m.amount as number | undefined,
        percentage: m.percentage as number | undefined,
      }));
      projects = projectRows.map(p => ({
        id: (p._id as { toString(): string }).toString(),
        currency: p.currency as string,
        contractValue: p.contractValue as number | undefined,
      }));
    } catch {
      // fall through to the local store
    }
  } else {
    const data = initLocalDb();
    milestones = data.projectMilestones
      .filter(m => m.tenantId === tenantId && m.status === 'COMPLETED' && m.billingStatus === 'UNBILLED')
      .map(m => ({ projectId: m.projectId, amount: m.amount, percentage: m.percentage }));
    projects = data.projects
      .filter(p => p.tenantId === tenantId)
      .map(p => ({ id: p.id, currency: p.currency, contractValue: p.contractValue }));
  }

  const projectById = new Map(projects.map(p => [p.id, p]));
  const byCurrency = new Map<string, number>();
  let unvaluedCount = 0;
  for (const milestone of milestones) {
    const project = projectById.get(milestone.projectId);
    // §113 — the project's currency (§37) denominates the milestone money;
    // a milestone without its project is not fabricatable.
    if (!project) continue;
    if (milestone.amount !== undefined && milestone.amount !== null) {
      byCurrency.set(project.currency, (byCurrency.get(project.currency) ?? 0) + milestone.amount);
    } else if (milestone.percentage !== undefined && project.contractValue !== undefined) {
      // §73 — percentage × contractValue, the invoice-time formula.
      byCurrency.set(
        project.currency,
        (byCurrency.get(project.currency) ?? 0) + (project.contractValue * milestone.percentage) / 100
      );
    } else {
      unvaluedCount += 1;
    }
  }
  const sum = sumGrouped(byCurrency);
  return {
    unbilledMilestones: sum.total,
    unbilledCurrency: sum.currency,
    mixedCurrencies: sum.total === null,
    unvaluedCount,
  };
}
