"use client";

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { TrendingUp, ChevronRight } from 'lucide-react';
import type { MoneyMetric, PercentageMetric } from '@/lib/agency/types/metrics';
import { formatMoney, formatPercentage, type Money } from '@/lib/agency/types/money';

/**
 * Profitability Snapshot (Module 1.12).
 *
 *   Revenue        ₹15.2L
 *   Delivery Cost  ₹8.6L
 *   Gross Profit   ₹6.6L
 *   Gross Margin    43.4%
 *
 * NO FORMULAS HERE (Module 1.12 rule): Gross Profit and Gross Margin are
 * computed exclusively by the domain profitability engine
 * (lib/agency/domain/profitability.ts, definitions §4–§6) and flow through
 * the analytics service into these metric objects. This component displays
 * the numbers; it never derives one from another (Module 1.5 rule).
 * Revenue here is applicable revenue in scope — NOT collected cash.
 */

const INR = (amount: number) => formatMoney({ amount, currency: 'INR' } as Money);

interface ProfitabilitySnapshotProps {
  revenue: MoneyMetric;
  deliveryCost: MoneyMetric;
  grossProfit: MoneyMetric;
  grossMargin: PercentageMetric;
}

export function ProfitabilitySnapshot({ revenue, deliveryCost, grossProfit, grossMargin }: ProfitabilitySnapshotProps) {
  const ready = revenue.sourceReady;

  const lines: Array<{ label: string; display: string; emphasis?: boolean; tone?: string }> = [
    { label: 'Revenue', display: ready ? INR(revenue.value) : '—' },
    { label: 'Delivery Cost', display: ready ? INR(deliveryCost.value) : '—' },
    {
      label: 'Gross Profit',
      display: ready ? INR(grossProfit.value) : '—',
      emphasis: true,
      tone: ready && grossProfit.value < 0 ? 'text-rose-400' : 'text-white',
    },
    {
      label: 'Gross Margin',
      display: ready && grossMargin.sourceReady ? formatPercentage(grossMargin.value) : '—',
      emphasis: true,
      tone: 'text-white',
    },
  ];

  return (
    <Card className="bg-[#050505]">
      <CardHeader className="pb-3">
        <CardTitle className="text-[14px] flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-neutral-500" aria-hidden />
          Profitability
        </CardTitle>
        <CardDescription>Gross profit and margin — from the domain engine</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {!ready ? (
          // Pending state (Module 1.22): profitability needs projects and
          // delivery cost data — not ₹0 / 0%.
          <p className="text-[13px] text-neutral-600">Waiting for projects and delivery cost data</p>
        ) : (
          <div className="space-y-2">
            {lines.map(line => (
              <div
                key={line.label}
                className={`flex items-baseline justify-between gap-3 ${line.emphasis ? 'pt-1' : ''}`}
              >
                <span className={`text-[13px] ${line.emphasis ? 'font-medium text-neutral-200' : 'text-neutral-400'}`}>
                  {line.label}
                </span>
                <span
                  className={`tabular-nums tracking-tight ${
                    line.emphasis ? `text-[15px] font-semibold ${line.tone}` : 'text-[13px] text-neutral-300'
                  }`}
                >
                  {line.display}
                </span>
              </div>
            ))}
          </div>
        )}
        {/* Module 13 shipped /dashboard/agency/profitability — the full
            portfolio report is a real link now. */}
        <div className="mt-4 pt-3 border-t border-white/[0.06]">
          <Link
            href="/dashboard/agency/profitability"
            className="inline-flex items-center gap-1 text-[13px] text-neutral-300 hover:text-white transition-colors"
          >
            View Profitability Reports
            <ChevronRight className="w-3.5 h-3.5" aria-hidden />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
