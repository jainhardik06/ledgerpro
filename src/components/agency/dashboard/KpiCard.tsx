"use client";

import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import type { MoneyMetric, CountMetric, HoursMetric, PercentageMetric } from '@/lib/agency/types/metrics';
import { formatMoney, formatPercentage, type Money } from '@/lib/agency/types/money';
import { NOT_AVAILABLE_YET } from '@/lib/agency/types/screen-state';

/**
 * Agency KPI stat tile (Module 1.2).
 *
 * Renders ONE metric. Rules from the state contract (screen-state.ts):
 *   - `sourceReady: false` → pending state (Module 1.22): the metric's owning
 *     source is not wired yet — "Not available yet", never zero. Pass
 *     `pendingNote` to name the awaited source ("Waiting for time tracking").
 *   - Undefined percentages (null) → "—" — never 0%.
 * Presentation only: no recomputation, no fallback math.
 */

type AnyMetric = MoneyMetric | CountMetric | HoursMetric | PercentageMetric;

interface KpiCardProps {
  label: string;
  metric: AnyMetric;
  /** Optional second line (e.g. comparison or context). */
  hint?: string;
  /** Module 1.22 — why the value is pending (rendered under the "—"). */
  pendingNote?: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'critical';
}

const TONE_CLASS: Record<NonNullable<KpiCardProps['tone']>, string> = {
  neutral: 'text-white',
  positive: 'text-emerald-400',
  warning: 'text-amber-400',
  critical: 'text-rose-400',
};

function formatMetricValue(metric: AnyMetric): string {
  switch (metric.kind) {
    case 'money':
      return formatMoney({ amount: metric.value, currency: 'INR' } as Money);
    case 'count':
    case 'hours':
      return metric.kind === 'hours' ? `${metric.value.toFixed(1)}h` : String(metric.value);
    case 'percentage':
      return formatPercentage(metric.value);
  }
}

export function KpiCard({ label, metric, hint, pendingNote, tone = 'neutral' }: KpiCardProps) {
  return (
    <Card className="bg-[#050505]">
      <CardContent className="p-4">
        <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">{label}</div>

        {!metric.sourceReady ? (
          // Pending state (Module 1.22): explicitly NOT ₹0 — the metric's
          // source is not wired yet; name what we're waiting for.
          <>
            <div className="mt-2 text-[20px] font-semibold tracking-tight text-neutral-600">
              <span className="sr-only">{label}: {pendingNote || NOT_AVAILABLE_YET}</span>
              —
            </div>
            <div className="mt-0.5 text-[10.5px] text-neutral-500 truncate">{pendingNote || NOT_AVAILABLE_YET}</div>
          </>
        ) : (
          <div className={`mt-2 text-[20px] font-semibold tracking-tight ${TONE_CLASS[tone]}`}>
            {formatMetricValue(metric)}
          </div>
        )}

        {hint && <div className="mt-1 text-[11px] text-neutral-600 truncate">{hint}</div>}
      </CardContent>
    </Card>
  );
}
