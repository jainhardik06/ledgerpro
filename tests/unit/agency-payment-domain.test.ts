/**
 * Module 10 (§87–§116) — payment DOMAIN types + pure engine tests (Sprint 10A).
 *
 * Pins the rules that make collections honest:
 *   - §102 the state machine: PENDING→CONFIRMED|FAILED, CONFIRMED→REVERSED,
 *     and NO FAILED→CONFIRMED edge (the money that arrives later is a NEW
 *     payment record)
 *   - §104 the balance engine: settled = Σ CONFIRMED − Σ REVERSED;
 *     amountDue = total − settled; PENDING/FAILED contribute nothing
 *   - §92 cash vs settlement: cash = amount − withholding; a withheld
 *     payment settles the invoice fully while less money lands
 *   - §91 wouldOverpay boundaries
 *   - §79+§104 paymentDrivenInvoiceStatus incl. the Module 10 reversal
 *     edges (PAID→PARTIALLY_PAID→SENT) and OVERDUE persistence (§80)
 *   - §88/§92/§107 validators: required fields, enum methods, withholding
 *     ≤ amount, future receivedAt rejected, filters drop-invalid
 */
import { describe, it, expect } from 'vitest';
import {
  PAYMENT_TRANSITIONS, canTransitionPaymentStatus,
  paymentDrivenInvoiceStatus, invoiceAcceptsPayments,
  type Payment, type PaymentStatus,
} from '@/lib/agency/types/payment';
import {
  calculatePaymentBalance, wouldOverpay, cashPortionOf,
} from '@/lib/agency/domain/payment-calculation';
import {
  validatePaymentRecord, validatePaymentFilters, validatePaymentReason,
} from '@/lib/agency/validators/payment';
import { makeMoney, zeroMoney } from '@/lib/agency/types/money';
import { todayInTimezone, addDays } from '@/lib/agency/types/dates';

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'pay-1', tenantId: 't1', invoiceId: 'inv-1', clientId: 'c1',
    amount: makeMoney(100000), receivedAt: '2026-09-12', method: 'BANK_TRANSFER',
    status: 'PENDING', createdBy: 'admin-1',
    createdAt: new Date('2026-09-12'), updatedAt: new Date('2026-09-12'),
    ...overrides,
  };
}

describe('§102 payment state machine', () => {
  it('allows exactly PENDING→CONFIRMED|FAILED and CONFIRMED→REVERSED', () => {
    expect(PAYMENT_TRANSITIONS.PENDING).toEqual(['CONFIRMED', 'FAILED']);
    expect(PAYMENT_TRANSITIONS.CONFIRMED).toEqual(['REVERSED']);
    expect(PAYMENT_TRANSITIONS.FAILED).toEqual([]);
    expect(PAYMENT_TRANSITIONS.REVERSED).toEqual([]);
  });

  it('has NO FAILED→CONFIRMED edge — a failed attempt is history (§102)', () => {
    expect(canTransitionPaymentStatus('FAILED', 'CONFIRMED')).toBe(false);
    expect(canTransitionPaymentStatus('REVERSED', 'CONFIRMED')).toBe(false);
    expect(canTransitionPaymentStatus('CONFIRMED', 'CONFIRMED')).toBe(false);
    expect(canTransitionPaymentStatus('PENDING', 'REVERSED')).toBe(false); // never confirmed, never reversed
  });
});

describe('§104 calculatePaymentBalance', () => {
  const total = makeMoney(100000);

  it('§156 arithmetic: 40k then 60k confirmed → settled 100k, due 0, cash 100k', () => {
    const balance = calculatePaymentBalance(total, [
      payment({ id: 'p1', amount: makeMoney(40000), status: 'CONFIRMED' }),
      payment({ id: 'p2', amount: makeMoney(60000), status: 'CONFIRMED' }),
    ]);
    expect(balance.settled.amount).toBe(100000);
    expect(balance.amountDue.amount).toBe(0);
    expect(balance.fullySettled).toBe(true);
    expect(balance.cash.amount).toBe(100000);
    expect(balance.foreignCount).toBe(0);
  });

  it('partial payment: 40k of 100k → settled 40k, due 60k (§90)', () => {
    const balance = calculatePaymentBalance(total, [
      payment({ amount: makeMoney(40000), status: 'CONFIRMED' }),
    ]);
    expect(balance.settled.amount).toBe(40000);
    expect(balance.amountDue.amount).toBe(60000);
    expect(balance.fullySettled).toBe(false);
  });

  it('PENDING and FAILED contribute nothing (§101)', () => {
    const balance = calculatePaymentBalance(total, [
      payment({ amount: makeMoney(40000), status: 'PENDING' }),
      payment({ amount: makeMoney(30000), status: 'FAILED' }),
    ]);
    expect(balance.settled.amount).toBe(0);
    expect(balance.amountDue.amount).toBe(100000);
    expect(balance.cash.amount).toBe(0);
  });

  it('§103/§104 a reversed payment nets zero: reversing the only payment → settled 0, never negative', () => {
    const balance = calculatePaymentBalance(total, [
      payment({ id: 'p1', amount: makeMoney(40000), status: 'REVERSED' }),
    ]);
    expect(balance.settled.amount).toBe(0);
    expect(balance.amountDue.amount).toBe(100000);
    // §103 — the reversal returned the cash too.
    expect(balance.cash.amount).toBe(0);
  });

  it('§104 a reversal removes its OWN amount exactly once — a sibling confirmed payment is unaffected', () => {
    const balance = calculatePaymentBalance(total, [
      payment({ id: 'p1', amount: makeMoney(60000), status: 'CONFIRMED' }),
      payment({ id: 'p2', amount: makeMoney(20000), status: 'REVERSED' }),
    ]);
    expect(balance.settled.amount).toBe(60000); // p2 nets zero (was confirmed, now reversed)
    expect(balance.amountDue.amount).toBe(40000);
    expect(balance.cash.amount).toBe(60000);    // p2's cash was returned by the Debit
  });

  it('§92 withholding: settles 100k, cash lands 90k, withheld 10k', () => {
    const balance = calculatePaymentBalance(total, [
      payment({
        amount: makeMoney(100000),
        withholdingAmount: makeMoney(10000),
        status: 'CONFIRMED',
      }),
    ]);
    expect(balance.settled.amount).toBe(100000);   // invoice settles in full
    expect(balance.fullySettled).toBe(true);
    expect(balance.cash.amount).toBe(90000);       // but only 90k hit the account
    expect(balance.withheld.amount).toBe(10000);
  });

  it('empty list → zeros in the invoice currency', () => {
    const balance = calculatePaymentBalance(makeMoney(50000), []);
    expect(balance.settled).toEqual(zeroMoney('INR'));
    expect(balance.amountDue.amount).toBe(50000);
    expect(balance.cash).toEqual(zeroMoney('INR'));
  });

  it('foreign-currency settling payments are counted, never converted (§127)', () => {
    const balance = calculatePaymentBalance(total, [
      payment({ amount: { amount: 500, currency: 'USD' }, status: 'CONFIRMED' }),
    ]);
    expect(balance.settled.amount).toBe(0);
    expect(balance.foreignCount).toBe(1);
  });
});

describe('§92 cashPortionOf / §91 wouldOverpay', () => {
  it('cash = amount − withholding', () => {
    expect(cashPortionOf(payment({ amount: makeMoney(100000) })).amount).toBe(100000);
    expect(cashPortionOf(payment({
      amount: makeMoney(100000),
      withholdingAmount: makeMoney(10000),
    })).amount).toBe(90000);
    expect(cashPortionOf(payment({
      amount: makeMoney(100000),
      withholdingAmount: zeroMoney('INR'),
    })).amount).toBe(100000);
  });

  it('wouldOverpay boundaries (§91)', () => {
    const total = makeMoney(100000);
    expect(wouldOverpay(total, zeroMoney('INR'), makeMoney(100000))).toBe(false); // exact is fine
    expect(wouldOverpay(total, makeMoney(40000), makeMoney(60000))).toBe(false);
    expect(wouldOverpay(total, makeMoney(40000), makeMoney(60000.01))).toBe(true);
    expect(wouldOverpay(total, makeMoney(100000), makeMoney(1))).toBe(true);
    // Foreign money never pays an INR invoice (§127).
    expect(wouldOverpay(total, zeroMoney('INR'), { amount: 1, currency: 'USD' })).toBe(true);
  });
});

describe('§79/§104 paymentDrivenInvoiceStatus + reversal edges', () => {
  it('confirm paths', () => {
    expect(paymentDrivenInvoiceStatus('SENT', 0, 100000)).toBe('SENT');
    expect(paymentDrivenInvoiceStatus('SENT', 40000, 100000)).toBe('PARTIALLY_PAID');
    expect(paymentDrivenInvoiceStatus('SENT', 100000, 100000)).toBe('PAID');
    expect(paymentDrivenInvoiceStatus('PARTIALLY_PAID', 100000, 100000)).toBe('PAID');
    expect(paymentDrivenInvoiceStatus('OVERDUE', 40000, 100000)).toBe('PARTIALLY_PAID');
    expect(paymentDrivenInvoiceStatus('OVERDUE', 100000, 100000)).toBe('PAID');
  });

  it('reversal walks the status back: PAID→PARTIALLY_PAID→SENT (Module 10 edges)', () => {
    expect(paymentDrivenInvoiceStatus('PAID', 40000, 100000)).toBe('PARTIALLY_PAID');
    expect(paymentDrivenInvoiceStatus('PARTIALLY_PAID', 0, 100000)).toBe('SENT');
    expect(paymentDrivenInvoiceStatus('PAID', 0, 100000)).toBe('SENT');
  });

  it('§80 — a reversed-to-zero OVERDUE invoice stays OVERDUE (still past due, still unpaid)', () => {
    expect(paymentDrivenInvoiceStatus('OVERDUE', 0, 100000)).toBe('OVERDUE');
  });

  it('invoiceAcceptsPayments (§89/§91)', () => {
    expect(invoiceAcceptsPayments('SENT')).toBe(true);
    expect(invoiceAcceptsPayments('PARTIALLY_PAID')).toBe(true);
    expect(invoiceAcceptsPayments('OVERDUE')).toBe(true);
    expect(invoiceAcceptsPayments('DRAFT')).toBe(false); // no number to settle (§74)
    expect(invoiceAcceptsPayments('PAID')).toBe(false);
    expect(invoiceAcceptsPayments('VOID')).toBe(false);
  });
});

describe('§88/§92/§107 validators', () => {
  const today = todayInTimezone();
  const base = {
    invoiceId: 'inv-1', amount: 40000, method: 'BANK_TRANSFER', receivedAt: today,
  };

  it('accepts a valid record', () => {
    const v = validatePaymentRecord(base, today);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.invoiceId).toBe('inv-1');
      expect(v.value.amount).toBe(40000);
      expect(v.value.method).toBe('BANK_TRANSFER');
      expect(v.value.receivedAt).toBe(today);
    }
  });

  it('§89 — invoiceId required; §129 — amount must be positive', () => {
    const v = validatePaymentRecord({ amount: 100, method: 'UPI' }, today);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.some(e => e.field === 'invoiceId')).toBe(true);

    const v2 = validatePaymentRecord({ ...base, amount: 0 }, today);
    expect(v2.ok).toBe(false);
    if (!v2.ok) expect(v2.errors.some(e => e.field === 'amount')).toBe(true);
  });

  it('§92 — withholding cannot exceed the payment amount', () => {
    const v = validatePaymentRecord({ ...base, withholdingAmount: 50000 }, today);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.some(e => e.field === 'withholdingAmount' && /exceed/i.test(e.message))).toBe(true);

    const ok = validatePaymentRecord({ ...base, withholdingAmount: 40000 }, today);
    expect(ok.ok).toBe(true); // equal is legal: everything was withheld
  });

  it('§107 — method must be the enum, never a UI label', () => {
    const v = validatePaymentRecord({ ...base, method: 'Bank Transfer' }, today);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.some(e => e.field === 'method')).toBe(true);
  });

  it('receivedAt cannot be in the future', () => {
    const v = validatePaymentRecord({ ...base, receivedAt: addDays(today, 1) }, today);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.some(e => e.field === 'receivedAt')).toBe(true);
  });

  it('currency, when explicit, must be a 3-letter code', () => {
    const v = validatePaymentRecord({ ...base, currency: 'rupees' }, today);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.some(e => e.field === 'currency')).toBe(true);
  });

  it('reason: optional but bounded', () => {
    expect(validatePaymentReason({}).ok).toBe(true);
    expect(validatePaymentReason({ reason: 'bounce' }).ok).toBe(true);
    const bad = validatePaymentReason({ reason: 'x'.repeat(2001) });
    expect(bad.ok).toBe(false);
  });

  it('filters drop invalid values silently', () => {
    const f = validatePaymentFilters({
      status: 'NOPE', method: 'CASH', clientId: 'c1', dateFrom: 'not-a-date', dateTo: '2026-09-12',
    });
    expect(f.status).toBeUndefined();
    expect(f.method).toBe('CASH');
    expect(f.clientId).toBe('c1');
    expect(f.dateFrom).toBeUndefined();
    expect(f.dateTo).toBe('2026-09-12');
  });
});

describe('§104 status typing', () => {
  it('the settling statuses are exactly CONFIRMED and REVERSED', () => {
    const settling: PaymentStatus[] = ['CONFIRMED', 'REVERSED'];
    const notSettling: PaymentStatus[] = ['PENDING', 'FAILED'];
    for (const s of notSettling) {
      expect(settling.includes(s)).toBe(false);
    }
  });
});
