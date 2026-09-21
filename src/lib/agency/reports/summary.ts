/**
 * Agency Vertical — Reports: shared summary fold (Module 16, §29/§41)
 *
 * CLIENT-SAFE: pure functions only. No server imports.
 *
 * The one discipline every report summary shares (§127 + the Module 13
 * engine's own fold, mirrored exactly so an unfiltered report summary is
 * numerically IDENTICAL to the engine's):
 *
 *   - rows carry their source currency; a summary over rows that MIX
 *     currencies is null money + mixedCurrencies: true (counts stay real —
 *     never a converted number, never a fake single total);
 *   - margin is Σprofit / Σrevenue × 100 (§29 WEIGHTED — never a naive
 *     average of row percentages), null when Σrevenue = 0 (§82);
 *   - a "known-optional" field (contractValue — some projects never
 *     negotiated one) totals to null unless EVERY row carries it: a Σ that
 *     silently skips the unknown rows lies;
 *   - profit may be negative — a loss is a real number (§64).
 */

/** What foldCurrencySummary needs from a row. */
export interface CurrencyRow {
  currency: string;
}

/** The §127 outcome every report summary shares. */
export interface CurrencyFold {
  currency: string | null;
  mixedCurrencies: boolean;
}

/**
 * Fold the rows' currencies: the single currency when all rows share one;
 * null + mixedCurrencies when they do not. An empty row set folds to
 * currency null, mixed false (no money exists — that is not "mixed").
 */
export function foldCurrency(rows: readonly CurrencyRow[]): CurrencyFold {
  if (rows.length === 0) return { currency: null, mixedCurrencies: false };
  const first = rows[0].currency;
  const mixed = rows.some(r => r.currency !== first);
  return mixed ? { currency: null, mixedCurrencies: true } : { currency: first, mixedCurrencies: false };
}

/**
 * Sum a numeric row field over single-currency rows. Mixed-currency callers
 * must not use the result (they report nulls by contract); this helper only
 * guarantees a real number for rows already known to share a currency.
 * `pick` returning null on a row (an unknown contract value) makes the whole
 * sum null — the known-optional discipline above.
 */
export function sumRows<Row>(rows: readonly Row[], pick: (row: Row) => number | null): number | null {
  let total = 0;
  for (const row of rows) {
    const value = pick(row);
    if (value === null) return null;
    total += value;
  }
  return total;
}

/**
 * §29/§82 — the weighted margin: Σprofit / Σrevenue × 100. Null when
 * Σrevenue = 0 (no baseline — "N/A", never a fabricated 0% or ±∞) or when
 * either total is unknown (null on mixed/optional fields).
 */
export function weightedMarginPercent(
  totalProfit: number | null,
  totalRevenue: number | null
): number | null {
  if (totalProfit === null || totalRevenue === null) return null;
  if (totalRevenue === 0) return null;
  return (totalProfit / totalRevenue) * 100;
}
