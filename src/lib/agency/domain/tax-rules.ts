/**
 * Module 11 (§15/§28) — the versioned tax determination RULES LAYER.
 *
 * This module is deliberately NOT tax calculation (the engine multiplies,
 * invoice-calculation.ts §78 is the only formula source) and NOT storage
 * (§15: Money OS stores the result/configuration used; determination is this
 * separate layer). It exists to ANSWER, from stored configuration:
 *
 *   1. GST structure — given the supplier's and recipient's stored state and
 *      the invoice's stored place of supply, does the standard IGST Act
 *      Section 10 mechanism suggest intra-state (CGST+SGST) or inter-state
 *      (IGST)?
 *   2. Withholding — which effective-dated §19 rule rows are candidates for
 *      a given date/jurisdiction/value? The caller records WHAT IT DECIDED.
 *
 * Boundary rules (binding, §15):
 *   - Output is an ADVISORY SUGGESTION the caller confirms and stores — the
 *     suggestion never writes anything.
 *   - Inputs are STORED VALUES (states, place of supply, rule rows) — the
 *     layer never fetches or mutates data.
 *   - Version: TAX_RULES_VERSION tags every suggestion so the §25 compliance
 *     snapshot can freeze WHICH rules produced an invoice's tax lines.
 *   - Pure functions only: no db, no server imports — unit-testable.
 */
import type { Money } from '../types/money';
import type { InvoiceTaxLineInput } from '../types/invoice';
import {
  isWithholdingRuleEffective,
  type WithholdingAdjustment,
  type WithholdingRule,
} from '../types/withholding';

/** §25 — the rules layer's version tag, frozen into every snapshot. */
export const TAX_RULES_VERSION = 'gst-rules-2026.1';

// ---------- §10 GST structure suggestion ----------

/** The §10 mechanism outcome the rules layer suggests. */
export type GstSupplyStructure = 'INTRA_STATE' | 'INTER_STATE';

export interface GstStructureSuggestion {
  structure: GstSupplyStructure;
  /** The tax line INPUTS to confirm (§11: type + name + rate each). */
  taxes: InvoiceTaxLineInput[];
  /** Human-readable basis — the stored facts the suggestion used. */
  basis: string;
  rulesVersion: string;
}

/** §10 — states (any case, trimmed) match → intra-state suggestion. */
function sameState(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * §10/§15 — suggest the GST structure for a supply. The caller passes the
 * STORED facts (supplier state, recipient state, place of supply state, GST
 * rate). INTRA_STATE splits the rate into CGST + SGST at rate/2;
 * INTER_STATE suggests IGST at the full rate.
 *
 * This is the standard IGST Act Section 10 place-of-supply mechanism applied
 * to STORED configuration — it is a suggestion the caller confirms, never a
 * determination Money OS asserts on its own.
 */
export function suggestGstStructure(input: {
  supplierState?: string;
  recipientState?: string;
  /** §15 — the invoice's stored place-of-supply state, when configured. */
  placeOfSupplyState?: string;
  /** The combined GST rate as a percentage (18 = 18%). */
  rate: number;
}): GstStructureSuggestion {
  if (typeof input.rate !== 'number' || !Number.isFinite(input.rate) || input.rate < 0 || input.rate > 100) {
    throw new Error(`[TaxRules] Invalid GST rate: ${input.rate}`);
  }
  // §15 — the stored place of supply is the primary basis when present; the
  // supplier/recipient states are the fallback inputs. Without any state
  // configuration there is nothing to suggest FROM.
  const posState = input.placeOfSupplyState?.trim();
  const supplierState = input.supplierState?.trim();
  const recipientState = input.recipientState?.trim();
  if (!posState && !supplierState) {
    throw new Error('[TaxRules] Cannot suggest a GST structure without a place of supply or supplier state');
  }
  const intra = sameState(supplierState, posState || recipientState);
  if (intra) {
    const half = input.rate / 2;
    return {
      structure: 'INTRA_STATE',
      taxes: [
        { type: 'CGST', name: 'CGST', rate: half },
        { type: 'SGST', name: 'SGST', rate: half },
      ],
      basis: `Supplier ${supplierState ?? '(unspecified)'} and place of supply ${posState || recipientState} are the same state — CGST + SGST at ${half}% each (IGST Act s.10 mechanism on stored configuration)`,
      rulesVersion: TAX_RULES_VERSION,
    };
  }
  return {
    structure: 'INTER_STATE',
    taxes: [{ type: 'IGST', name: 'IGST', rate: input.rate }],
    basis: `Supplier ${supplierState ?? '(unspecified)'} and place of supply ${posState || recipientState || '(unspecified)'} differ — IGST at ${input.rate}% (IGST Act s.10 mechanism on stored configuration)`,
    rulesVersion: TAX_RULES_VERSION,
  };
}

// ---------- §19/§20 withholding rule evaluation ----------

export interface WithholdingSuggestion {
  rule: WithholdingRule;
  /** The withheld Money the rule implies for the given base. */
  amount: Money;
  /** §20 — the adjustment record the caller may persist with the payment. */
  adjustment: WithholdingAdjustment;
  rulesVersion: string;
}

/**
 * §19 — match the tenant's rule rows against a payment: effective on the
 * received date (date window + active flag), in the given jurisdiction, and
 * above the single-value threshold when one is configured. Returns
 * suggestions in stored order; the caller records WHAT IT DECIDED (§20) —
 * this layer never writes.
 *
 * The rule CODE is opaque configuration data here. There is no hard-coded
 * legacy section number anywhere (§19): for transactions on or after
 * 2026-04-01 the codes the tenant configures come from the Income Tax Act,
 * 2025 framework — which is precisely why they are data.
 */
export function suggestWithholding(input: {
  rules: WithholdingRule[];
  /** YYYY-MM-DD — the date the withholding applies on. */
  onDate: string;
  jurisdiction: string;
  /** The value the threshold is tested against (major units). */
  baseValue: number;
  currency: string;
}): WithholdingSuggestion[] {
  const out: WithholdingSuggestion[] = [];
  for (const rule of input.rules) {
    if (rule.jurisdiction !== input.jurisdiction) continue;
    if (!isWithholdingRuleEffective(rule, input.onDate)) continue;
    if (rule.threshold !== undefined && input.baseValue < rule.threshold) continue;
    const amount = Math.round(input.baseValue * rule.rate) / 100;
    out.push({
      rule,
      amount: { amount, currency: input.currency },
      adjustment: {
        type: 'TDS',
        code: rule.ruleCode,
        amount: { amount, currency: input.currency },
        rate: rule.rate,
        jurisdiction: rule.jurisdiction,
        recordedAt: new Date(),
      },
      rulesVersion: TAX_RULES_VERSION,
    });
  }
  return out;
}
