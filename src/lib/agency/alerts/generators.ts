/**
 * Agency Vertical — Alerts: candidate generators (Module 15, §8–§18/§22)
 *
 * PURE functions: engine snapshots in, AlertCandidate[] out. No DB, no
 * clock (today arrives as a parameter), no severity invention (the catalog
 * + resolveSeverity own that). The evaluator (evaluator.ts) supplies the
 * Module 13/14 engine outputs and executes what lands here.
 *
 * §90 master rule: alerts CONSUME the engines — this file never
 * recalculates a margin, never re-sums a pipeline. Hours/budget/margin
 * read the ProjectProfitability row; unbilled reads the Module 13
 * aggregates (§96-honest: minutes count even when unpriced); cash reads
 * the Module 14 receivable rows. If an engine number is wrong, fix the
 * engine — never patch it here.
 *
 * Scope discipline (§9 noise control):
 *   ACTIVE + ON_HOLD   hours bands, over-budget, margin, unbilled time /
 *                      expense (work in flight deserves operational noise)
 *   COMPLETED only     COMPLETED_PROJECT_UNBILLED_WORK — one CRITICAL, so
 *                      a finished project never stacks the in-flight rules
 *   DRAFT/CANCELLED/ARCHIVED   silent
 */
import type {
  AlertRule, AlertRuleType, AlertSeverity,
} from './types';
import type { AlertCandidate } from './dedupe';
import { effectiveRuleConfiguration } from './rules';
import { resolveSeverity } from './severity';
import type { Project, ProjectStatus } from '../types/project';
import type { ProjectProfitability } from '../types/profitability';
import type { ReceivableInvoiceRow } from '../types/receivables';
import { diffDays, type BusinessDate } from '../types/dates';
import type {
  ProjectTimeAggregates, ProjectExpenseAggregates, CurrencyAmount,
} from '../queries/profitability-metrics';

/** The statuses that carry operational (in-flight) alerting. */
const OPERATIONAL_STATUSES: readonly ProjectStatus[] = ['ACTIVE', 'ON_HOLD'];

// ---------- shared helpers ----------

/** An enabled rule + its effective (catalog-defaulted) configuration. */
interface RuleContext {
  rule: AlertRule;
  config: ReturnType<typeof effectiveRuleConfiguration>;
}

/**
 * Resolve a rule for generation: null when the rule is absent or disabled.
 * Disabled rules produce NO candidates — and the evaluator then
 * auto-resolves their still-open stored alerts (§19: disable = silence).
 */
function ruleContextFor(rules: readonly AlertRule[], type: AlertRuleType): RuleContext | null {
  const rule = rules.find(r => r.type === type);
  if (!rule || !rule.enabled) return null;
  return { rule, config: effectiveRuleConfiguration(rule) };
}

/** Deterministic money string for server-authored messages (major units). */
function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function percent(value: number): string {
  return `${Math.round(value * 10) / 10}%`;
}

// ---------- project rules (§9–§13) ----------

/** Everything the project generators need, joined per project. */
export interface ProjectAlertSource {
  row: ProjectProfitability;
  status: ProjectStatus | undefined;
  time?: ProjectTimeAggregates;
  expenses?: ProjectExpenseAggregates;
}

/**
 * §9–§13 — hours bands (mutually exclusive), over-budget, margin,
 * unbilled time/expense, completed-with-unbilled-work. Operational rules
 * run on ACTIVE/ON_HOLD; the completed rule runs on COMPLETED only.
 */
export function generateProjectAlerts(
  sources: readonly ProjectAlertSource[],
  rules: readonly AlertRule[]
): AlertCandidate[] {
  const candidates: AlertCandidate[] = [];

  // The three hours-band contexts, resolved once (thresholds may be tuned).
  const hoursRules: Array<{ type: AlertRuleType; ctx: RuleContext | null }> = [
    { type: 'PROJECT_HOURS_100', ctx: ruleContextFor(rules, 'PROJECT_HOURS_100') },
    { type: 'PROJECT_HOURS_80', ctx: ruleContextFor(rules, 'PROJECT_HOURS_80') },
    { type: 'PROJECT_HOURS_75', ctx: ruleContextFor(rules, 'PROJECT_HOURS_75') },
  ];
  const overBudgetCtx = ruleContextFor(rules, 'PROJECT_OVER_BUDGET');
  const marginCtx = ruleContextFor(rules, 'PROJECT_MARGIN_BELOW_TARGET');
  const unbilledTimeCtx = ruleContextFor(rules, 'UNBILLED_APPROVED_TIME');
  const unbilledExpenseCtx = ruleContextFor(rules, 'UNBILLED_EXPENSE');
  const completedUnbilledCtx = ruleContextFor(rules, 'COMPLETED_PROJECT_UNBILLED_WORK');

  for (const source of sources) {
    const { row } = source;
    const isOperational = source.status !== undefined && OPERATIONAL_STATUSES.includes(source.status);
    const isCompleted = source.status === 'COMPLETED';

    // ---- §9 hours bands (operational, planned-hours baseline required) ----
    if (isOperational && row.plannedHours !== null && row.plannedHours > 0) {
      const utilization = (row.actualHours / row.plannedHours) * 100;
      // Bands in DESCENDING threshold order; the FIRST band whose threshold
      // is met AND whose rule is enabled fires — one candidate per project,
      // never two (mutual exclusivity is fingerprint-level by ruleType, so
      // a band transition auto-resolves the old alert and opens the new).
      for (const { type, ctx } of hoursRules) {
        if (!ctx) continue;
        const threshold = ctx.config.percentage ?? 100;
        if (utilization < threshold) continue;
        candidates.push({
          ruleType: type,
          entityType: 'PROJECT',
          entityId: row.projectId,
          entityLabel: row.projectName,
          severity: resolveSeverity(ctx.rule),
          title: type === 'PROJECT_HOURS_100'
            ? 'Project hours exhausted'
            : `Project hours past ${threshold}% of plan`,
          message: `${row.projectName} has used ${percent(utilization)} of its planned hours (${row.actualHours}h of ${row.plannedHours}h)`,
          projectId: row.projectId,
          clientId: row.clientId,
          value: Math.round(utilization * 10) / 10,
          threshold,
          metadata: { plannedHours: row.plannedHours, actualHours: row.actualHours },
        });
        break; // only the highest applicable band
      }
    }

    // ---- §10 over-budget (operational, cost-burn baseline required) ----
    // §90: consumes burn.cost — the §74 engine ratio, never recomputed here.
    if (isOperational && overBudgetCtx && row.burn.cost !== null) {
      const thresholdPercent = overBudgetCtx.config.percentage ?? 100;
      const costBurnPercent = row.burn.cost * 100;
      if (costBurnPercent > thresholdPercent) {
        candidates.push({
          ruleType: 'PROJECT_OVER_BUDGET',
          entityType: 'PROJECT',
          entityId: row.projectId,
          entityLabel: row.projectName,
          severity: resolveSeverity(overBudgetCtx.rule),
          title: 'Project over budget',
          message: `${row.projectName} delivery cost is at ${percent(costBurnPercent)} of its cost budget (delivery cost ${money(row.deliveryCost.amount, row.currency)})`,
          projectId: row.projectId,
          clientId: row.clientId,
          value: Math.round(costBurnPercent * 10) / 10,
          threshold: thresholdPercent,
          metadata: {
            costBurnRatio: row.burn.cost,
            deliveryCost: row.deliveryCost.amount,
            currency: row.currency,
          },
        });
      }
    }

    // ---- §12 margin below target (operational) ----
    // §90: consumes row.marginAlert — NEVER recalculates margin. The engine
    // escalates severity to CRITICAL when the verdict is AT_RISK/OVER_BUDGET.
    if (isOperational && marginCtx && row.marginAlert !== null) {
      const alert = row.marginAlert;
      candidates.push({
        ruleType: 'PROJECT_MARGIN_BELOW_TARGET',
        entityType: 'PROJECT',
        entityId: row.projectId,
        severity: resolveSeverity(marginCtx.rule, alert.severity as AlertSeverity),
        title: 'Project margin below target',
        message: `${row.projectName}: ${alert.reason}`,
        projectId: row.projectId,
        clientId: row.clientId,
        value: alert.currentMarginPercent ?? 0, // engine fires only with a real margin; ?? 0 is defensive
        threshold: alert.targetMarginPercent,
        metadata: {
          marginPercent: alert.currentMarginPercent,
          targetMarginPercent: alert.targetMarginPercent,
          currency: row.currency,
        },
      });
    }

    // ---- §14/§16 unbilled approved time (operational, §96-honest) ----
    // Fires on unbilled MINUTES > 0: minutes are countable even when the
    // value is unpriced (rateMissing). value = hours; money rides metadata.
    if (isOperational && unbilledTimeCtx && (source.time?.unbilledMinutes ?? 0) > 0) {
      const unbilledMinutes = source.time!.unbilledMinutes;
      const hours = Math.round((unbilledMinutes / 60) * 100) / 100;
      candidates.push({
        ruleType: 'UNBILLED_APPROVED_TIME',
        entityType: 'TIME',
        entityId: row.projectId,
        entityLabel: row.projectName,
        severity: resolveSeverity(unbilledTimeCtx.rule),
        title: 'Approved unbilled time',
        message: `${row.projectName} has ${hours}h of approved billable time not yet on an invoice`,
        projectId: row.projectId,
        clientId: row.clientId,
        value: hours,
        metadata: {
          unbilledMinutes,
          unbilledTime: source.time!.unbilledTime,
        },
      });
    }

    // ---- §15/§16 unbilled expenses (operational) ----
    const unbilledCharge = (source.expenses?.unbilledCharge ?? []).filter(c => c.amount > 0);
    if (isOperational && unbilledExpenseCtx && unbilledCharge.length > 0) {
      // value = the largest currency bucket (deterministic; §127 — buckets
      // are never converted or merged); every bucket rides metadata.
      const largest = unbilledCharge.reduce((a, b) => (b.amount > a.amount ? b : a));
      candidates.push({
        ruleType: 'UNBILLED_EXPENSE',
        entityType: 'EXPENSE',
        entityId: row.projectId,
        entityLabel: row.projectName,
        severity: resolveSeverity(unbilledExpenseCtx.rule),
        title: 'Unbilled expenses',
        message: `${row.projectName} has approved billable expenses of ${money(largest.amount, largest.currency)} not yet on an invoice`,
        projectId: row.projectId,
        clientId: row.clientId,
        value: largest.amount,
        metadata: {
          unbilledCharge,
          valueCurrency: largest.currency,
        },
      });
    }

    // ---- §18 completed with unbilled work (COMPLETED only, single
    //      CRITICAL — a finished project must not stack in-flight rules) ----
    // §90: consumes row.unbilledAmount — the §67 engine value (fixed-fee
    // remainder, T&M time+expenses, milestones — all in the engine).
    if (isCompleted && completedUnbilledCtx && row.unbilledAmount.amount > 0) {
      candidates.push({
        ruleType: 'COMPLETED_PROJECT_UNBILLED_WORK',
        entityType: 'PROJECT',
        entityId: row.projectId,
        severity: resolveSeverity(completedUnbilledCtx.rule),
        title: 'Completed project with unbilled work',
        message: `${row.projectName} is completed but ${money(row.unbilledAmount.amount, row.currency)} of billable work was never invoiced`,
        projectId: row.projectId,
        clientId: row.clientId,
        value: row.unbilledAmount.amount,
        metadata: {
          unbilledAmount: row.unbilledAmount.amount,
          currency: row.currency,
        },
      });
    }
  }

  return candidates;
}

// ---------- cash rules (§15–§17) ----------

/**
 * §15–§17 — due soon, overdue, large overdue, over the Module 14 open A/R
 * rows (open invoices that still owe money; every row carries its own due
 * date and derived age). LARGE and plain OVERDUE both fire for the same
 * large overdue invoice — separate fingerprints, separately disableable.
 * Thresholds are MAJOR units: due.amount and config.amount share the
 * Money scale, so the comparison is direct (§127 — never converted).
 */
export function generateCashAlerts(
  invoices: readonly ReceivableInvoiceRow[],
  rules: readonly AlertRule[],
  today: BusinessDate
): AlertCandidate[] {
  const candidates: AlertCandidate[] = [];
  const dueSoonCtx = ruleContextFor(rules, 'INVOICE_DUE_SOON');
  const overdueCtx = ruleContextFor(rules, 'INVOICE_OVERDUE');
  const largeOverdueCtx = ruleContextFor(rules, 'LARGE_INVOICE_OVERDUE');

  for (const invoice of invoices) {
    const label = invoice.invoiceNumber ?? invoice.invoiceId;
    const dueMoney = money(invoice.due.amount, invoice.due.currency);

    // ---- §15 due soon: dueDate within [today, today + days] ----
    // diffDays(today, dueDate) — the dates.ts string-domain math the A/R
    // engine itself uses, so due-soon and overdue can never disagree.
    if (dueSoonCtx) {
      const windowDays = dueSoonCtx.config.days ?? 7;
      const remaining = diffDays(today, invoice.dueDate);
      if (remaining >= 0 && remaining <= windowDays) {
        candidates.push({
          ruleType: 'INVOICE_DUE_SOON',
          entityType: 'INVOICE',
          entityId: invoice.invoiceId,
          entityLabel: `Invoice ${label}`,
          severity: resolveSeverity(dueSoonCtx.rule),
          title: 'Invoice due soon',
          message: `Invoice ${label} (${dueMoney}) is due in ${remaining} day${remaining === 1 ? '' : 's'}`,
          clientId: invoice.clientId,
          ...(invoice.projectId !== null && { projectId: invoice.projectId }),
          invoiceId: invoice.invoiceId,
          value: remaining,
          threshold: windowDays,
          metadata: {
            invoiceNumber: invoice.invoiceNumber,
            dueAmount: invoice.due.amount,
            currency: invoice.due.currency,
            dueDate: invoice.dueDate,
          },
        });
      }
    }

    // ---- §16/§17 overdue + large overdue (ageDays is the §89 engine
    //      derivation — days past due, 0 when not yet due) ----
    if (invoice.ageDays > 0) {
      if (overdueCtx) {
        candidates.push({
          ruleType: 'INVOICE_OVERDUE',
          entityType: 'INVOICE',
          entityId: invoice.invoiceId,
          entityLabel: `Invoice ${label}`,
          severity: resolveSeverity(overdueCtx.rule),
          title: 'Invoice overdue',
          message: `Invoice ${label} (${dueMoney}) is ${invoice.ageDays} day${invoice.ageDays === 1 ? '' : 's'} past due`,
          clientId: invoice.clientId,
          ...(invoice.projectId !== null && { projectId: invoice.projectId }),
          invoiceId: invoice.invoiceId,
          value: invoice.ageDays,
          metadata: {
            invoiceNumber: invoice.invoiceNumber,
            dueAmount: invoice.due.amount,
            currency: invoice.due.currency,
            dueDate: invoice.dueDate,
          },
        });
      }
      if (largeOverdueCtx) {
        const threshold = largeOverdueCtx.config.amount ?? 100000;
        if (invoice.due.amount >= threshold) {
          candidates.push({
            ruleType: 'LARGE_INVOICE_OVERDUE',
            entityType: 'INVOICE',
            entityId: invoice.invoiceId,
            severity: resolveSeverity(largeOverdueCtx.rule),
            title: 'Large invoice overdue',
            message: `Invoice ${label} (${dueMoney}) is ${invoice.ageDays} day${invoice.ageDays === 1 ? '' : 's'} past due`,
            clientId: invoice.clientId,
            ...(invoice.projectId !== null && { projectId: invoice.projectId }),
            invoiceId: invoice.invoiceId,
            value: invoice.due.amount,
            threshold,
            metadata: {
              invoiceNumber: invoice.invoiceNumber,
              dueAmount: invoice.due.amount,
              currency: invoice.due.currency,
              dueDate: invoice.dueDate,
              ageDays: invoice.ageDays,
            },
          });
        }
      }
    }
  }

  return candidates;
}

// ---------- the one entry point ----------

/**
 * All candidates for one evaluation pass. Pure: same sources → same
 * candidates, always (§84 discipline carried into alerts).
 */
export function generateAlertCandidates(
  sources: {
    /** Business today (YYYY-MM-DD, tenant timezone) — dates.ts domain. */
    today: BusinessDate;
    rules: readonly AlertRule[];
    projects: readonly Project[];
    portfolio: readonly ProjectProfitability[];
    timeAggregates: ReadonlyMap<string, ProjectTimeAggregates>;
    expenseAggregates: ReadonlyMap<string, ProjectExpenseAggregates>;
    receivableInvoices: readonly ReceivableInvoiceRow[];
  }
): AlertCandidate[] {
  const projectById = new Map(sources.projects.map(p => [p.id, p]));
  const projectSources: ProjectAlertSource[] = sources.portfolio.flatMap(row => {
    const project = projectById.get(row.projectId);
    if (!project) return []; // engine row without a project — never alert on ghosts
    return [{
      row,
      status: project.status,
      time: sources.timeAggregates.get(row.projectId),
      expenses: sources.expenseAggregates.get(row.projectId),
    }];
  });
  return [
    ...generateProjectAlerts(projectSources, sources.rules),
    ...generateCashAlerts(sources.receivableInvoices, sources.rules, sources.today),
  ];
}
