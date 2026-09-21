"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Clock } from 'lucide-react';
import type { HoursMetric, PercentageMetric } from '@/lib/agency/types/metrics';
import { formatPercentage } from '@/lib/agency/types/money';

/**
 * Delivery Summary (Module 1.9 — hierarchy slot 5, Delivery Activity).
 *
 *   Total Hours   Billable   Non-Billable   Billable %
 *   1,240         910        330            73.4%
 *
 * Billable % is billable / total hours — computed in the domain service
 * (null when total hours = 0, per the no-baseline rule). This becomes
 * meaningful once Time Tracking exists; until then sourceReady=false
 * renders the well-defined empty state — never fabricated 0h or 0%.
 */

interface DeliverySummaryProps {
  totalHours: HoursMetric;
  billableHours: HoursMetric;
  nonBillableHours: HoursMetric;
  billablePercent: PercentageMetric;
}

function formatHours(value: number): string {
  return value.toLocaleString('en-IN');
}

export function DeliverySummary({ totalHours, billableHours, nonBillableHours, billablePercent }: DeliverySummaryProps) {
  const hoursReady = totalHours.sourceReady;

  const cards: Array<{ label: string; ready: boolean; display: string }> = [
    { label: 'Total Hours', ready: hoursReady, display: formatHours(totalHours.value) },
    { label: 'Billable', ready: billableHours.sourceReady, display: formatHours(billableHours.value) },
    { label: 'Non-Billable', ready: nonBillableHours.sourceReady, display: formatHours(nonBillableHours.value) },
    { label: 'Billable %', ready: billablePercent.sourceReady, display: formatPercentage(billablePercent.value) },
  ];

  return (
    <Card className="bg-[#050505]">
      <CardHeader className="pb-3">
        <CardTitle className="text-[14px] flex items-center gap-2">
          <Clock className="w-4 h-4 text-neutral-500" aria-hidden />
          Delivery Summary
        </CardTitle>
        <CardDescription>Hours logged and their billability</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {!hoursReady ? (
          // Pending state (Module 1.22): waiting for time tracking — no
          // fabricated 0h or 0%.
          <p className="text-[13px] text-neutral-600">Waiting for time tracking</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {cards.map(({ label, ready, display }) => (
              <div key={label}>
                <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">{label}</div>
                <div className="mt-1.5 text-[16px] font-semibold tabular-nums tracking-tight text-neutral-200">
                  {ready ? display : '—'}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
