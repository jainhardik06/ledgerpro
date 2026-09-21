/**
 * Agency Vertical — Types: dashboard metric contract (Step 0.9)
 *
 * CLIENT-SAFE: types only. No server imports.
 *
 * AgencyDashboardMetrics is THE interface between the Agency domain and the
 * UI. It mirrors the KPI card mapping in
 * docs/agency/phase-1/01-financial-definitions.md §12 — one field per KPI,
 * one definition per field (§1–§11), zero room for reinterpretation.
 *
 * Produced exclusively by lib/agency/analytics (the calculation engine) and
 * consumed by the dashboard API route, components, and (later) reports.
 * Nobody else may construct these values.
 */
import type { CountMetric, HoursMetric, MoneyMetric, PercentageMetric } from './metrics';

export interface AgencyDashboardMetrics {
  // Revenue (definitions §1)
  readonly contractedRevenue: MoneyMetric;

  // Billing (§2)
  readonly billedRevenue: MoneyMetric;

  // Cash (§3)
  readonly collectedRevenue: MoneyMetric;
  /** Collected ÷ invoiced (§117 after-Payments); null when nothing invoiced. */
  readonly cashCollectionRate: PercentageMetric;

  // Unbilled work (§7)
  readonly unbilledRevenue: MoneyMetric;

  // Delivery (§8 + Module 1.9)
  readonly activeProjects: CountMetric;
  readonly totalHours: HoursMetric;
  readonly billableHours: HoursMetric;
  readonly nonBillableHours: HoursMetric;
  /** billable / total hours; null when total = 0 (no baseline — Module 1.9). */
  readonly billablePercent: PercentageMetric;

  // Profitability (§4, §5, §6)
  readonly deliveryCost: MoneyMetric;
  readonly projectProfit: MoneyMetric;
  readonly averageMargin: PercentageMetric;

  // Receivables (§9 + Module 1.10)
  readonly outstandingReceivables: MoneyMetric;
  /** Outstanding amount due within the next 7 days ("Due Soon"). */
  readonly dueSoonReceivables: MoneyMetric;
  readonly overdueReceivables: MoneyMetric;
  readonly overdueInvoiceCount: CountMetric;

  // Health (§11)
  readonly atRiskProjects: CountMetric;
}
