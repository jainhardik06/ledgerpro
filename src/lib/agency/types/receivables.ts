/**
 * Agency Vertical — Types: receivables view contract (Module 14, §85–§106)
 *
 * CLIENT-SAFE: types only, no server imports. The UI renders these shapes;
 * the ONE engine that produces them is queries/receivables-summary.ts
 * (§99/§102 — server-side, derived, never recalculated in React).
 */

import type { AgingBucket } from './dates';
import type { InvoiceStatus } from './invoice';

/** Aging buckets with null-on-mixed amounts (counts never null). */
export type AgingBuckets = Record<AgingBucket, number | null>;

/** §94 — receivables grouped per client. */
export interface ClientReceivablesRow {
  clientId: string;
  /** Open (receivable) invoice count for this client. */
  invoiceCount: number;
  /** Σ amountDue over the client's open invoices; null when they mix currencies. */
  outstanding: number | null;
  /** Σ amountDue over the client's past-due open invoices; null on mixed. */
  overdue: number | null;
  /** The client's single open currency; null when none or mixed. */
  currency: string | null;
}

/**
 * §95 — receivables grouped per PROJECT (finance → delivery). Standalone
 * invoices (no project) fold into one row with projectId null.
 */
export interface ProjectReceivablesRow {
  projectId: string | null;
  invoiceCount: number;
  /** Σ amountDue over the project's open invoices; null when they mix currencies. */
  outstanding: number | null;
  /** Σ amountDue over the project's past-due open invoices; null on mixed. */
  overdue: number | null;
  /** The project's single open currency; null when none or mixed. */
  currency: string | null;
}

/**
 * §96 — one A/R list row. Every money field is the stored source fact
 * (total/amountPaid/amountDue); age/aging/risk are DERIVED at query time
 * (§102 — never stored, so they can never go stale). `status` is the stored
 * state; `displayStatus` is the §80/§91 operational verdict (an invoice
 * stored SENT that is past due with money owed is operationally OVERDUE).
 */
export interface ReceivableInvoiceRow {
  invoiceId: string;
  invoiceNumber: string | null;
  clientId: string;
  projectId: string | null;
  dueDate: string;
  /** §89 — days past due today (0 when not yet due). */
  ageDays: number;
  agingBucket: AgingBucket;
  /** §101 — deterministic collection-risk band; null when not past due. */
  collectionRisk:
    | 'OVERDUE' | 'OVERDUE_10_PLUS' | 'OVERDUE_30_PLUS' | 'OVERDUE_60_PLUS' | 'OVERDUE_90_PLUS'
    | null;
  /** Stored invoice state. */
  status: InvoiceStatus;
  /** §80/§91 derived — the operational status the A/R view sorts and filters on. */
  displayStatus: InvoiceStatus;
  total: { amount: number; currency: string };
  paid: { amount: number; currency: string };
  due: { amount: number; currency: string };
}

/**
 * §98 — the receivables query filters. clientId/projectId/status narrow the
 * INDEXED server query (§99); agingBucket/from/to/currency are derived
 * filters applied in the query layer (§102 — they depend on "today", which
 * is tenant-timezone business math, not a stored field).
 */
export interface ReceivablesFilters {
  clientId?: string;
  projectId?: string;
  /** Matched against the DERIVED display status (§91 operational view). */
  status?: InvoiceStatus;
  agingBucket?: AgingBucket;
  /** Inclusive due-date window (§96 "Due date" filter). */
  from?: string;
  to?: string;
  currency?: string;
}

/** §87/§105 — the full receivables position as of a business date. */
export interface ReceivablesMetrics {
  /** §9 — Σ amountDue over open invoices; null when currencies mix. */
  outstanding: number | null;
  /** §105 — Σ amountDue due within [today, today+N]; null on mixed. */
  dueSoon: number | null;
  /** §105 — Σ amountDue past due; null on mixed. */
  overdueAmount: number | null;
  /** §105 — count of past-due open invoices (always real — currency-free). */
  overdueCount: number;
  /** Count of open invoices carrying a balance (after filters). */
  openInvoiceCount: number;
  /** §105 — outstanding by days-past-due bucket; nulls on mixed. */
  byAgingBucket: AgingBuckets;
  /** §106 — per-client receivables. */
  byClient: ClientReceivablesRow[];
  /** §95 — per-project receivables; standalone invoices under projectId null. */
  byProject: ProjectReceivablesRow[];
  /** §96/§97 — the A/R list rows, most-overdue-first. */
  invoices: ReceivableInvoiceRow[];
  /** Single currency of the outstanding money; null when none or mixed. */
  currency: string | null;
  mixedCurrencies: boolean;
}
