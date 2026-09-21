"use client";

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { ChevronRight } from 'lucide-react';
import type { MoneyMetric, PercentageMetric } from '@/lib/agency/types/metrics';
import { formatMoney, formatPercentage, type Money } from '@/lib/agency/types/money';

/**
 * Receivables Summary (Module 1.10 — hierarchy slot 4, Billing & Cash).
 *
 *   Outstanding    Due this week    Overdue    Collection rate
 *
 * Three DISTINCT money states (Module 1.5 separation rules apply: these are
 * neither Collected nor Revenue — they are open invoice money by urgency)
 * plus the §117 after-Payments Cash Collection Rate (collected ÷ invoiced —
 * the one sanctioned cross-metric ratio; the money states stay separate).
 */

const INR = (amount: number) => formatMoney({ amount, currency: 'INR' } as Money);

interface ReceivablesSummaryProps {
  outstanding: MoneyMetric;
  dueSoon: MoneyMetric;
  overdue: MoneyMetric;
  /** §117 — collected ÷ invoiced; null means nothing invoiced yet. */
  cashCollectionRate: PercentageMetric;
}

export function ReceivablesSummary({ outstanding, dueSoon, overdue, cashCollectionRate }: ReceivablesSummaryProps) {
  const cards: Array<{ label: string; metric: MoneyMetric; tone?: string }> = [
    { label: 'Outstanding', metric: outstanding },
    { label: 'Due this week', metric: dueSoon },
    { label: 'Overdue', metric: overdue, tone: overdue.sourceReady && overdue.value > 0 ? 'text-amber-400' : undefined },
  ];

  return (
    <Card className="bg-[#050505]">
      <CardHeader className="pb-3">
        <CardTitle className="text-[14px]">Receivables</CardTitle>
        <CardDescription>Open invoice money by urgency</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {cards.map(({ label, metric, tone }) => (
            <div key={label}>
              <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">{label}</div>
              <div
                className={`mt-1.5 text-[16px] font-semibold tabular-nums tracking-tight ${tone ?? 'text-neutral-200'}`}
              >
                {!metric.sourceReady ? '—' : INR(metric.value)}
              </div>
              {/* Module 1.22 — pending source: name it, never show ₹0 */}
              {!metric.sourceReady && (
                <div className="mt-0.5 text-[10.5px] text-neutral-500 truncate">Waiting for invoicing</div>
              )}
            </div>
          ))}
          {/* §117 — the after-Payments collection rate (0–100 scale). */}
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Collection rate</div>
            <div className="mt-1.5 text-[16px] font-semibold tabular-nums tracking-tight text-neutral-200">
              {!cashCollectionRate.sourceReady ? '—' : formatPercentage(cashCollectionRate.value)}
            </div>
            {!cashCollectionRate.sourceReady && (
              <div className="mt-0.5 text-[10.5px] text-neutral-500 truncate">Waiting for payments</div>
            )}
            {cashCollectionRate.sourceReady && cashCollectionRate.value === null && (
              <div className="mt-0.5 text-[10.5px] text-neutral-500 truncate">Nothing invoiced yet</div>
            )}
          </div>
        </div>

        {/* Module 14 shipped /dashboard/agency/receivables (§100) — the A/R
            operating view (list, aging ladder, by-client/project) now exists;
            the dashboard card deep-links there instead of the invoice list. */}
        <div className="mt-4 pt-3 border-t border-white/[0.06]">
          <Link
            href="/dashboard/agency/receivables"
            className="inline-flex items-center gap-1 text-[13px] text-neutral-300 hover:text-white transition-colors"
          >
            View Receivables
            <ChevronRight className="w-3.5 h-3.5" aria-hidden />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
