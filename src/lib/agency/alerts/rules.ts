/**
 * Agency Vertical — Alerts: rule catalog (Module 15, §4/§8–§18/§22)
 *
 * CLIENT-SAFE: static catalog + pure helpers only.
 *
 * The catalog is the SINGLE source of truth for what each rule means:
 * its category (§23), entity type (§5), default severity (§7) and default
 * configuration thresholds (§8–§18). Severity is server-owned — a tenant
 * may override it via rule configuration, but the OVERRIDE is resolved
 * server-side in severity.ts; no frontend ever assigns severity.
 *
 * Cost-bearing rules (§114 privacy, Module 14): OVER_BUDGET and
 * MARGIN_BELOW_TARGET expose internal cost structure, so they are hidden
 * from sessions lacking agency.profitability.read. Severity COUNTS remain
 * safe — only the alert rows (and their amounts) are filtered.
 */
import type {
  AlertRuleType, AlertCategory, AlertEntityType, AlertRuleConfiguration,
} from './types';

/** One catalog entry: everything the generators need per rule type. */
export interface AlertRuleDefinition {
  type: AlertRuleType;
  /** §23 — the Alert Center filter axis. */
  category: AlertCategory;
  /** §5 — the entity the alert points at (drives click-through). */
  entityType: AlertEntityType;
  /** §7 — server-owned default severity. */
  defaultSeverity: 'INFO' | 'WARNING' | 'CRITICAL';
  /** §8–§18 — default thresholds (MAJOR units for amount, % for percentage). */
  defaults: AlertRuleConfiguration;
  /** Human label for the rules admin screen. */
  label: string;
}

/**
 * §4/§8–§18 — the 11 deterministic rules. Threshold semantics:
 *   HOURS bands       — utilization percent (plannedHours basis)
 *   OVER_BUDGET       — budget utilization percent (cost basis)
 *   MARGIN_BELOW_TARGET — margin percent vs the project's targetMargin
 *   UNBILLED_*        — value presence, not a threshold
 *   INVOICE_DUE_SOON  — days until due (default 7)
 *   INVOICE_OVERDUE   — any overdue open invoice
 *   LARGE_INVOICE_OVERDUE — due amount ≥ amount MAJOR units (default 1,00,000)
 *   COMPLETED_PROJECT_UNBILLED_WORK — unbilledAmount > 0 on a COMPLETED project
 */
export const ALERT_RULE_CATALOG: Readonly<Record<AlertRuleType, AlertRuleDefinition>> = {
  PROJECT_HOURS_75: {
    type: 'PROJECT_HOURS_75',
    category: 'PROJECTS',
    entityType: 'PROJECT',
    defaultSeverity: 'INFO',
    defaults: { percentage: 75 },
    label: 'Project hours past 75% of plan',
  },
  PROJECT_HOURS_80: {
    type: 'PROJECT_HOURS_80',
    category: 'PROJECTS',
    entityType: 'PROJECT',
    defaultSeverity: 'WARNING',
    defaults: { percentage: 80 },
    label: 'Project hours past 80% of plan',
  },
  PROJECT_HOURS_100: {
    type: 'PROJECT_HOURS_100',
    category: 'PROJECTS',
    entityType: 'PROJECT',
    defaultSeverity: 'CRITICAL',
    defaults: { percentage: 100 },
    label: 'Project hours exhausted',
  },
  PROJECT_OVER_BUDGET: {
    type: 'PROJECT_OVER_BUDGET',
    category: 'PROJECTS',
    entityType: 'PROJECT',
    defaultSeverity: 'CRITICAL',
    defaults: { percentage: 100 },
    label: 'Project delivery cost over budget',
  },
  PROJECT_MARGIN_BELOW_TARGET: {
    type: 'PROJECT_MARGIN_BELOW_TARGET',
    category: 'PROJECTS',
    entityType: 'PROJECT',
    defaultSeverity: 'WARNING',
    defaults: {},
    label: 'Project margin below target',
  },
  UNBILLED_APPROVED_TIME: {
    type: 'UNBILLED_APPROVED_TIME',
    category: 'BILLING',
    entityType: 'TIME',
    defaultSeverity: 'INFO',
    defaults: {},
    label: 'Approved unbilled time on a project',
  },
  UNBILLED_EXPENSE: {
    type: 'UNBILLED_EXPENSE',
    category: 'BILLING',
    entityType: 'EXPENSE',
    defaultSeverity: 'INFO',
    defaults: {},
    label: 'Approved unbilled expenses on a project',
  },
  INVOICE_DUE_SOON: {
    type: 'INVOICE_DUE_SOON',
    category: 'CASH',
    entityType: 'INVOICE',
    defaultSeverity: 'WARNING',
    defaults: { days: 7 },
    label: 'Invoice due soon',
  },
  INVOICE_OVERDUE: {
    type: 'INVOICE_OVERDUE',
    category: 'CASH',
    entityType: 'INVOICE',
    defaultSeverity: 'WARNING',
    defaults: {},
    label: 'Invoice overdue',
  },
  LARGE_INVOICE_OVERDUE: {
    type: 'LARGE_INVOICE_OVERDUE',
    category: 'CASH',
    entityType: 'INVOICE',
    defaultSeverity: 'CRITICAL',
    defaults: { amount: 100000 },
    label: 'Large invoice overdue',
  },
  COMPLETED_PROJECT_UNBILLED_WORK: {
    type: 'COMPLETED_PROJECT_UNBILLED_WORK',
    category: 'BILLING',
    entityType: 'PROJECT',
    defaultSeverity: 'CRITICAL',
    defaults: {},
    label: 'Completed project with unbilled work',
  },
};

/**
 * §114 — rules whose alert rows expose internal cost structure. Hidden at
 * the API and Command Center for sessions without agency.profitability.read
 * (severity counts stay visible; the records do not).
 */
const COST_BEARING_RULE_TYPES: readonly AlertRuleType[] = [
  'PROJECT_OVER_BUDGET',
  'PROJECT_MARGIN_BELOW_TARGET',
];

export function isCostBearingRuleType(type: AlertRuleType): boolean {
  return COST_BEARING_RULE_TYPES.includes(type);
}

/** §23 — category for a rule type (catalog is the single definition). */
export function categoryForRuleType(type: AlertRuleType): AlertCategory {
  return ALERT_RULE_CATALOG[type].category;
}

/** §5 — entityType for a rule type. */
export function entityTypeForRuleType(type: AlertRuleType): AlertEntityType {
  return ALERT_RULE_CATALOG[type].entityType;
}

/**
 * Resolve the effective configuration for a stored rule: catalog defaults
 * overlaid by the tenant's persisted overrides. Generator threshold reads
 * go through this so a missing/empty configuration can never break a rule.
 */
export function effectiveRuleConfiguration(rule: {
  type: AlertRuleType;
  configuration: AlertRuleConfiguration;
}): AlertRuleConfiguration {
  const definition = ALERT_RULE_CATALOG[rule.type];
  return { ...definition.defaults, ...rule.configuration };
}

/**
 * §6 — the dedupe fingerprint: tenantId:ruleType:entityType:entityId.
 * Stable per (tenant, rule, entity) triple, unique INDEXED in the database,
 * so a re-evaluation updates the same logical alert instead of stacking
 * duplicates. Hours bands get separate fingerprints by ruleType — that is
 * what makes band transitions resolve/open cleanly.
 */
export function buildFingerprint(
  tenantId: string,
  ruleType: AlertRuleType,
  entityType: AlertEntityType,
  entityId: string
): string {
  return `${tenantId}:${ruleType}:${entityType}:${entityId}`;
}
