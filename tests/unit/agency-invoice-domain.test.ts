/**
 * Module 9 — invoice domain types + calculation engine + validators (Sprints
 * 9A/9B). Pure unit tests, no db mocks.
 *
 * §148-relevant coverage:
 *   - §74 numbering format (INV-000001…, no client-side generation path)
 *   - §79/§80 state machine + derived OVERDUE (never a stored mutation)
 *   - §77/§78 calculation pipeline: line → subtotal → discount → tax →
 *     total → balance (each rounding exactly once, minor units)
 *   - §76 tax lines: independent per-line rounding; total = Σ displayed
 *   - §58/§129 balance: amountDue ≥ 0 always; overpay is an error
 *   - §63/§66 reservation vocabulary
 *   - validators: draft create, line add (sourceId rules §60), PATCH
 *     partiality (Module 4/5 lessons)
 */
import { describe, it, expect } from 'vitest';
import {
  canTransitionInvoiceStatus, displayStatusFor, formatInvoiceNumber, draftLabel,
  isSourceBackedLineType, INVOICE_TRANSITIONS,
} from '@/lib/agency/types/invoice';
import { makeMoney } from '@/lib/agency/types/money';
import {
  calculateLineAmount, calculateSubtotal, calculateDiscount, calculateTaxableAmount,
  calculateTax, calculateTotal, calculateInvoiceBalance, calculateInvoiceTotals,
  recalculateInvoice,
} from '@/lib/agency/domain/invoice-calculation';
import {
  validateInvoiceDraftCreate, validateInvoiceLineAdd, validateInvoiceUpdate,
} from '@/lib/agency/validators/invoice';

const TODAY = '2026-09-12';

// ---------- §74 numbering ----------

describe('Module 9 invoice numbering (§74/§75)', () => {
  it('formats INV-000001 … INV-000010 with 6-digit padding', () => {
    expect(formatInvoiceNumber(1)).toBe('INV-000001');
    expect(formatInvoiceNumber(10)).toBe('INV-000010');
    expect(formatInvoiceNumber(999999)).toBe('INV-999999');
  });

  it('drafts display an honest draft label, never a fake number or raw id', () => {
    expect(draftLabel('507f1f77bcf86cd799439011')).toBe('Draft Invoice');
  });
});

// ---------- §79/§80 state machine ----------

describe('Module 9 invoice status transitions (§79/§80)', () => {
  it('walks the happy path DRAFT → SENT → PARTIALLY_PAID → PAID', () => {
    expect(canTransitionInvoiceStatus('DRAFT', 'SENT')).toBe(true);
    expect(canTransitionInvoiceStatus('SENT', 'PARTIALLY_PAID')).toBe(true);
    expect(canTransitionInvoiceStatus('PARTIALLY_PAID', 'PAID')).toBe(true);
  });

  it('allows SENT → OVERDUE and OVERDUE → PARTIALLY_PAID → PAID (§79 alternative)', () => {
    expect(canTransitionInvoiceStatus('SENT', 'OVERDUE')).toBe(true);
    expect(canTransitionInvoiceStatus('OVERDUE', 'PARTIALLY_PAID')).toBe(true);
    expect(canTransitionInvoiceStatus('OVERDUE', 'PAID')).toBe(true);
  });

  it('VOID from DRAFT/SENT/OVERDUE only — never from PAID', () => {
    expect(canTransitionInvoiceStatus('DRAFT', 'VOID')).toBe(true);
    expect(canTransitionInvoiceStatus('SENT', 'VOID')).toBe(true);
    expect(canTransitionInvoiceStatus('OVERDUE', 'VOID')).toBe(true);
    expect(canTransitionInvoiceStatus('PAID', 'VOID')).toBe(false);
    expect(INVOICE_TRANSITIONS.VOID).toEqual([]);
  });

  it('Module 10 — PAID walks back ONLY along the payment-reversal path, never into DRAFT/VOID', () => {
    // §104/§103 — reversing a confirmed payment recomputes the status:
    expect(canTransitionInvoiceStatus('PAID', 'PARTIALLY_PAID')).toBe(true);   // some money returned
    expect(canTransitionInvoiceStatus('PARTIALLY_PAID', 'SENT')).toBe(true);   // reversed to zero
    expect(canTransitionInvoiceStatus('OVERDUE', 'PARTIALLY_PAID')).toBe(true);
    // ...and nothing else moves backwards — the walk-back is driven only by
    // paymentDrivenInvoiceStatus, never hand-picked:
    expect(canTransitionInvoiceStatus('SENT', 'DRAFT')).toBe(false);
    expect(canTransitionInvoiceStatus('PAID', 'DRAFT')).toBe(false);
    expect(canTransitionInvoiceStatus('PAID', 'VOID')).toBe(false);
    expect(canTransitionInvoiceStatus('PARTIALLY_PAID', 'DRAFT')).toBe(false);
  });

  it('§80 — derives OVERDUE for display only, when past due with money owed', () => {
    const invoice = { status: 'SENT' as const, dueDate: '2026-09-01', amountDue: makeMoney(60000) };
    expect(displayStatusFor(invoice, TODAY)).toBe('OVERDUE');
    expect(displayStatusFor(invoice, '2026-09-01')).toBe('SENT'); // due date itself is not past
    expect(displayStatusFor({ ...invoice, amountDue: makeMoney(0) }, TODAY)).toBe('SENT');
    expect(displayStatusFor({ ...invoice, status: 'DRAFT' as const }, TODAY)).toBe('DRAFT');
    expect(displayStatusFor({ ...invoice, status: 'PAID' as const }, TODAY)).toBe('PAID');
  });
});

// ---------- §59/§60 line typing ----------

describe('Module 9 line types (§59/§60)', () => {
  it('TIME/EXPENSE/MILESTONE are source-backed; FIXED_FEE/MANUAL are not', () => {
    expect(isSourceBackedLineType('TIME')).toBe(true);
    expect(isSourceBackedLineType('EXPENSE')).toBe(true);
    expect(isSourceBackedLineType('MILESTONE')).toBe(true);
    expect(isSourceBackedLineType('FIXED_FEE')).toBe(false);
    expect(isSourceBackedLineType('MANUAL')).toBe(false);
  });
});

// ---------- §77/§78 calculation engine ----------

describe('Module 9 calculation engine (§77/§78)', () => {
  it('§78 — quantity × unitPrice prices a line with one rounding', () => {
    const amount = calculateLineAmount({
      quantity: 42,
      unitPrice: makeMoney(2500),
      amount: makeMoney(0),
    });
    expect(amount.amount).toBe(105000); // §72 — 42 × ₹2,500 = ₹105,000
  });

  it('§78 — a source-backed line carries its frozen amount unchanged', () => {
    const amount = calculateLineAmount({ amount: makeMoney(12000) });
    expect(amount.amount).toBe(12000);
  });

  it('mixed currencies in a priced line throw (never converted)', () => {
    expect(() => calculateLineAmount({
      quantity: 2,
      unitPrice: makeMoney(100, 'USD'),
      amount: makeMoney(0),
    })).toThrow(/Mixed currencies/);
  });

  it('§77 — subtotal sums line amounts exactly (minor units, no drift)', () => {
    const subtotal = calculateSubtotal([
      { amount: makeMoney(0.01) },
      { amount: makeMoney(0.02) },
    ]);
    expect(subtotal.amount).toBe(0.03);
  });

  it('§77 — empty lines subtotal to zero', () => {
    expect(calculateSubtotal([]).amount).toBe(0);
  });

  it('§77 — discount larger than the subtotal is an error, never a negative base', () => {
    expect(() => calculateDiscount(makeMoney(100), 150)).toThrow(/exceeds subtotal/);
    expect(calculateDiscount(makeMoney(100), 100).amount).toBe(100);
  });

  it('§77 — taxable = subtotal − discount', () => {
    const taxable = calculateTaxableAmount(makeMoney(105000), makeMoney(5000));
    expect(taxable.amount).toBe(100000);
  });

  it('§76 — tax lines round independently; the total sums ROUNDED lines', () => {
    // 18% on 1000.01 → 180.0018 → 180.00; the displayed amount IS the totaled one.
    const taxLines = calculateTax(makeMoney(1000.01), [
      { name: 'CGST', rate: 9 },
      { name: 'SGST', rate: 9 },
    ]);
    expect(taxLines).toHaveLength(2);
    expect(taxLines[0].amount.amount).toBe(90.0);
    expect(taxLines[1].amount.amount).toBe(90.0);
    expect(taxLines[0].taxableAmount.amount).toBe(1000.01);
    const total = calculateTotal(makeMoney(1000.01), taxLines);
    expect(total.amount).toBe(1180.01);
  });

  it('§76 — IGST as a single line works the same way', () => {
    const taxLines = calculateTax(makeMoney(100000), [{ name: 'IGST', rate: 18 }]);
    expect(taxLines[0].amount.amount).toBe(18000);
  });

  it('§76 — rejects a bad rate or a blank tax name', () => {
    expect(() => calculateTax(makeMoney(100), [{ name: 'GST', rate: 150 }])).toThrow(/Invalid tax rate/);
    expect(() => calculateTax(makeMoney(100), [{ name: '  ', rate: 18 }])).toThrow(/name is required/);
  });

  it('§58/§129 — balance: paid is paid, due is total − paid, never negative', () => {
    const balance = calculateInvoiceBalance(makeMoney(100000), makeMoney(40000));
    expect(balance.amountPaid.amount).toBe(40000);
    expect(balance.amountDue.amount).toBe(60000);
    expect(() => calculateInvoiceBalance(makeMoney(100000), makeMoney(120000))).toThrow(/exceeds total/);
  });

  it('§77 — the composite pipeline: lines → discount → tax → total', () => {
    const calc = calculateInvoiceTotals({
      lines: [
        { amount: makeMoney(500000) }, // §71 — fixed fee, no fabricated time
        { amount: makeMoney(12000) },  // expense client charge
      ],
      discountAmount: 12000,
      taxes: [{ name: 'IGST', rate: 18 }],
    });
    expect(calc.subtotal.amount).toBe(512000);
    expect(calc.discount.amount).toBe(12000);
    expect(calc.taxableAmount.amount).toBe(500000);
    expect(calc.taxLines).toHaveLength(1);
    expect(calc.taxTotal.amount).toBe(90000);
    expect(calc.total.amount).toBe(590000);
  });

  it('recalculateInvoice keeps amountPaid 0 → amountDue = total for a draft', () => {
    const recalc = recalculateInvoice({
      lines: [{ amount: makeMoney(105000) }],
      taxes: [],
    });
    expect(recalc.amountPaid.amount).toBe(0);
    expect(recalc.amountDue.amount).toBe(105000);
    expect(recalc.total.amount).toBe(105000);
  });

  it('mixed-currency line sums throw (single-currency invoice by construction)', () => {
    expect(() => calculateSubtotal([
      { amount: makeMoney(100, 'INR') },
      { amount: makeMoney(100, 'USD') },
    ])).toThrow(/Mixed currencies/);
  });
});

// ---------- validators ----------

describe('Module 9 validators (§57–§71)', () => {
  const baseDraft = {
    clientId: '507f1f77bcf86cd799439011',
    issueDate: TODAY,
    dueDate: '2026-10-12',
    currency: 'INR',
  };

  it('validates a minimal draft; defaults issueDate to today', () => {
    const v = validateInvoiceDraftCreate({ clientId: baseDraft.clientId, dueDate: '2026-10-12' }, TODAY);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.issueDate).toBe(TODAY);
      expect(v.value.currency).toBe('INR');
    }
  });

  it('requires a client; §68 — a missing dueDate is legal (the domain defaults it)', () => {
    expect(validateInvoiceDraftCreate({ dueDate: '2026-10-12' }, TODAY).ok).toBe(false); // no client
    expect(validateInvoiceDraftCreate({ clientId: 'c1' }, TODAY).ok).toBe(true);         // dueDate optional
    const early = validateInvoiceDraftCreate(
      { ...baseDraft, dueDate: '2026-09-01' }, TODAY
    );
    expect(early.ok).toBe(false);
  });

  it('rejects a future issueDate and a malformed currency', () => {
    expect(validateInvoiceDraftCreate({ ...baseDraft, issueDate: '2026-12-31' }, TODAY).ok).toBe(false);
    expect(validateInvoiceDraftCreate({ ...baseDraft, currency: 'rupees' }, TODAY).ok).toBe(false);
  });

  it('§60 — requires sourceId on source-backed lines, forbids non-positive amounts', () => {
    const time = validateInvoiceLineAdd({ type: 'TIME', description: 'Dev' });
    expect(time.ok).toBe(false);
    if (!time.ok) expect(time.errors.some(e => e.field === 'sourceId')).toBe(true);

    const manual = validateInvoiceLineAdd({ type: 'MANUAL', description: 'Ad-hoc', amount: -5 });
    expect(manual.ok).toBe(false);

    const ok = validateInvoiceLineAdd({
      type: 'EXPENSE', description: 'Stock assets', sourceId: 'e1',
    });
    expect(ok.ok).toBe(true);
  });

  it('quantity and unitPrice are set together (§59)', () => {
    const v = validateInvoiceLineAdd({
      type: 'MANUAL', description: 'Licences', amount: 100, quantity: 3,
    });
    expect(v.ok).toBe(false);
  });

  it('§72 — a quantity-priced line may carry a 0 placeholder amount; a bare 0 may not', () => {
    expect(validateInvoiceLineAdd({
      type: 'MANUAL', description: 'Licences', amount: 0, quantity: 42, unitPrice: 2500,
    }).ok).toBe(true);
    expect(validateInvoiceLineAdd({
      type: 'MANUAL', description: 'Licences', amount: 0,
    }).ok).toBe(false);
  });

  it('PATCH is partial — a bare {notes} passes; empty string means clear', () => {
    const v = validateInvoiceUpdate({ notes: 'Thank you' });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.notes).toBe('Thank you');

    const clear = validateInvoiceUpdate({ notes: '' });
    expect(clear.ok).toBe(true);
    if (clear.ok) expect(clear.value.notes).toBeNull();

    expect(validateInvoiceUpdate({}).ok).toBe(true);
    expect(validateInvoiceUpdate({ dueDate: 'not-a-date' }).ok).toBe(false);
  });
});
