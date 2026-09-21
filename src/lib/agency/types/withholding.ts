/**
 * Agency Vertical — Types: withholding / TDS (Module 11, spec §18–§21)
 *
 * CLIENT-SAFE: types and pure functions only. No server imports.
 *
 * Withholding is SEPARATE from GST (§18). It never appears as a negative tax
 * line, never alters invoice.total (§21), and attaches to the Payment /
 * Settlement layer (§20) as a WithholdingAdjustment record.
 *
 * §19 — THE binding rule: there is NO hard-coded rate or legacy section
 * number (194C/194J/194H…) anywhere in the product. Everything about a
 * withholding obligation is CONFIGURATION in effective-dated WithholdingRule
 * rows the tenant manages. For transactions on or after 2026-04-01 the
 * applicable references come from the Income Tax Act, 2025 framework — which
 * is exactly why the rule CODE is data, never code.
 */
import type { Money } from './money';

// ---------- §19 — effective-dated rule configuration ----------

/**
 * One withholding rule as configured by the tenant. `rate` is a percentage
 * (2 = 2%). `threshold` (major units, invoice currency) is the single-value
 * bound below which the rule does not bite — when absent the rule applies at
 * any value. `conditions` is free-form config (e.g. recipient type) — Phase 1
 * stores and surfaces it; it does not evaluate it.
 */
export interface WithholdingRule {
  id: string;
  tenantId: string;
  /** 'IN', 'US', … — the jurisdiction whose regime the rule belongs to. */
  jurisdiction: string;
  /** Inclusive first day the rule applies (YYYY-MM-DD). */
  effectiveFrom: string;
  /** Inclusive last day; absent = open-ended. */
  effectiveTo?: string;
  /** The configured code — e.g. a 2025-Act reference. DATA, never logic. */
  ruleCode: string;
  rate: number;
  threshold?: number;
  conditions?: Record<string, unknown>;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * §19 — is a rule in force on a business date? Pure: the date window and the
 * active flag only. Jurisdiction/threshold matching is the caller's
 * (rules-layer) concern.
 */
export function isWithholdingRuleEffective(rule: WithholdingRule, onDate: string): boolean {
  if (!rule.active) return false;
  if (rule.effectiveFrom > onDate) return false;
  if (rule.effectiveTo !== undefined && onDate > rule.effectiveTo) return false;
  return true;
}

/** §19 — the rules in force on a date, in stored order. */
export function findEffectiveWithholdingRules(
  rules: WithholdingRule[],
  onDate: string
): WithholdingRule[] {
  return rules.filter(r => isWithholdingRuleEffective(r, onDate));
}

// ---------- §20 — the settlement-layer record ----------

/**
 * The withholding record attached to a Payment (§20). `amount` is the withheld
 * Money — the same value the payment's §92 withholdingAmount carries; the
 * adjustment adds the WHY (type/code/rate/jurisdiction/reference). It is
 * recorded fact, never a suggestion and never a negative tax line.
 */
export interface WithholdingAdjustment {
  /** 'TDS', 'WHT', … — jurisdiction vocabulary, free-form bounded string. */
  type: string;
  /** The rule code recorded (§19 — configuration data). */
  code?: string;
  amount: Money;
  rate?: number;
  jurisdiction?: string;
  reference?: string;
  recordedAt: Date;
  notes?: string;
}
