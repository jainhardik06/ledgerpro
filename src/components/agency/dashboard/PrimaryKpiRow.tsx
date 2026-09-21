"use client";

import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import type { MoneyMetric } from '@/lib/agency/types/metrics';
import { formatMoney, formatPercentage, type Money } from '@/lib/agency/types/money';
import type { MetricDelta } from '@/lib/agency/types/agency.dashboard';

/**
 * Primary financial card (Module 1.4 + 1.5) — the four strategic KPIs.
 *
 * Card contract:
 *   value            from the domain contract (never recomputed)
 *   definition       full definitions-doc reference, in the tooltip
 *   one-liner        distinct basis statement, always visible
 *   delta            vs previous period; null → "—" (no fabricated ±∞)
 *   sourceReady      false → awaiting-source state, NOT ₹0
 *
 * MODULE 1.5 RULE — METRIC SEPARATION:
 *   Contract Value, Invoiced, Collected, and Unbilled are four DISTINCT
 *   metrics. No card may display, hint at, or be derived from another's
 *   value. `displayBasis` makes each card's identity explicit (what the
 *   number IS), so the UI can never imply Collected = Revenue.
 *   The only permissible cross-metric display is the delta chip (this card
 *   vs the SAME metric in the previous period) — never another metric.
 */

interface PrimaryCardProps {
  label: string;
  metric: MoneyMetric;
  /** What the number IS — the metric's distinct identity (definitions §). */
  displayBasis: string;
  /** Full definition for the tooltip (title attr). */
  definition: string;
  delta: MetricDelta | null;
  /** Module 1.22 — why the value is pending (rendered under the "—"). */
  pendingNote?: string;
  tone?: 'neutral' | 'positive' | 'warning';
}

export function PrimaryCard({ label, metric, displayBasis, definition, delta, pendingNote, tone = 'neutral' }: PrimaryCardProps) {
  const TONE: Record<string, string> = {
    neutral: 'text-white',
    positive: 'text-emerald-400',
    warning: 'text-amber-400',
  };

  return (
    <Card className="bg-[#050505]">
      <CardContent className="p-4">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 truncate">{label}</div>
          {/* Delta vs previous period — same metric only, never another metric.
              Module 1.24: direction announced as text, not arrow/color alone. */}
          {metric.sourceReady && delta && delta.deltaPercent !== null && (
            <span
              className={`text-[11px] font-medium tabular-nums flex items-center gap-0.5 ${
                delta.deltaPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
              title={`vs previous period: ${formatMoney({ amount: delta.previousValue, currency: 'INR' } as Money)}`}
            >
              {delta.deltaPercent >= 0
                ? <ArrowUpRight className="w-3 h-3" aria-hidden />
                : <ArrowDownRight className="w-3 h-3" aria-hidden />}
              <span className="sr-only">{delta.deltaPercent >= 0 ? 'up' : 'down'} </span>
              {formatPercentage(delta.deltaPercent)}
            </span>
          )}
        </div>

        {!metric.sourceReady ? (
          // Pending state (Module 1.22): explicitly NOT ₹0 — name the awaited
          // source; never render an unwired capability as zero.
          <>
            <div className="mt-2 text-[22px] font-semibold tracking-tight text-neutral-600" title={definition}>
              <span className="sr-only">{label}: {pendingNote || 'Not available yet'} — </span>
              —
            </div>
            <div className="text-[10.5px] text-neutral-500 truncate">{pendingNote || 'Not available yet'}</div>
          </>
        ) : (
          <div className={`mt-2 text-[22px] font-semibold tracking-tight tabular-nums ${TONE[tone]}`} title={definition}>
            {formatMoney({ amount: metric.value, currency: 'INR' } as Money)}
          </div>
        )}

        {/* The distinct metric identity — visible on every card (Module 1.5) */}
        <div className="mt-1 text-[11px] text-neutral-600 truncate">{displayBasis}</div>
      </CardContent>
    </Card>
  );
}

/**
 * The four strategic cards (Module 1.4) — one row on desktop, stacked on mobile.
 * Each card names a DIFFERENT metric; no two cards share a basis (Module 1.5):
 *
 *   Contract Value — what the work is worth commercially (§1 Revenue)
 *   Invoiced       — what has been invoiced (§2 Billed)
 *   Collected      — what clients have actually paid (§3 Collected)
 *   Unbilled       — approved billable work awaiting invoicing (§7)
 */
export function PrimaryKpiRow({
  contractedRevenue, billedRevenue, collectedRevenue, unbilledRevenue,
  deltas,
}: {
  contractedRevenue: MoneyMetric;
  billedRevenue: MoneyMetric;
  collectedRevenue: MoneyMetric;
  unbilledRevenue: MoneyMetric;
  deltas: {
    contractedRevenue: MetricDelta | null;
    billedRevenue: MetricDelta | null;
    collectedRevenue: MetricDelta | null;
    unbilledRevenue: MetricDelta | null;
  };
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      <PrimaryCard
        label="Contract Value"
        metric={contractedRevenue}
        displayBasis="Committed commercial value (not cash)"
        definition="Total active commercial value associated with agency projects in the selected reporting scope. Definitions §1 — Revenue. This is a contract measure, NOT invoiced and NOT collected money."
        delta={deltas.contractedRevenue}
        pendingNote="Waiting for projects"
      />
      <PrimaryCard
        label="Invoiced"
        metric={billedRevenue}
        displayBasis="Invoices issued (not payments)"
        definition="Total invoice value issued during the selected period. Definitions §2 — Billed. An invoice is money owed, not money received."
        delta={deltas.billedRevenue}
        pendingNote="Waiting for invoicing"
      />
      <PrimaryCard
        label="Collected"
        metric={collectedRevenue}
        displayBasis="Cash actually received"
        definition="Payments successfully recorded/settled during the selected period. Definitions §3 — Collected. This is received cash, independent of contract value and invoiced amounts."
        delta={deltas.collectedRevenue}
        pendingNote="Waiting for payment records"
      />
      <PrimaryCard
        label="Unbilled"
        metric={unbilledRevenue}
        displayBasis="Approved billable, not invoiced"
        definition="Approved billable agency work that has not yet been invoiced. Definitions §7 — Unbilled. Strategically critical: profit on paper while cash waits."
        delta={deltas.unbilledRevenue}
        pendingNote="Waiting for time tracking"
        tone="warning"
      />
    </div>
  );
}
