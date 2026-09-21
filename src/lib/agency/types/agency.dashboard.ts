/**
 * Agency Vertical — Types: dashboard view models (Step 0.12)
 *
 * CLIENT-SAFE: types only. No server imports.
 *
 * The stable domain contract the UI consumes — produced exclusively by
 * lib/agency/analytics/dashboard.ts. Components never assemble these shapes
 * themselves and never fetch entity lists to compute them.
 *
 * Every field maps to docs/agency/phase-1/01-financial-definitions.md —
 * see the § references. Module 1 sources are absent, so these start empty
 * (the zero-value contract, §13): empty arrays, null margins, 0 metrics.
 */
import type { AgencyDashboardMetrics } from './agency.dashboard-metrics';
import type { ReportingPeriod, DateRange } from './dates';

/**
 * vs-previous-period delta for a money metric (Module 1.4 Card 1 pattern).
 * `deltaPercent` is null when the previous period value was 0 (no baseline)
 * — rendered "—", never a fabricated ±∞.
 */
export interface MetricDelta {
  readonly currentValue: number;
  readonly previousValue: number;
  readonly deltaPercent: number | null;
}

/** Health status per definitions §11 (priority order). */
export type ProjectHealthStatus = 'HEALTHY' | 'WATCH' | 'AT_RISK' | 'OVER_BUDGET' | 'COMPLETED';

/** One row of the project health table (definitions §11 + dashboard mock §9). */
export interface ProjectHealthRow {
  readonly projectId: string;
  readonly name: string;
  readonly clientName: string;
  readonly contractValue: number;      // applicableRevenue(P), §1
  readonly cost: number;               // projectCost(P), §4
  readonly billed: number;             // invoiced for P, §2
  readonly collected: number;          // collected for P, §3
  readonly margin: number | null;      // §6 in PERCENT (0–100) — null when Revenue = 0
  readonly budgetBurn: number | null;  // §8 in PERCENT (0–100) — null when PlannedHours = 0
  readonly status: ProjectHealthStatus;
}

/**
 * Deterministic dashboard alert (definitions §11; rules engine arrives Sprint 8).
 *
 * MODULE 1.6 — ACTIONABILITY: every alert carries the entity it points at
 * (`entityLabel` + `projectId`/`invoiceId`) so the Needs Attention panel can
 * offer a click-through. At Module 1 the destination modules (project pages,
 * invoice pages) do not exist yet — the panel renders a DISABLED placeholder
 * action instead of inventing navigation. When the destination module ships,
 * the panel swaps the placeholder for a real href; the type does not change.
 */
export interface AgencyAlert {
  readonly id: string;
  readonly type: 'PROJECT_HOURS' | 'PROJECT_BUDGET' | 'PROJECT_MARGIN' | 'UNBILLED_WORK' | 'INVOICE_DUE_SOON' | 'INVOICE_OVERDUE';
  readonly severity: 'INFO' | 'WARNING' | 'CRITICAL';
  readonly message: string;            // human-readable, deterministic (no AI, PRD §51)
  /** Display name of the referenced entity (e.g. "Project Atlas"). */
  readonly entityLabel?: string;
  readonly projectId?: string;
  readonly invoiceId?: string;
}

/** Receivables summary (definitions §9). */
export interface AgencyReceivablesSummary {
  readonly outstanding: number;
  readonly overdueAmount: number;
  readonly overdueCount: number;
  /** Receivables due within the next 7 days (Module 1.10 "Due Soon"). */
  readonly dueSoon: number;
  readonly byAgingBucket: Readonly<Record<'CURRENT' | '1-30' | '31-60' | '61-90' | '90+', number>>;
}

/** Work/delivery summary (definitions §8 + Module 1.9). */
export interface AgencyWorkSummary {
  readonly activeProjects: number;
  readonly hoursLogged: number;
  readonly billableHours: number;
  readonly nonBillableHours: number;
  /** billable / total hours — null when total = 0 (no baseline, Module 1.9). */
  readonly billablePercent: number | null;
}

/**
 * Agency Snapshot (Module 1.14) — a compact operational summary, NOT another
 * analytics module: no formulas, no aggregation layers. Counts and one
 * utilization ratio, each sourced from its owning domain. Zero-value
 * contract until the owning sprints land.
 */
export interface AgencySnapshotSummary {
  /** Clients with active agency work — LIVE since Module 2 (Step 2.7). */
  readonly activeClients: number;
  /** True when activeClients comes from the real client store (Module 2+). */
  readonly activeClientsReady: boolean;
  /**
   * Status-ACTIVE projects — LIVE since Module 3 (Step 3.8). Distinct from
   * the KPI's activeProjects metric: the snapshot line carries its own
   * readiness so an unresolved query never renders as a real zero.
   */
  readonly activeProjects: number;
  readonly activeProjectsReady: boolean;
  /**
   * PLANNED portfolio margin (§92) — (ΣrevenueBudget − ΣbudgetCost) /
   * ΣrevenueBudget over ACTIVE projects with both baselines. Null when none
   * carries them (no-baseline rule). The ACTUAL average margin is a
   * different line and waits for delivery cost data.
   */
  readonly plannedMargin: number | null;
  readonly plannedMarginReady: boolean;
  /**
   * Module 6 (§123–§124) — rate readiness signals, counts only (§99: no
   * amounts). READY_FOR_TRACKING projects / deliverable-scope projects.
   */
  readonly projectsReadyForTracking: number;
  readonly projectsMissingRates: number;
  readonly projectsDeliverableTotal: number;
  readonly rateReadinessReady: boolean;
  /** Active users resolving no cost rate today — the §123 staffing gap. */
  readonly usersWithoutCostRate: number;
  readonly usersTotal: number;
  /** Members in the tenant workspace (team roster — existing core entity). */
  readonly teamMembers: number;
  /** Billable utilization (billable / capacity); null when no capacity baseline. */
  readonly billableUtilization: number | null;
}

/**
 * Unbilled-work breakdown (Module 1.11). The component lines of approved
 * billable work not yet invoiced, split by origin. The purpose: identify
 * revenue leakage BEFORE it becomes lost revenue. Splits arrive with the
 * source entities (time §Sprint 3, expenses, milestones); Module 1 returns
 * the zero-value contract — the total is the SUM of its parts, never an
 * independent number (no inferred totals).
 */
export interface AgencyUnbilledSummary {
  /** Approved billable time not yet invoiced (Money). */
  readonly unbilledTime: number;
  /** Approved billable expenses not yet invoiced (Money). */
  readonly unbilledExpenses: number;
  /** Achieved milestones not yet invoiced (Money). */
  readonly unbilledMilestones: number;
  /** unbilledTime + unbilledExpenses + unbilledMilestones (derived, §7). */
  readonly totalUnbilled: number;
}

/**
 * Trend series point (Module 1.13). One month on the x-axis; the y-values
 * are minor-unit money amounts or ratios, resolved by the analytics service
 * per the SAME definitions as the KPI cards (a trend line and its KPI must
 * never disagree). Months are `YYYY-MM` business dates (tenant tz).
 */
export interface AgencyTrendPoint {
  /** Month bucket, `YYYY-MM` (tenant tz, business date). */
  readonly month: string;
  /** Applicable revenue in month (§1) — used by the Revenue line. */
  readonly revenue: number;
  /** Collected cash in month (§3). */
  readonly collected: number;
  /** Invoiced value in month (§2). */
  readonly invoiced: number;
  /** Outstanding receivables at month end (§9) — snapshot, not a flow. */
  readonly outstanding: number;
  /** Average project margin in month (§6); null when revenue = 0. */
  readonly margin: number | null;
}

/**
 * Trend data state (Module 1.13). Empty series → the section renders its
 * awaiting-source state, never a fabricated flat line.
 */
export interface AgencyTrends {
  /** Chronological points; may be empty until source entities exist. */
  readonly points: readonly AgencyTrendPoint[];
  /** False until the underlying sources (invoices/payments) produce data. */
  readonly sourceReady: boolean;
}

/** Financial summary (definitions §1–§7). */
export interface AgencyFinancialSummary {
  readonly contractedRevenue: number;
  readonly billedRevenue: number;
  readonly collectedRevenue: number;
  /** §117 — collected ÷ invoiced (0–100); null when nothing invoiced. */
  readonly cashCollectionRate: number | null;
  readonly unbilledRevenue: number;
  readonly deliveryCost: number;
  readonly projectProfit: number;
  readonly averageMargin: number | null;
}

/**
 * The complete dashboard payload — the one object the API route returns.
 * Module 1.3: every payload carries its period + resolved window so each
 * metric can state exactly what period it represents (consistency rule).
 */
export interface AgencyDashboardData {
  readonly metrics: AgencyDashboardMetrics;      // typed KPI contract (Step 0.9)
  readonly financialSummary: AgencyFinancialSummary;
  readonly receivables: AgencyReceivablesSummary;
  readonly work: AgencyWorkSummary;
  /** Unbilled-work breakdown (Module 1.11) — leakage before it is lost. */
  readonly unbilled: AgencyUnbilledSummary;
  /** Compact operational snapshot (Module 1.14) — a summary, not analytics. */
  readonly snapshot: AgencySnapshotSummary;
  /** Trend series (Module 1.13) — empty until sources produce data. */
  readonly trends: AgencyTrends;
  readonly projects: readonly ProjectHealthRow[];
  readonly alerts: readonly AgencyAlert[];
  /** Selected reporting period (default: THIS_MONTH). */
  readonly period: ReportingPeriod;
  /**
   * Period scope (Module 1.16): periodStart → periodEnd plus the tenant
   * timezone. Every metric in the payload is scoped to exactly this window
   * in this tz — resolved internally from the TENANT's configured timezone,
   * never the browser's.
   */
  readonly periodScope: {
    readonly from: string;        // periodStart, 'YYYY-MM-DD'
    readonly to: string;          // periodEnd, 'YYYY-MM-DD' (inclusive)
    readonly timezone: string;    // tenant tz, e.g. 'Asia/Kolkata'
  };
  /** Resolved window in tenant-tz business dates, incl. previous for deltas. */
  readonly dateRange: DateRange;
  /**
   * Primary-card deltas vs the previous window (Module 1.4). Null when the
   * metric's source is not ready — deltas never appear before values do.
   */
  readonly deltas: {
    readonly contractedRevenue: MetricDelta | null;
    readonly billedRevenue: MetricDelta | null;
    readonly collectedRevenue: MetricDelta | null;
    readonly unbilledRevenue: MetricDelta | null;
  };
}
