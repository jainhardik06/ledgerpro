/**
 * Agency Vertical — Domain: payment balance engine (Module 10, spec §104/§127)
 *
 * PURE: money.ts arithmetic only, no server imports, no I/O. This is the ONE
 * place payment balance math lives (§127 — the shared financial engine). The
 * payment domain service calls it; React/routes/reports never re-derive.
 *
 * The rules (§104):
 *   settled    = Σ CONFIRMED payment amounts − Σ REVERSED payment amounts
 *   amountDue  = invoice.total − settled   (withholding is modeled
 *                separately — a withheld payment still settles the invoice)
 *   cash       = Σ (amount − withholdingAmount) over confirmed payments —
 *                the money that actually entered an account (§92)
 *
 * The engine NEVER mutates; it computes a derived view the caller persists.
 * Overpayment is not an error HERE (the domain rejects it at confirmation
 * §91) — this engine reports what the payment list actually sums to, which
 * is exactly what §128's consistency diagnostic needs to compare against
 * the stored invoice money.
 */
import {
  makeMoney, addMoney, subtractMoney, zeroMoney,
  type Money, type CurrencyCode,
} from '../types/money';
import type { Payment, PaymentStatus } from '../types/payment';

/** The minimal payment shape the engine needs — mocks stay cheap. */
export type BalancePayment = Pick<Payment, 'amount' | 'status'>
  & Partial<Pick<Payment, 'withholdingAmount'>>;

export interface PaymentBalance {
  /** §104 — Σ CONFIRMED − Σ REVERSED, the invoice settlement position. */
  settled: Money;
  /** §104 — total − settled. Never negative for a well-formed history
   *  (overpayment is rejected at confirmation, §91). */
  amountDue: Money;
  /** True when the invoice is fully settled (§79 → PAID). */
  fullySettled: boolean;
  /** §92 — cash that entered accounts: Σ (amount − withholding) over the
   *  settled (confirmed-not-reversed) payments. */
  cash: Money;
  /** §92 — the withheld total over the settled payments. */
  withheld: Money;
}

/**
 * §92 — the cash portion of one payment: its settlement amount minus the
 * withheld part. A payment of 100,000 with 10,000 TDS settles 100,000 of
 * the invoice but only 90,000 lands in the account.
 */
export function cashPortionOf(payment: BalancePayment): Money {
  if (payment.withholdingAmount === undefined) return payment.amount;
  if (payment.withholdingAmount.amount === 0) return payment.amount;
  return makeMoney(subtractMoney(payment.amount, payment.withholdingAmount), payment.amount.currency);
}

/** Payments that count toward settlement (§101/§104 — PENDING/FAILED never do). */
function isSettling(status: PaymentStatus): boolean {
  return status === 'CONFIRMED' || status === 'REVERSED';
}

/**
 * §104 — the invoice's payment position from its full payment list.
 *
 * Currency honesty: every CONFIRMED/REVERSED payment is expected to carry
 * the invoice's currency (the domain enforces this at record + confirm).
 * A foreign-currency settling payment is skipped from the sums and counted
 * in `foreignCount` — never converted (§127).
 */
export function calculatePaymentBalance(
  invoiceTotal: Money,
  payments: BalancePayment[]
): PaymentBalance & { foreignCount: number } {
  const currency: CurrencyCode = invoiceTotal.currency;
  const mine = payments.filter(p => isSettling(p.status));
  const same = mine.filter(p => p.amount.currency === currency);
  const foreignCount = mine.length - same.length;

  const confirmed = same.filter(p => p.status === 'CONFIRMED');
  const reversed = same.filter(p => p.status === 'REVERSED');

  const sumOf = (list: BalancePayment[]): Money =>
    list.length === 0 ? zeroMoney(currency) : addMoney(...list.map(p => p.amount));

  // §104 — settled = Σ CONFIRMED − Σ REVERSED, where "Σ CONFIRMED" is every
  // payment that EVER reached CONFIRMED: a REVERSED payment WAS confirmed
  // (CONFIRMED→REVERSED is the only path, §102) — the status moved on, the
  // history didn't. Equivalently the sum over current-CONFIRMED payments:
  // a reversal removes its amount exactly once and settled can never go
  // negative (fully reversing the only payment lands at 0, not below).
  const everConfirmed = [...confirmed, ...reversed];
  const settledConfirmed = sumOf(everConfirmed);
  const settledReversed = sumOf(reversed);
  const settled = settledReversed.amount === 0
    ? settledConfirmed
    : makeMoney(subtractMoney(settledConfirmed, settledReversed), currency);

  const due = Math.max(0, subtractMoney(invoiceTotal, settled));
  const cash = confirmed.length === 0
    ? zeroMoney(currency)
    : addMoney(...confirmed.map(cashPortionOf));
  const withheld = confirmed.filter(p => p.withholdingAmount && p.withholdingAmount.amount > 0);
  const withheldTotal = withheld.length === 0
    ? zeroMoney(currency)
    : addMoney(...withheld.map(p => p.withholdingAmount!));

  return {
    settled,
    amountDue: makeMoney(due, currency),
    fullySettled: settled.amount >= invoiceTotal.amount,
    cash,
    withheld: withheldTotal,
    foreignCount,
  };
}

/**
 * §91 — would confirming `amount` against the current settled position
 * overpay the invoice? The domain turns this into the 400.
 */
export function wouldOverpay(invoiceTotal: Money, settled: Money, amount: Money): boolean {
  if (amount.currency !== invoiceTotal.currency || settled.currency !== invoiceTotal.currency) {
    return true; // foreign money is never accepted against the invoice (§127)
  }
  return settled.amount + amount.amount > invoiceTotal.amount;
}
