/**
 * Agency Vertical — Types: project profitability (Module 13, spec §58–§84)
 *
 * CLIENT-SAFE: types and pure functions only — no imports of lib/db, mongodb,
 * or any server-only module. React components import from here.
 *
 * THE FIVE FINANCIAL DIMENSIONS (§60) — every Project distinguishes:
 *
 *   CONTRACT VALUE   what the project is commercially worth (§61)
 *   REVENUE          operationally earned value, per billing model (§62)
 *   COST             labor + expenses actually delivered (§63)
 *   BILLED           invoiced to the client (finalized invoices)
 *   COLLECTED        cash actually received
 *
 * These are NEVER collapsed. In particular §66: collected cash is NEVER used
 * as profit revenue — profitability and cash collection are separate views
 * (₹300k of a ₹500k project may still be receivable; the margin is not 0%).
 *
 * §70 — the Project UI RECEIVES ProjectProfitability and renders it. The
 * calculation source is API → domain service → financial engine
 * (src/lib/agency/profitability/) — never React. This guarantees reports and
 * dashboard metrics agree: there is exactly one engine.
 *
 * §68 note on `health`: the Module 13 union is the four FINANCIAL verdicts —
 * it deliberately has no COMPLETED member. Lifecycle state lives on the
 * Project (§39); a completed project still gets a financial verdict here.
 * (The Module 1 dashboard row union, types/agency.dashboard.ts
 * ProjectHealthStatus, additionally carries COMPLETED for its own table —
 * a different view, not a contradiction.)
 */

import type { Money } from './money';

// ---------- revenue model (§62) ----------

/**
 * §62 — the clearly-labeled OPERATIONAL revenue concept, selected by the
 * project's billing model. Phase 1 deliberately keeps this simple; the exact
 * accounting treatment of revenue recognition remains separate from this
 * operational profitability metric.
 *
 *   FIXED_FEE      contract value
 *   TIME_MATERIALS approved billable time value
 *   MILESTONE      completed milestone value
 */
export type ProjectRevenueModel = 'FIXED_FEE' | 'TIME_MATERIALS' | 'MILESTONE';

/**
 * Map a project's billing model to its §62 revenue model. (BillingModel is
 * 'FIXED_FEE' | 'TIME_AND_MATERIALS' | 'MILESTONE'; the explicit mapping
 * keeps the profitability contract self-contained and greppable.)
 */
export function revenueModelForBillingModel(billingModel: string): ProjectRevenueModel {
  switch (billingModel) {
    case 'FIXED_FEE': return 'FIXED_FEE';
    case 'MILESTONE': return 'MILESTONE';
    case 'TIME_AND_MATERIALS': return 'TIME_MATERIALS';
    default: return 'TIME_MATERIALS';
  }
}

// ---------- health (§75) ----------

/**
 * §68/§75 — the four financial health verdicts. Rules are deterministic and
 * configurable (see profitability/projectHealth.ts thresholds):
 *
 *   HEALTHY       hours burn < 75% AND cost burn < 75% AND margin ≥ target
 *   WATCH         burn 75–90% OR margin approaching target
 *   AT_RISK       burn > 90% OR margin below target
 *   OVER_BUDGET   burn > 100% of the hours or cost budget
 */
export type ProjectFinancialHealth = 'HEALTHY' | 'WATCH' | 'AT_RISK' | 'OVER_BUDGET';

// ---------- budget burn (§74) ----------

/**
 * §74 — THREE separate burn indicators, never one generic percentage:
 *
 *   hours   actualHours / plannedHours      (null when no planned baseline)
 *   cost    deliveryCost / budgetCost       (null when no cost baseline)
 *   revenue applicableRevenue / revenueBudget (null when no revenue baseline)
 */
export interface ProjectBudgetBurn {
  readonly hours: number | null;
  readonly cost: number | null;
  readonly revenue: number | null;
}

// ---------- alerts (§76/§77) ----------

/**
 * §76 — the scope-creep FOUNDATION (no semantic detection in Phase 1).
 * Pure hour-budget signals later scope intelligence can consume.
 */
export type HoursBudgetLevel = 'APPROACHING' | 'EXHAUSTED' | 'OVER';

export interface HoursBudgetSignal {
  readonly level: HoursBudgetLevel;
  /** 80% → APPROACHING, 100% → EXHAUSTED, >100% → OVER (§76 thresholds). */
  readonly hourBurnPercent: number;
  readonly message: string;
}

/**
 * §77 — the margin alert. AT_RISK margin verdicts must EXPLAIN themselves:
 * "Current delivery cost is higher than the project economics support."
 */
export interface ProjectMarginAlert {
  readonly severity: 'WARNING' | 'CRITICAL';
  /** The margin that triggered the alert; null when margin has no baseline. */
  readonly currentMarginPercent: number | null;
  /** The target the project's economics demand (0–100). */
  readonly targetMarginPercent: number;
  readonly reason: string;
}

// ---------- drill-down (§78) ----------

/**
 * §78 — one labor line of the profitability drill-down. Trustworthy margin:
 * "Developer A — 40h × ₹900" — hours × the FROZEN cost-rate snapshot (§63),
 * never a live rate. Lines are per (user, snapshot rate): when a user's rate
 * changed mid-project the snapshot difference shows as two honest lines.
 */
export interface LaborBreakdownLine {
  readonly userId: string;
  /** Display label resolved by the route; null when the user is gone. */
  readonly userName: string | null;
  /** Approved minutes (§14 — minutes are the stored unit; hours are derived). */
  readonly minutes: number;
  readonly hours: number;
  /** The frozen cost rate those entries carry; null when unpriced (§96 —
   *  RATE_CONFIGURATION_REQUIRED entries have no snapshot and no cost). */
  readonly rate: Money | null;
  /** Σ calculatedCost over the line's entries. */
  readonly cost: Money;
  readonly entryCount: number;
}

/** §78 — one expense line, grouped by vendor (Stock Assets — ₹10k, …). */
export interface ExpenseBreakdownLine {
  readonly vendorName: string;
  readonly cost: Money;
  readonly expenseCount: number;
}

/** §78 — the drill-down payload under a project's profitability numbers. */
export interface ProfitabilityDrillDown {
  readonly labor: readonly LaborBreakdownLine[];
  readonly expenses: readonly ExpenseBreakdownLine[];
}

// ---------- the §68 data model ----------

/**
 * The Module 13 profitability snapshot for ONE project (§68). Every Money
 * field is denominated in the project's currency (`currency`); §127 — money
 * never converts, so sources in another currency are excluded AND counted in
 * `currencyMismatches` (explainable, never silently dropped, never converted).
 */
export interface ProjectProfitability {
  readonly projectId: string;
  readonly projectName: string;
  readonly clientId: string;
  /** The project's ISO-4217 currency — the frame of every Money below. */
  readonly currency: string;

  /** §62 — which operational revenue concept the numbers follow. */
  readonly revenueModel: ProjectRevenueModel;

  // --- dimension 1: CONTRACT VALUE (§61) ---
  /** What the project is commercially worth. Null when never negotiated. */
  readonly contractValue: Money | null;

  // --- dimension 2: REVENUE (§62) ---
  /** Earned revenue per the billing model. Zero is a real zero (nothing
   *  earned yet) — marginPercent is the field that goes null (§82). */
  readonly applicableRevenue: Money;

  // --- dimension 3: COST (§63) ---
  /** laborCost + expenseCost. */
  readonly deliveryCost: Money;
  /** §63 — approved time × cost-rate snapshot. */
  readonly laborCost: Money;
  /** §63 — approved project expenses. */
  readonly expenseCost: Money;

  // --- §64/§65 profit & margin ---
  readonly grossProfit: Money;
  /** §65 — profit / revenue × 100. NULL when revenue = 0 (§82: "N/A",
   *  never a fake 0% and never a division by zero). */
  readonly marginPercent: number | null;

  // --- dimensions 4 & 5: BILLED / COLLECTED (§66 — separate from profit) ---
  /** Σ invoice totals over finalized, non-void invoices of the project. */
  readonly billedAmount: Money;
  /** Σ amountPaid over the same invoices — cash, never profit revenue (§66). */
  readonly collectedAmount: Money;
  /** billedAmount − collectedAmount (the receivable view, Module 14's home). */
  readonly outstandingAmount: Money;

  // --- §67 unbilled work ---
  /** Eligible billable work − reserved/invoiced work (§67 equation). */
  readonly unbilledAmount: Money;

  // --- §74 burn ---
  readonly plannedHours: number | null;
  /** Σ approved minutes / 60 — actual delivery effort, any billability. */
  readonly actualHours: number;
  /** §76 — plannedHours − actualHours; null when no plan exists. */
  readonly remainingHours: number | null;
  /** §74 — the three separate burn ratios (null = no baseline for that one). */
  readonly burn: ProjectBudgetBurn;
  /** §68 sketch field — the headline burn feeding health: max(hours, cost)
   *  burn (the worst budget dimension; revenue burn is informational and
   *  never a health input). Null when neither baseline exists. */
  readonly budgetBurnPercent: number | null;

  // --- §75/§77 health ---
  /** The project's target margin, 0–100; null when never set. */
  readonly targetMargin: number | null;
  readonly health: ProjectFinancialHealth;
  /** §77 — present exactly when the margin verdict needs explaining. */
  readonly marginAlert: ProjectMarginAlert | null;
  /** §76 — hours-budget warning (80/100/>100); null while under 80%. */
  readonly hoursWarning: HoursBudgetSignal | null;

  /**
   * §79 explainability — deterministic notes about the inputs, e.g. currency
   * mismatches excluded or rate-missing entries. Every source change is
   * auditable from the underlying entities; these notes say which entities to
   * look at. Never AI, never speculation.
   */
  readonly notes: readonly string[];
  /** Count of source rows excluded because their currency ≠ project currency. */
  readonly currencyMismatches: number;
}

// ---------- portfolio (§80/§81) ----------

/** §81 — Client Profitability: a derivative of project profitability.
 *  Money fields are null when the client's projects mix currencies (§127). */
export interface ClientProfitabilityRow {
  readonly clientId: string;
  readonly clientName: string | null;
  readonly projectCount: number;
  readonly applicableRevenue: Money | null;
  readonly deliveryCost: Money | null;
  readonly grossProfit: Money | null;
  /** §82 — null when the client's combined revenue is 0. */
  readonly marginPercent: number | null;
}

/** §81 — portfolio totals. Null money fields when project currencies mix
 *  (§127 — never convert, never fake one number); counts stay real. */
export interface PortfolioProfitabilitySummary {
  readonly projectCount: number;
  readonly mixedCurrencies: boolean;
  readonly contractValue: Money | null;
  readonly applicableRevenue: Money | null;
  readonly deliveryCost: Money | null;
  readonly grossProfit: Money | null;
  /** Portfolio margin: Σprofit / Σrevenue × 100; null when revenue = 0 (§82). */
  readonly marginPercent: number | null;
  readonly billedAmount: Money | null;
  readonly collectedAmount: Money | null;
  readonly unbilledAmount: Money | null;
}

/** §81 — the portfolio report payload: per-project rows + client rollup +
 *  totals. Margins, costs, burns and unbilled work per project ARE the
 *  "Margin by Project / Cost by Project / Budget Burn / Unbilled Work"
 *  reports — the same rows, each report a different sort/lens over them. */
export interface PortfolioProfitability {
  readonly projects: readonly ProjectProfitability[];
  readonly byClient: readonly ClientProfitabilityRow[];
  readonly summary: PortfolioProfitabilitySummary;
}
