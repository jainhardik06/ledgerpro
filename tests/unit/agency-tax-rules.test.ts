/**
 * Module 11 (Sprints 11.4–11.7 / §10–§22, §30) — Unit: tax engine + rules layer.
 *
 * Pure tests, no db mocks. Pins the §30 test list:
 *   - CGST+SGST (intra-state) and IGST (inter-state) structure suggestions,
 *     including the §15 rule that the STORED place of supply is the primary
 *     basis — never "same state" guessed from recipient alone.
 *   - The §11 tax line type: passthrough, absent→OTHER, invalid→throw,
 *     metadata (rules-version provenance) passthrough.
 *   - The §22 example: 100000 + 18% GST = 118000 through the ENGINE pipeline
 *     (lines → subtotal → taxable → tax → total), never GST from a raw total.
 *   - Zero-tax / exempt: rate 0 is a legitimate ₹0 line, not a failed calc.
 *   - Rounding: each tax line rounds independently half-up at minor units.
 *   - SAC/HSN classification validation — never defaulted.
 *   - Place of supply / reverse charge / exemption validators (§15–§17).
 *   - Withholding (§18–§21): rule validation, effective dating (the 2026-04-01
 *     Income Tax Act 2025 boundary), threshold + jurisdiction matching, and
 *     THE §19 rule: a 2026-config must not assume 194J — nothing is ever
 *     suggested that the tenant did not configure.
 */
import { describe, expect, it } from 'vitest';
import { suggestGstStructure, suggestWithholding, TAX_RULES_VERSION } from '@/lib/agency/domain/tax-rules';
import {
  calculateTax, calculateInvoiceTotals, recalculateInvoice,
} from '@/lib/agency/domain/invoice-calculation';
import { makeMoney } from '@/lib/agency/types/money';
import {
  isWithholdingRuleEffective, findEffectiveWithholdingRules,
  type WithholdingRule,
} from '@/lib/agency/types/withholding';
import {
  validateTaxLineInputs, validatePlaceOfSupply, validateReverseCharge,
  validateExemption, validateClassification,
  validateWithholdingRuleCreate, validateWithholdingRuleUpdate,
} from '@/lib/agency/validators/tax';

// ---------- §30 — CGST + SGST vs IGST ----------

describe('Module 11 §30 — GST structure suggestion (rules layer)', () => {
  it('intra-state: same supplier and place of supply → CGST + SGST at rate/2', () => {
    const s = suggestGstStructure({ supplierState: 'Maharashtra', placeOfSupplyState: 'Maharashtra', rate: 18 });
    expect(s.structure).toBe('INTRA_STATE');
    expect(s.taxes).toEqual([
      { type: 'CGST', name: 'CGST', rate: 9 },
      { type: 'SGST', name: 'SGST', rate: 9 },
    ]);
    expect(s.rulesVersion).toBe(TAX_RULES_VERSION);
  });

  it('inter-state: differing states → IGST at the full rate', () => {
    const s = suggestGstStructure({ supplierState: 'Maharashtra', recipientState: 'Karnataka', rate: 18 });
    expect(s.structure).toBe('INTER_STATE');
    expect(s.taxes).toEqual([{ type: 'IGST', name: 'IGST', rate: 18 }]);
  });

  it('§15 — the STORED place of supply is the primary basis, overriding the recipient state', () => {
    // Supplier Maharashtra, recipient Karnataka — but the stored place of
    // supply is Maharashtra: the s.10 mechanism says intra-state.
    const s = suggestGstStructure({
      supplierState: 'Maharashtra', recipientState: 'Karnataka',
      placeOfSupplyState: 'Maharashtra', rate: 18,
    });
    expect(s.structure).toBe('INTRA_STATE');
    // And the mirror: same recipient, place of supply elsewhere → IGST.
    const i = suggestGstStructure({
      supplierState: 'Maharashtra', recipientState: 'Maharashtra',
      placeOfSupplyState: 'Karnataka', rate: 18,
    });
    expect(i.structure).toBe('INTER_STATE');
  });

  it('state comparison is case/whitespace tolerant', () => {
    const s = suggestGstStructure({ supplierState: ' maharashtra ', placeOfSupplyState: 'MAHARASHTRA', rate: 18 });
    expect(s.structure).toBe('INTRA_STATE');
  });

  it('falls back to the recipient state when no place of supply is stored', () => {
    const s = suggestGstStructure({ supplierState: 'Maharashtra', recipientState: 'Maharashtra', rate: 12 });
    expect(s.structure).toBe('INTRA_STATE');
    expect(s.taxes.map(t => t.rate)).toEqual([6, 6]);
  });

  it('rejects invalid rates and missing state configuration', () => {
    expect(() => suggestGstStructure({ supplierState: 'Maharashtra', rate: -1 })).toThrow();
    expect(() => suggestGstStructure({ supplierState: 'Maharashtra', rate: 101 })).toThrow();
    expect(() => suggestGstStructure({ supplierState: 'Maharashtra', rate: Number.NaN })).toThrow();
    // No stored state facts at all — nothing to suggest FROM (§15).
    expect(() => suggestGstStructure({ recipientState: 'Karnataka', rate: 18 })).toThrow(/place of supply or supplier state/);
  });
});

// ---------- §30 — tax line type through the engine ----------

describe('Module 11 §11/§30 — tax line types in calculateTax', () => {
  const base = makeMoney(100000);

  it('passes a valid component type through', () => {
    const [line] = calculateTax(base, [{ type: 'IGST', name: 'IGST', rate: 18 }]);
    expect(line.type).toBe('IGST');
    expect(line.amount.amount).toBe(18000);
  });

  it('an absent type resolves to OTHER (a legacy {name, rate} line stays valid)', () => {
    const [line] = calculateTax(base, [{ name: 'VAT', rate: 20 }]);
    expect(line.type).toBe('OTHER');
  });

  it('an invalid type is a real error, never a silent default', () => {
    expect(() => calculateTax(base, [{ type: 'IGST+', name: 'IGST', rate: 18 } as never])).toThrow(/Invalid tax line type/);
  });

  it('metadata (rules-version provenance) passes through untouched', () => {
    const [line] = calculateTax(base, [{ type: 'CGST', name: 'CGST', rate: 9, metadata: { rulesVersion: TAX_RULES_VERSION } }]);
    expect(line.metadata).toEqual({ rulesVersion: TAX_RULES_VERSION });
  });

  it('zero rate is a legitimate ₹0 line, not a failed calculation (§17 spirit)', () => {
    const [line] = calculateTax(base, [{ type: 'IGST', name: 'IGST', rate: 0 }]);
    expect(line.amount.amount).toBe(0);
  });

  it('each line rounds independently half-up at minor units (§76)', () => {
    const taxable = makeMoney(100.06); // 10006 minor units
    const lines = calculateTax(taxable, [
      { type: 'CGST', name: 'CGST', rate: 9 },
      { type: 'SGST', name: 'SGST', rate: 9 },
    ]);
    // 100.06 × 9% = ₹9.0054 → ₹9.01 each (900.54 minor → 901, half-up),
    // never the raw 9.0054 summed.
    expect(lines[0].amount.amount).toBe(9.01);
    expect(lines[1].amount.amount).toBe(9.01);
  });
});

// ---------- §30 — the §22 worked example through the pipeline ----------

describe('Module 11 §22 — 100000 + 18% GST = 118000 (engine pipeline)', () => {
  it('computes GST from the taxable pipeline, never from a raw total', () => {
    const calc = calculateInvoiceTotals({
      lines: [{ amount: makeMoney(60000) }, { amount: makeMoney(40000) }],
      taxes: [{ type: 'IGST', name: 'IGST', rate: 18 }],
    });
    expect(calc.subtotal.amount).toBe(100000);
    expect(calc.taxableAmount.amount).toBe(100000);
    expect(calc.taxLines).toHaveLength(1);
    expect(calc.taxTotal.amount).toBe(18000);
    expect(calc.total.amount).toBe(118000);
  });

  it('the discount is deducted BEFORE tax — tax never applies to the gross (§12)', () => {
    const calc = recalculateInvoice({
      lines: [{ amount: makeMoney(100000) }],
      discountAmount: 10000,
      taxes: [{ type: 'IGST', name: 'IGST', rate: 18 }],
    });
    expect(calc.taxableAmount.amount).toBe(90000);
    expect(calc.taxTotal.amount).toBe(16200);
    expect(calc.total.amount).toBe(106200);
    expect(calc.amountDue.amount).toBe(106200);
  });

  it('intra-state 18% is CGST 9 + SGST 9 summing to the same 18%', () => {
    const calc = calculateInvoiceTotals({
      lines: [{ amount: makeMoney(100000) }],
      taxes: [
        { type: 'CGST', name: 'CGST', rate: 9 },
        { type: 'SGST', name: 'SGST', rate: 9 },
      ],
    });
    expect(calc.taxTotal.amount).toBe(18000);
    expect(calc.total.amount).toBe(118000);
  });
});

// ---------- §30 — HSN/SAC classification ----------

describe('Module 11 §13/§14/§30 — HSN/SAC classification validation', () => {
  it('accepts a SAC code (e.g. 998314 — IT consulting)', () => {
    const v = validateClassification({ type: 'SAC', code: '998314' });
    expect(v.ok).toBe(true);
    expect(v.value).toEqual({ type: 'SAC', code: '998314' });
  });

  it('accepts an HSN code and rejects anything outside HSN|SAC', () => {
    expect(validateClassification({ type: 'HSN', code: '8542' }).ok).toBe(true);
    expect(validateClassification({ type: 'TARIFF', code: '8542' }).ok).toBe(false);
    expect(validateClassification('SAC 998314').ok).toBe(false);
  });

  it('the code is required and bounded — never defaulted', () => {
    expect(validateClassification({ type: 'SAC' }).ok).toBe(false);
    expect(validateClassification({ type: 'SAC', code: '' }).ok).toBe(false);
    expect(validateClassification({ type: 'SAC', code: 'x'.repeat(21) }).ok).toBe(false);
  });
});

// ---------- §30 — place of supply / reverse charge / exemption ----------

describe('Module 11 §15–§17/§30 — compliance configuration validators', () => {
  it('place of supply: stored as configuration (§15), absent = untouched, null = clear', () => {
    const ok = validatePlaceOfSupply({ country: 'IN', stateOrRegion: 'Karnataka', code: '29' });
    expect(ok.ok).toBe(true);
    expect(ok.value).toEqual({ country: 'IN', stateOrRegion: 'Karnataka', code: '29' });
    expect(validatePlaceOfSupply(undefined).value).toBeUndefined();
    expect(validatePlaceOfSupply(null).value).toBeNull();
  });

  it('place of supply: country + stateOrRegion required, bounded', () => {
    expect(validatePlaceOfSupply({ stateOrRegion: 'Karnataka' }).ok).toBe(false);
    expect(validatePlaceOfSupply({ country: 'IN' }).ok).toBe(false);
    expect(validatePlaceOfSupply({ country: 'I'.repeat(101), stateOrRegion: 'Karnataka' }).ok).toBe(false);
  });

  it('reverse charge: a plain boolean — no intelligence (§16)', () => {
    expect(validateReverseCharge({ applicable: true }).value).toEqual({ applicable: true });
    expect(validateReverseCharge({ applicable: false }).value).toEqual({ applicable: false });
    expect(validateReverseCharge(undefined).value).toBeUndefined();
    expect(validateReverseCharge({ applicable: 'yes' }).ok).toBe(false);
  });

  it('exemption: reason required; tax ₹0 without pretending the calculation failed (§17)', () => {
    const v = validateExemption({ reason: 'Export of service — zero-rated' });
    expect(v.ok).toBe(true);
    expect(v.value).toEqual({ reason: 'Export of service — zero-rated' });
    expect(validateExemption({ reference: 'LUT 2026' }).ok).toBe(false);
    expect(validateExemption({ reason: '' }).ok).toBe(false);
    expect(validateExemption(null).value).toBeNull();
  });

  it('tax line inputs: capped at 10 lines; type/name/rate rules apply', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ name: `T${i}`, rate: 1 }));
    expect(validateTaxLineInputs(many).ok).toBe(false);
    expect(validateTaxLineInputs([{ type: 'IGST', name: 'IGST', rate: 18 }]).value)
      .toEqual([{ type: 'IGST', name: 'IGST', rate: 18 }]);
    expect(validateTaxLineInputs([{ name: 'IGST', rate: 18 }]).value)
      .toEqual([{ name: 'IGST', rate: 18 }]); // type optional on input
    expect(validateTaxLineInputs([{ type: 'IGST+', name: 'IGST', rate: 18 }]).ok).toBe(false);
    expect(validateTaxLineInputs([{ name: 'IGST', rate: 150 }]).ok).toBe(false);
  });
});

// ---------- §30 — withholding: effective dating + the no-194J rule ----------

function rule(overrides: Partial<WithholdingRule> = {}): WithholdingRule {
  return {
    id: 'rule-1', tenantId: 'tenant-a', jurisdiction: 'IN',
    effectiveFrom: '2026-04-01',
    ruleCode: 'IT Act 2025 — TDS on services', rate: 2, threshold: 30000,
    active: true, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('Module 11 §19/§30 — withholding rule configuration', () => {
  it('create requires jurisdiction, effectiveFrom, ruleCode and rate', () => {
    expect(validateWithholdingRuleCreate({
      jurisdiction: 'in', effectiveFrom: '2026-04-01', ruleCode: 'IT Act 2025 — TDS', rate: 2,
    }).value).toMatchObject({ jurisdiction: 'IN', effectiveFrom: '2026-04-01', rate: 2 });

    expect(validateWithholdingRuleCreate({ jurisdiction: 'IN', ruleCode: 'x', rate: 2 }).ok).toBe(false);
    expect(validateWithholdingRuleCreate({ effectiveFrom: '2026-04-01', ruleCode: 'x', rate: 2 }).ok).toBe(false);
    expect(validateWithholdingRuleCreate({ jurisdiction: 'IN', effectiveFrom: '2026-04-01', rate: 2 }).ok).toBe(false);
    expect(validateWithholdingRuleCreate({ jurisdiction: 'IN', effectiveFrom: '2026-04-01', ruleCode: 'x' }).ok).toBe(false);
    expect(validateWithholdingRuleCreate({ jurisdiction: 'IN', effectiveFrom: '2026-04-01', ruleCode: 'x', rate: 200 }).ok).toBe(false);
  });

  it('update is partial; null clears the window end / threshold; empty is rejected', () => {
    const v = validateWithholdingRuleUpdate({ rate: 5, effectiveTo: null });
    expect(v.ok).toBe(true);
    expect(v.value).toEqual({ rate: 5, effectiveTo: null });
    expect(validateWithholdingRuleUpdate({}).ok).toBe(false);
    expect(validateWithholdingRuleUpdate({ effectiveTo: '2026-03-31' }).ok).toBe(true);
    expect(validateWithholdingRuleUpdate({ effectiveFrom: '2026-05-01', effectiveTo: '2026-04-01' }).ok).toBe(false);
  });

  it('effective dating: the Income Tax Act 2025 boundary (2026-04-01)', () => {
    const r = rule(); // effective 2026-04-01, open-ended
    expect(isWithholdingRuleEffective(r, '2026-03-31')).toBe(false); // the day before
    expect(isWithholdingRuleEffective(r, '2026-04-01')).toBe(true);  // the first day
    expect(isWithholdingRuleEffective(r, '2027-01-15')).toBe(true);
    // A window that closed.
    expect(isWithholdingRuleEffective(rule({ effectiveTo: '2026-09-30' }), '2026-10-01')).toBe(false);
    // Inactive rules never bite.
    expect(isWithholdingRuleEffective(rule({ active: false }), '2026-04-01')).toBe(false);
    expect(findEffectiveWithholdingRules(
      [rule(), rule({ active: false }), rule({ effectiveFrom: '2027-04-01' })],
      '2026-06-01'
    )).toHaveLength(1);
  });
});

describe('Module 11 §19/§20/§30 — suggestWithholding (configuration only)', () => {
  it('§30 — a 2026-config must NOT assume 194J: nothing is suggested without a configured rule', () => {
    // Classic 194J shape (professional fees, ₹100000) with ZERO configured
    // rules → NO suggestion. There is no baked-in section anywhere.
    const out = suggestWithholding({ rules: [], onDate: '2026-06-01', jurisdiction: 'IN', baseValue: 100000, currency: 'INR' });
    expect(out).toEqual([]);
    // And the rule code is opaque data: a 2025-Act code behaves identically
    // to any other string — the layer matches jurisdiction/date/threshold,
    // never a section number.
    const out2 = suggestWithholding({
      rules: [rule({ ruleCode: '194J' })], onDate: '2026-06-01', jurisdiction: 'IN',
      baseValue: 100000, currency: 'INR',
    });
    expect(out2).toHaveLength(1);
    expect(out2[0].adjustment.code).toBe('194J'); // recorded because CONFIGURED
  });

  it('matches jurisdiction, effective date and threshold; computes the withheld amount', () => {
    const rules = [
      rule({ id: 'us', jurisdiction: 'US', rate: 30 }),
      rule({ id: 'before', effectiveFrom: '2025-04-01', effectiveTo: '2026-03-31', rate: 10 }),
      rule({ id: 'match', rate: 2, threshold: 30000 }),
    ];
    const out = suggestWithholding({ rules, onDate: '2026-06-01', jurisdiction: 'IN', baseValue: 100000, currency: 'INR' });
    expect(out).toHaveLength(1);
    expect(out[0].rule.id).toBe('match');
    expect(out[0].amount.amount).toBe(2000); // 100000 × 2%
    expect(out[0].adjustment).toMatchObject({
      type: 'TDS', code: out[0].rule.ruleCode, rate: 2, jurisdiction: 'IN',
    });
    expect(out[0].rulesVersion).toBe(TAX_RULES_VERSION);
  });

  it('below the threshold the rule does not bite', () => {
    const out = suggestWithholding({
      rules: [rule({ threshold: 30000 })], onDate: '2026-06-01',
      jurisdiction: 'IN', baseValue: 29999, currency: 'INR',
    });
    expect(out).toEqual([]);
    // A rule without a threshold applies at any value.
    const out2 = suggestWithholding({
      rules: [rule({ threshold: undefined })], onDate: '2026-06-01',
      jurisdiction: 'IN', baseValue: 1, currency: 'INR',
    });
    expect(out2).toHaveLength(1);
  });

  it('rounds the withheld amount to whole minor units', () => {
    const out = suggestWithholding({
      rules: [rule({ rate: 2, threshold: undefined })], onDate: '2026-06-01',
      jurisdiction: 'IN', baseValue: 100.01, currency: 'INR',
    });
    expect(out[0].amount.amount).toBe(2); // 2.0002 → 2
  });
});
