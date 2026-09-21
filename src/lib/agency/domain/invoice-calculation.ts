/**
 * Agency Vertical — Domain: invoice calculation engine (Module 9, §77/§78/§127)
 *
 * THE shared calculation service for invoice money (§127: calculation lives
 * in the engine, NEVER in React components, API routes, reports or PDFs).
 * Pure functions — no db, no server imports, fully unit-testable. The
 * finalize action (9E) and the draft composer both call THESE functions;
 * they never re-derive a total.
 *
 * The §77 pipeline, in order:
 *
 *   Lines → line amounts → Subtotal → Taxable amount (subtotal − discount)
 *   → Tax calculation (per-line) → Tax lines → Total → Balance
 *
 * Rules encoded (binding):
 *
 *   §44/§77  Rounding happens ONCE per boundary — never mid-sum. All
 *            arithmetic goes through money.ts minor-unit helpers.
 *   §76      Tax is LINES (name/code/rate/taxableAmount/amount), each
 *            rounded independently half-up; the invoice's taxTotal is the
 *            sum of the ROUNDED lines, so totals always equal what is
 *            displayed.
 *   §78      calculateLineAmount / calculateSubtotal / calculateTax /
 *            calculateInvoiceTotals / calculateInvoiceBalance are the ONLY
 *            forms of these formulas anywhere in the product.
 *   Money    mixed currencies throw (money.ts rule) — the invoice is
 *            single-currency by construction (the domain validates every
 *            line's currency against the invoice before calling here).
 *   §129     amountDue ≥ 0 always; an overpaying input is an error, never a
 *            negative balance (Module 10 rejects overpayments at its edge).
 */
import type { Money } from '../types/money';
import { makeMoney, multiplyMoney, addMoney, subtractMoney, zeroMoney } from '../types/money';
import type { InvoiceTaxLine, InvoiceTaxLineInput, InvoiceTaxLineType } from '../types/invoice';
import { isInvoiceTaxLineType } from '../types/invoice';

// ---------- §78 line / subtotal ----------

/**
 * §78 — one line's money value. When quantity AND unitPrice are both
 * present the amount is quantity × unitPrice (minor-unit multiplication,
 * one rounding at this boundary — 42 × ₹2,500.50 has no drift); otherwise
 * the line's stored amount IS the value (source-backed lines freeze their
 * amounts at add-time — §49 expense charge, §23 time economics, §73 frozen
 * milestone value).
 */
export function calculateLineAmount(line: {
  quantity?: number;
  unitPrice?: Money;
  amount: Money;
}): Money {
  if (line.quantity !== undefined && line.unitPrice !== undefined) {
    if (line.quantity < 0) throw new Error(`[Invoice] Negative quantity: ${line.quantity}`);
    if (line.unitPrice.currency !== line.amount.currency) {
      throw new Error(`[Invoice] Mixed currencies: ${line.unitPrice.currency} vs ${line.amount.currency}`);
    }
    return multiplyMoney(line.unitPrice, line.quantity);
  }
  return line.amount;
}

/** §77 — Σ line amounts. Single currency (mixed throws, money.ts rule). */
export function calculateSubtotal(
  lines: Array<{ quantity?: number; unitPrice?: Money; amount: Money }>
): Money {
  if (lines.length === 0) return { amount: 0, currency: 'INR' };
  return addMoney(...lines.map(calculateLineAmount));
}

// ---------- §77 discount / taxable ----------

export const MAX_INVOICE_DISCOUNT_PERCENT = 100;

/**
 * §77 — the invoice-level discount. A raw amount (not a percentage — the
 * wizard computes the amount from any percentage input before it reaches
 * here, through this same function). Must satisfy 0 ≤ discount ≤ subtotal:
 * a discount larger than the bill is a caller bug, never a negative
 * taxable amount.
 */
export function calculateDiscount(subtotal: Money, discountAmount: number): Money {
  if (discountAmount < 0) throw new Error(`[Invoice] Negative discount: ${discountAmount}`);
  const discount = makeMoney(discountAmount, subtotal.currency);
  if (discount.amount > subtotal.amount) {
    throw new Error(`[Invoice] Discount ${discount.amount} exceeds subtotal ${subtotal.amount}`);
  }
  return discount;
}

/** §77 — subtotal − discount; the base tax is computed on. */
export function calculateTaxableAmount(subtotal: Money, discount: Money): Money {
  if (subtotal.currency !== discount.currency) {
    throw new Error(`[Invoice] Mixed currencies: ${subtotal.currency} vs ${discount.currency}`);
  }
  return makeMoney(subtractMoney(subtotal, discount), subtotal.currency);
}

// ---------- §76/§77 tax ----------

export const MAX_TAX_RATE_PERCENT = 100;

/**
 * §76 — compute the tax LINES for a taxable amount. Each line rounds
 * independently half-up (money.ts minor units); the caller sums the ROUNDED
 * amounts — the invoice always displays exactly what it totals. rate is a
 * percentage (18 = 18%). Regime choice (CGST+SGST vs IGST etc.) is the
 * caller's; this engine multiplies.
 *
 * Module 11 §11 — a line's `type` (CGST/SGST/IGST/CESS) is validated when
 * present and resolved to OTHER when absent, so a legacy {name, rate} line
 * stays valid while Indian invoices carry their components. `metadata`
 * passes through untouched — the rules layer (§15/§28) stamps its version
 * there and the §25 snapshot reads it back.
 */
export function calculateTax(
  taxableAmount: Money,
  inputs: InvoiceTaxLineInput[]
): InvoiceTaxLine[] {
  return inputs.map(input => {
    if (!input.name || input.name.trim() === '') {
      throw new Error('[Invoice] Tax line name is required');
    }
    if (typeof input.rate !== 'number' || !Number.isFinite(input.rate) || input.rate < 0 || input.rate > MAX_TAX_RATE_PERCENT) {
      throw new Error(`[Invoice] Invalid tax rate: ${input.rate}`);
    }
    let type: InvoiceTaxLineType = 'OTHER';
    if (input.type !== undefined) {
      if (!isInvoiceTaxLineType(input.type)) {
        throw new Error(`[Invoice] Invalid tax line type: ${String(input.type)}`);
      }
      type = input.type;
    }
    return {
      type,
      name: input.name.trim(),
      ...(input.code !== undefined && input.code !== '' && { code: input.code }),
      rate: input.rate,
      ...(input.metadata !== undefined && { metadata: input.metadata }),
      taxableAmount,
      amount: multiplyMoney(taxableAmount, input.rate / 100),
    };
  });
}

/** §77 — total = taxable + Σ rounded tax amounts. */
export function calculateTotal(taxableAmount: Money, taxLines: InvoiceTaxLine[]): Money {
  const taxTotal = taxLines.length > 0
    ? addMoney(...taxLines.map(t => t.amount))
    : zeroMoney(taxableAmount.currency);
  return addMoney(taxableAmount, taxTotal);
}

// ---------- §58/§129 balance ----------

/**
 * §58/§129 — the balance pair from the payment side. amountDue = total −
 * amountPaid, which must be ≥ 0 (overpayment is Module 10's rejected 400;
 * the engine stays the invariant's last guard). The status transition
 * (SENT → PARTIALLY_PAID → PAID) is the domain's, driven by this pair.
 */
export function calculateInvoiceBalance(
  total: Money,
  amountPaid: Money
): { amountPaid: Money; amountDue: Money } {
  if (total.currency !== amountPaid.currency) {
    throw new Error(`[Invoice] Mixed currencies: ${total.currency} vs ${amountPaid.currency}`);
  }
  const due = subtractMoney(total, amountPaid);
  if (due < 0) {
    throw new Error(`[Invoice] amountPaid ${amountPaid.amount} exceeds total ${total.amount}`);
  }
  return { amountPaid, amountDue: makeMoney(due, total.currency) };
}

// ---------- §77 composite ----------

/** The engine's full output — everything an invoice stores about money. */
export interface InvoiceCalculation {
  subtotal: Money;
  discount: Money;
  taxableAmount: Money;
  taxLines: InvoiceTaxLine[];
  taxTotal: Money;
  total: Money;
}

/**
 * §77 — the pipeline in one call: lines → subtotal → taxable → tax lines →
 * total. This is what draft edits and finalization BOTH run; the stored
 * invoice fields are this result, never a parallel computation.
 */
export function calculateInvoiceTotals(input: {
  lines: Array<{ quantity?: number; unitPrice?: Money; amount: Money }>;
  discountAmount?: number;
  taxes?: InvoiceTaxLineInput[];
}): InvoiceCalculation {
  const subtotal = calculateSubtotal(input.lines);
  const discount = calculateDiscount(subtotal, input.discountAmount ?? 0);
  const taxableAmount = calculateTaxableAmount(subtotal, discount);
  const taxLines = calculateTax(taxableAmount, input.taxes ?? []);
  const taxTotal = taxLines.length > 0
    ? addMoney(...taxLines.map(t => t.amount))
    : zeroMoney(taxableAmount.currency);
  const total = calculateTotal(taxableAmount, taxLines);
  return { subtotal, discount, taxableAmount, taxLines, taxTotal, total };
}

/**
 * Recompute an invoice's money from its stored lines (draft edit or
 * finalization): totals from lines + discount + tax inputs, then the
 * balance from the stored amountPaid (0 while no payments exist).
 */
export function recalculateInvoice(input: {
  lines: Array<{ quantity?: number; unitPrice?: Money; amount: Money }>;
  discountAmount?: number;
  taxes?: InvoiceTaxLineInput[];
  amountPaid?: Money;
}): InvoiceCalculation & { amountPaid: Money; amountDue: Money } {
  const totals = calculateInvoiceTotals(input);
  const balance = calculateInvoiceBalance(totals.total, input.amountPaid ?? zeroMoney(totals.subtotal.currency));
  return { ...totals, ...balance };
}
