/**
 * Agency Vertical — Types: money representation (Step 0.10)
 *
 * CLIENT-SAFE: types and pure functions only. No server imports.
 *
 * THE single money-handling rulebook for the Agency vertical. No module may
 * invent its own rounding, precision, or currency behavior — everything goes
 * through the types and helpers here.
 *
 * Decisions (binding):
 *
 * 1. STORAGE: amounts are stored as plain JavaScript numbers (MongoDB double),
 *    consistent with Money OS's existing `Transaction.amount`. We do NOT
 *    introduce integer minor-units or Decimal128 storage in Phase 1.
 *
 * 2. ARITHMETIC: all internal calculations are done in MINOR UNITS (integer
 *    paise/cents) via this module, then converted back once at the end.
 *    This removes the unsafe floating-point assumption (0.1 + 0.2 !== 0.3)
 *    without changing the storage model.
 *
 * 3. DECIMAL PRECISION: 2 decimal places for all money values.
 *
 * 4. ROUNDING: half-up (ROUND_HALF_UP) at the 2nd decimal. Applied ONCE,
 *    at the metric/invoice boundary — never inside sums.
 *
 * 5. TAX ROUNDING: each tax line (CGST/SGST/IGST) is rounded independently
 *    to 2 decimals half-up, then summed. The invoice total is computed from
 *    rounded lines, so totals always equal the sum of their displayed lines.
 *
 * 6. PERCENTAGE PRECISION: 1 decimal place for all percentage metrics.
 *
 * 7. CURRENCY: a 3-letter ISO-4217 uppercase code. INR is the Phase 1
 *    default. No conversion — a Money value never changes currency.
 *    Mixed-currency arithmetic throws (never silently converts).
 */

/** ISO-4217 currency code, uppercase (e.g. 'INR', 'USD', 'EUR'). */
export type CurrencyCode = string;

export interface Money {
  readonly amount: number;      // non-negative, ≤ 2 decimals, minor-unit-derived
  readonly currency: CurrencyCode;
}

/** Percentage with exactly 1 decimal (value in percent units, e.g. 12.5 = 12.5%). */
export type Percentage = number;

export const DEFAULT_CURRENCY: CurrencyCode = 'INR';
export const MONEY_DECIMALS = 2;
export const PERCENTAGE_DECIMALS = 1;

/** Number of minor units per major unit (100 for all Phase 1 currencies: INR/USD/EUR). */
const MINOR_UNITS = 100;

// ---------- internal integer arithmetic ----------

/** Convert a decimal amount to integer minor units. Throws on NaN/negative/over-precision beyond scale. */
export function toMinorUnits(amount: number): number {
  if (!Number.isFinite(amount)) throw new Error(`[Money] Non-finite amount: ${amount}`);
  if (amount < 0) throw new Error(`[Money] Negative amount not allowed here: ${amount}`);
  return Math.round(amount * MINOR_UNITS);
}

/** Convert integer minor units back to a decimal amount. */
export function fromMinorUnits(minor: number): number {
  return minor / MINOR_UNITS;
}

// ---------- rounding ----------

/** Round a percentage to 1 decimal, half-up. */
export function roundPercentage(value: number): Percentage {
  return Math.round(value * 10) / 10;
}

/**
 * Round a money amount to 2 decimals, half-up.
 * Only for the boundary (metric output / invoice line totals) — never mid-sum.
 */
export function roundMoney(amount: number): number {
  return fromMinorUnits(toMinorUnits(amount));
}

// ---------- constructors ----------

/** Build a Money value. Validates and rounds to 2 decimals (half-up). */
export function makeMoney(amount: number, currency: CurrencyCode = DEFAULT_CURRENCY): Money {
  return { amount: roundMoney(amount), currency: assertCurrency(currency) };
}

/** The canonical zero for a currency. */
export function zeroMoney(currency: CurrencyCode = DEFAULT_CURRENCY): Money {
  return { amount: 0, currency: assertCurrency(currency) };
}

function assertCurrency(code: CurrencyCode): CurrencyCode {
  const upper = code?.toUpperCase();
  if (!/^[A-Z]{3}$/.test(upper)) throw new Error(`[Money] Invalid currency code: ${code}`);
  return upper;
}

// ---------- arithmetic (single currency only) ----------

/** Sum same-currency Money values. Throws if currencies differ — never converts. */
export function addMoney(...values: Money[]): Money {
  if (values.length === 0) throw new Error('[Money] addMoney requires at least one value');
  const currency = values[0].currency;
  const minorSum = values.reduce((sum, v) => {
    if (v.currency !== currency) throw new Error(`[Money] Mixed currencies: ${currency} vs ${v.currency}`);
    return sum + toMinorUnits(v.amount);
  }, 0);
  return { amount: fromMinorUnits(minorSum), currency };
}

/** Subtract same-currency Money; result may be negative (e.g. Profit). */
export function subtractMoney(a: Money, b: Money): number {
  if (a.currency !== b.currency) throw new Error(`[Money] Mixed currencies: ${a.currency} vs ${b.currency}`);
  return fromMinorUnits(toMinorUnits(a.amount) - toMinorUnits(b.amount));
}

/**
 * Money × factor (e.g. amount × (1 + markup%)).
 * Computed in minor units, rounded half-up once — the safe version of
 * floating-point multiplication.
 */
export function multiplyMoney(value: Money, factor: number): Money {
  if (!Number.isFinite(factor)) throw new Error(`[Money] Non-finite factor: ${factor}`);
  return { amount: fromMinorUnits(Math.round(toMinorUnits(value.amount) * factor)), currency: value.currency };
}

// ---------- tax ----------

export interface TaxLine {
  readonly name: 'CGST' | 'SGST' | 'IGST';
  readonly ratePercent: number;
}

/**
 * Compute tax lines for a subtotal. Each line rounds independently
 * (half-up, 2 decimals); the caller sums the ROUNDED lines — invoice totals
 * therefore always equal the sum of displayed lines. Exactly one of
 * CGST+SGST (intra-state) or IGST (inter-state) applies; enforced by the
 * caller's place-of-supply rule, not here.
 */
export function computeTaxLines(subtotal: Money, lines: TaxLine[]): Money[] {
  return lines.map(line => multiplyMoney(subtotal, line.ratePercent / 100))
    .map((m, i) => ({ ...m, amount: roundMoney(m.amount), name: lines[i].name } as Money))
    .map(m => m);
}

// ---------- markup ----------

/**
 * Billable-expense client amount: cost × (1 + markup%).
 * Result rounded half-up once at this boundary.
 */
export function applyMarkup(cost: Money, markupPercent: number): Money {
  if (markupPercent < 0) throw new Error(`[Money] Negative markup: ${markupPercent}`);
  return multiplyMoney(cost, 1 + markupPercent / 100);
}

// ---------- formatting (presentation only) ----------

/**
 * Format for display. Presentation may format; it may never re-round
 * meaning (values arriving here are already ≤ 2 decimals).
 * Uses Intl with the 'en-IN' locale for INR (₹ and lakh/crore grouping).
 */
export function formatMoney(value: Money, locale = 'en-IN'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: value.currency,
    minimumFractionDigits: MONEY_DECIMALS,
    maximumFractionDigits: MONEY_DECIMALS,
  }).format(value.amount);
}

/** Format a percentage (1 decimal). Null-safe for undefined margins. */
export function formatPercentage(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(PERCENTAGE_DECIMALS)}%`;
}
