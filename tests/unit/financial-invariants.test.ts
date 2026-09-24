/**
 * Production Audit — Financial Invariants (Playbook §9/§10/§11/§16)
 *
 * Tests:
 *  - Rupee/paise conversion (toMinorUnits / fromMinorUnits) — the playbook's
 *    critical requirement: ₹25,000 CANNOT become ₹250.
 *  - Money arithmetic correctness across boundary values.
 *  - Invoice calculation engine correctness (subtotal, discount, tax, total).
 *  - Payment balance engine (settled / amountDue / fullySettled).
 *  - Mixed-currency protection (addMoney throws on mismatch).
 *  - CUSTOM payment terms fix regression (dueDateFromTerms must throw without customDays).
 *  - All 0, 0.01, 1, 10, 99.99, 100, 999.99, 1000, 10000, 25000 boundary values.
 */
import { describe, it, expect } from 'vitest';
import {
  toMinorUnits, fromMinorUnits, roundMoney, makeMoney,
  addMoney, subtractMoney, multiplyMoney, zeroMoney,
} from '@/lib/agency/types/money';
import {
  calculateLineAmount, calculateSubtotal, calculateDiscount,
  calculateTaxableAmount, calculateTax, calculateTotal,
  calculateInvoiceTotals, calculateInvoiceBalance,
} from '@/lib/agency/domain/invoice-calculation';
import {
  calculatePaymentBalance, wouldOverpay, cashPortionOf,
} from '@/lib/agency/domain/payment-calculation';
import { dueDateFromTerms } from '@/lib/agency/types/dates';

// ---------- 1. Paise / rupee conversion (Playbook §16) ----------

describe('Rupee paise conversion — the critical Razorpay unit invariant', () => {
  const cases: [number, number][] = [
    [0, 0],
    [0.01, 1],
    [1, 100],
    [10, 1000],
    [99.99, 9999],
    [100, 10000],
    [999.99, 99999],
    [1000, 100000],
    [10000, 1000000],
    [25000, 2500000],   // The playbook's explicit Rs.25,000 case
    [99999.99, 9999999],
    [999999.99, 99999999],
  ];

  it.each(cases)('Rs.%s -> %s paise (toMinorUnits)', (rupees, expectedPaise) => {
    expect(toMinorUnits(rupees)).toBe(expectedPaise);
  });

  it.each(cases)('%s paise -> Rs.%s (fromMinorUnits)', (rupees, paise) => {
    expect(fromMinorUnits(paise)).toBeCloseTo(rupees, 10);
  });

  it('Rs.25,000 paise value is 2,500,000 — never confused with Rs.250', () => {
    const rupees = 25000;
    const paise = toMinorUnits(rupees);
    expect(paise).toBe(2500000);
    expect(paise).not.toBe(25000);   // not unchanged
    expect(paise).not.toBe(250000);  // not x10
    expect(paise).not.toBe(250);     // not /100 (the critical wrong direction)
    // Verify round-trip is lossless
    expect(fromMinorUnits(paise)).toBe(rupees);
  });

  it('toMinorUnits throws on NaN', () => {
    expect(() => toMinorUnits(NaN)).toThrow('[Money] Non-finite');
  });

  it('toMinorUnits throws on Infinity', () => {
    expect(() => toMinorUnits(Infinity)).toThrow('[Money] Non-finite');
  });

  it('toMinorUnits throws on -Infinity', () => {
    expect(() => toMinorUnits(-Infinity)).toThrow('[Money] Non-finite');
  });

  it('toMinorUnits throws on negative values', () => {
    expect(() => toMinorUnits(-1)).toThrow('[Money] Negative');
  });
});

// ---------- 2. Money arithmetic (Playbook §9) ----------

describe('Money arithmetic correctness', () => {
  it('addMoney sums correctly for boundary values', () => {
    const result = addMoney(
      makeMoney(0.01, 'INR'),
      makeMoney(99.99, 'INR'),
      makeMoney(0, 'INR'),
    );
    expect(result.amount).toBe(100);
    expect(result.currency).toBe('INR');
  });

  it('addMoney: 0.1 + 0.2 = 0.3 exactly (minor-unit arithmetic avoids float drift)', () => {
    const a = makeMoney(0.1, 'INR');
    const b = makeMoney(0.2, 'INR');
    const sum = addMoney(a, b);
    expect(sum.amount).toBe(0.3);
  });

  it('addMoney throws on mixed currencies', () => {
    expect(() =>
      addMoney(makeMoney(100, 'INR'), makeMoney(100, 'USD'))
    ).toThrow('[Money] Mixed currencies');
  });

  it('subtractMoney returns correct signed result', () => {
    const result = subtractMoney(makeMoney(100, 'INR'), makeMoney(25, 'INR'));
    expect(result).toBe(75);
  });

  it('subtractMoney can produce a negative (profit delta)', () => {
    const result = subtractMoney(makeMoney(10, 'INR'), makeMoney(15, 'INR'));
    expect(result).toBe(-5);
  });

  it('subtractMoney throws on mixed currencies', () => {
    expect(() =>
      subtractMoney(makeMoney(100, 'INR'), makeMoney(50, 'USD'))
    ).toThrow('[Money] Mixed currencies');
  });

  it('multiplyMoney: Rs.2500.50 x 42 hours = Rs.105,021', () => {
    const rate = makeMoney(2500.5, 'INR');
    const result = multiplyMoney(rate, 42);
    expect(result.amount).toBe(105021);
    expect(result.currency).toBe('INR');
  });

  it('multiplyMoney: Rs.0 x any factor = Rs.0', () => {
    expect(multiplyMoney(zeroMoney('INR'), 999).amount).toBe(0);
  });

  it('roundMoney: 99.995 rounds to 100 (half-up)', () => {
    // 99.995 x 100 = 9999.5 -> round to 10000 -> /100 = 100
    expect(roundMoney(99.995)).toBe(100);
  });

  it('makeMoney: invalid currency throws', () => {
    expect(() => makeMoney(100, 'xx')).toThrow('[Money] Invalid currency code');
    expect(() => makeMoney(100, '')).toThrow('[Money] Invalid currency code');
    expect(() => makeMoney(100, 'RUPEE')).toThrow('[Money] Invalid currency code');
  });
});

// ---------- 3. Invoice calculation engine (Playbook §9) ----------

describe('Invoice calculation engine', () => {
  it('zero-line invoice: subtotal = 0, total = 0', () => {
    const result = calculateInvoiceTotals({ lines: [] });
    expect(result.subtotal.amount).toBe(0);
    expect(result.total.amount).toBe(0);
  });

  it('single line, no discount, no tax', () => {
    const result = calculateInvoiceTotals({
      lines: [{ amount: makeMoney(25000, 'INR') }],
    });
    expect(result.subtotal.amount).toBe(25000);
    expect(result.discount.amount).toBe(0);
    expect(result.taxTotal.amount).toBe(0);
    expect(result.total.amount).toBe(25000);
  });

  it('multiple lines sum correctly without floating-point drift', () => {
    const result = calculateInvoiceTotals({
      lines: [
        { amount: makeMoney(99.99, 'INR') },
        { amount: makeMoney(0.01, 'INR') },
        { amount: makeMoney(1000, 'INR') },
      ],
    });
    expect(result.subtotal.amount).toBe(1100);
  });

  it('discount reduces subtotal correctly', () => {
    const result = calculateInvoiceTotals({
      lines: [{ amount: makeMoney(1000, 'INR') }],
      discountAmount: 100,
    });
    expect(result.discount.amount).toBe(100);
    expect(result.taxableAmount.amount).toBe(900);
    expect(result.total.amount).toBe(900);
  });

  it('discount cannot exceed subtotal', () => {
    expect(() => calculateDiscount(makeMoney(500, 'INR'), 501))
      .toThrow('[Invoice] Discount');
  });

  it('negative discount throws', () => {
    expect(() => calculateDiscount(makeMoney(500, 'INR'), -1))
      .toThrow('[Invoice] Negative discount');
  });

  it('18% GST (CGST 9% + SGST 9%) on Rs.1,00,000 = Rs.18,000 tax total', () => {
    const result = calculateInvoiceTotals({
      lines: [{ amount: makeMoney(100000, 'INR') }],
      taxes: [
        { name: 'CGST', rate: 9, type: 'CGST' as const },
        { name: 'SGST', rate: 9, type: 'SGST' as const },
      ],
    });
    expect(result.taxLines).toHaveLength(2);
    expect(result.taxLines[0].amount.amount).toBe(9000);
    expect(result.taxLines[1].amount.amount).toBe(9000);
    expect(result.taxTotal.amount).toBe(18000);
    expect(result.total.amount).toBe(118000);
  });

  it('18% IGST on Rs.25,000 = Rs.4,500 tax, total Rs.29,500', () => {
    const result = calculateInvoiceTotals({
      lines: [{ amount: makeMoney(25000, 'INR') }],
      taxes: [{ name: 'IGST', rate: 18, type: 'IGST' as const }],
    });
    expect(result.taxTotal.amount).toBe(4500);
    expect(result.total.amount).toBe(29500);
  });

  it('fractional tax: 18% on Rs.99.99 rounds correctly (half-up per line)', () => {
    const result = calculateInvoiceTotals({
      lines: [{ amount: makeMoney(99.99, 'INR') }],
      taxes: [{ name: 'GST', rate: 18 }],
    });
    // 99.99 x 0.18 = 17.9982 -> rounds to 18.00
    expect(result.taxTotal.amount).toBe(18);
    expect(result.total.amount).toBe(117.99);
  });

  it('tax rate > 100 is rejected', () => {
    expect(() =>
      calculateTax(makeMoney(1000, 'INR'), [{ name: 'BAD', rate: 101 }])
    ).toThrow('[Invoice] Invalid tax rate');
  });

  it('negative tax rate is rejected', () => {
    expect(() =>
      calculateTax(makeMoney(1000, 'INR'), [{ name: 'BAD', rate: -1 }])
    ).toThrow('[Invoice] Invalid tax rate');
  });

  it('quantity x unitPrice overrides stored amount', () => {
    const line = {
      quantity: 42,
      unitPrice: makeMoney(2500, 'INR'),
      amount: makeMoney(999, 'INR'),  // stored amount is IGNORED when qty+unitPrice present
    };
    const result = calculateLineAmount(line);
    expect(result.amount).toBe(105000);
  });

  it('negative quantity throws', () => {
    expect(() =>
      calculateLineAmount({
        quantity: -1,
        unitPrice: makeMoney(1000, 'INR'),
        amount: makeMoney(1000, 'INR'),
      })
    ).toThrow('[Invoice] Negative quantity');
  });

  it('invoice balance: amountDue = total - amountPaid', () => {
    const balance = calculateInvoiceBalance(
      makeMoney(25000, 'INR'),
      makeMoney(10000, 'INR'),
    );
    expect(balance.amountPaid.amount).toBe(10000);
    expect(balance.amountDue.amount).toBe(15000);
  });

  it('invoice balance: fully paid -> amountDue = 0', () => {
    const balance = calculateInvoiceBalance(
      makeMoney(1000, 'INR'),
      makeMoney(1000, 'INR'),
    );
    expect(balance.amountDue.amount).toBe(0);
  });

  it('invoice balance: overpayment throws (domain guard)', () => {
    expect(() =>
      calculateInvoiceBalance(
        makeMoney(1000, 'INR'),
        makeMoney(1001, 'INR'),
      )
    ).toThrow('[Invoice] amountPaid');
  });

  it('invoice balance: mixed currencies throw', () => {
    expect(() =>
      calculateInvoiceBalance(
        makeMoney(1000, 'INR'),
        makeMoney(500, 'USD'),
      )
    ).toThrow('[Invoice] Mixed currencies');
  });
});

// ---------- 4. Payment balance engine (Playbook §10) ----------

describe('Payment balance engine', () => {
  it('no payments: settled=0, amountDue=total, not fullySettled', () => {
    const balance = calculatePaymentBalance(makeMoney(25000, 'INR'), []);
    expect(balance.settled.amount).toBe(0);
    expect(balance.amountDue.amount).toBe(25000);
    expect(balance.fullySettled).toBe(false);
  });

  it('PENDING payments do not contribute to settlement', () => {
    const balance = calculatePaymentBalance(makeMoney(1000, 'INR'), [
      { amount: makeMoney(500, 'INR'), status: 'PENDING' },
    ]);
    expect(balance.settled.amount).toBe(0);
    expect(balance.amountDue.amount).toBe(1000);
  });

  it('CONFIRMED payment settles the invoice', () => {
    const balance = calculatePaymentBalance(makeMoney(25000, 'INR'), [
      { amount: makeMoney(25000, 'INR'), status: 'CONFIRMED' },
    ]);
    expect(balance.settled.amount).toBe(25000);
    expect(balance.amountDue.amount).toBe(0);
    expect(balance.fullySettled).toBe(true);
  });

  it('partial payment leaves correct amountDue', () => {
    const balance = calculatePaymentBalance(makeMoney(25000, 'INR'), [
      { amount: makeMoney(10000, 'INR'), status: 'CONFIRMED' },
    ]);
    expect(balance.settled.amount).toBe(10000);
    expect(balance.amountDue.amount).toBe(15000);
    expect(balance.fullySettled).toBe(false);
  });

  it('REVERSED payment reduces settled to zero (full reversal)', () => {
    const balance = calculatePaymentBalance(makeMoney(1000, 'INR'), [
      { amount: makeMoney(1000, 'INR'), status: 'REVERSED' },
    ]);
    expect(balance.settled.amount).toBe(0);
    expect(balance.amountDue.amount).toBe(1000);
    expect(balance.fullySettled).toBe(false);
  });

  it('CONFIRMED + separate REVERSED record: net settlement = CONFIRMED only (REVERSED cancels itself)', () => {
    // Domain model: each payment record is INDEPENDENT.
    // A REVERSED payment of Rs.200 was itself CONFIRMED then REVERSED — it
    // contributes Rs.200 to everConfirmed and Rs.200 to settledReversed.
    // Net: settled = (1000 + 200) - 200 = 1000.
    // The REVERSED record's self-cancellation does not reduce the CONFIRMED payment.
    const balance = calculatePaymentBalance(makeMoney(1000, 'INR'), [
      { amount: makeMoney(1000, 'INR'), status: 'CONFIRMED' },
      { amount: makeMoney(200, 'INR'), status: 'REVERSED' },
    ]);
    // Net settled = everConfirmed(1200) - reversed(200) = 1000.
    expect(balance.settled.amount).toBe(1000);
    expect(balance.amountDue.amount).toBe(0);
    expect(balance.fullySettled).toBe(true);
  });

  it('REVERSED only (full reversal of the only payment): settled=0, amountDue=full', () => {
    // When there is ONLY a REVERSED payment, everConfirmed = [200], reversed = [200].
    // settled = 200 - 200 = 0.
    const balance = calculatePaymentBalance(makeMoney(1000, 'INR'), [
      { amount: makeMoney(1000, 'INR'), status: 'REVERSED' },
    ]);
    expect(balance.settled.amount).toBe(0);
    expect(balance.amountDue.amount).toBe(1000);
    expect(balance.fullySettled).toBe(false);
  });

  it('FAILED payments do not contribute to settlement', () => {
    const balance = calculatePaymentBalance(makeMoney(1000, 'INR'), [
      { amount: makeMoney(1000, 'INR'), status: 'FAILED' },
    ]);
    expect(balance.settled.amount).toBe(0);
    expect(balance.amountDue.amount).toBe(1000);
  });

  it('withholding: cash portion is amount minus withholding', () => {
    const payment = {
      amount: makeMoney(100000, 'INR'),
      status: 'CONFIRMED' as const,
      withholdingAmount: makeMoney(10000, 'INR'),
    };
    const cash = cashPortionOf(payment);
    expect(cash.amount).toBe(90000);
  });

  it('wouldOverpay: Rs.25,001 against Rs.25,000 total is over-pay', () => {
    expect(wouldOverpay(
      makeMoney(25000, 'INR'),
      makeMoney(0, 'INR'),
      makeMoney(25001, 'INR'),
    )).toBe(true);
  });

  it('wouldOverpay: Rs.25,000 against Rs.25,000 total is NOT over-pay', () => {
    expect(wouldOverpay(
      makeMoney(25000, 'INR'),
      makeMoney(0, 'INR'),
      makeMoney(25000, 'INR'),
    )).toBe(false);
  });

  it('wouldOverpay: foreign currency is always treated as over-pay', () => {
    expect(wouldOverpay(
      makeMoney(1000, 'INR'),
      makeMoney(0, 'INR'),
      makeMoney(500, 'USD'),
    )).toBe(true);
  });

  it('foreignCount: a USD payment on an INR invoice is counted as foreign', () => {
    const balance = calculatePaymentBalance(makeMoney(1000, 'INR'), [
      { amount: makeMoney(500, 'USD'), status: 'CONFIRMED' },
    ]);
    expect(balance.foreignCount).toBe(1);
    expect(balance.settled.amount).toBe(0); // never incorporated
  });
});

// ---------- 5. CUSTOM payment terms regression (Playbook fix) ----------

describe('CUSTOM payment terms fix regression (dueDateFromTerms)', () => {
  it('CUSTOM without customDays THROWS (spec: explicit days required)', () => {
    expect(() => dueDateFromTerms('2026-08-01', 'CUSTOM')).toThrow(
      'CUSTOM payment terms require an explicit customDays value'
    );
  });

  it('CUSTOM with explicit 10 days adds 10 days correctly', () => {
    expect(dueDateFromTerms('2026-08-01', 'CUSTOM', 10)).toBe('2026-08-11');
  });

  it('CUSTOM with explicit 30 days adds 30 days', () => {
    expect(dueDateFromTerms('2026-08-01', 'CUSTOM', 30)).toBe('2026-08-31');
  });

  it('NET_30 adds 30 days without explicit customDays', () => {
    expect(dueDateFromTerms('2026-08-01', 'NET_30')).toBe('2026-08-31');
  });

  it('DUE_ON_RECEIPT: dueDate equals issueDate', () => {
    expect(dueDateFromTerms('2026-09-15', 'DUE_ON_RECEIPT')).toBe('2026-09-15');
  });

  it('NET_7 adds exactly 7 days', () => {
    expect(dueDateFromTerms('2026-09-01', 'NET_7')).toBe('2026-09-08');
  });

  it('NET_60 adds exactly 60 days', () => {
    expect(dueDateFromTerms('2026-01-01', 'NET_60')).toBe('2026-03-02');
  });
});
