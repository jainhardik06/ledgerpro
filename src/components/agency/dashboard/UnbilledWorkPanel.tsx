"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Wallet } from 'lucide-react';
import type { AgencyUnbilledSummary } from '@/lib/agency/types/agency.dashboard';
import { formatMoney, type Money } from '@/lib/agency/types/money';

/**
 * Unbilled Work panel (Module 1.11).
 *
 * PURPOSE: identify revenue leakage BEFORE it becomes lost revenue — hence
 * the panel is visually prominent (amber accent, top-level weight in the
 * Billing & Cash section, total set larger than its parts).
 *
 * Layout mirrors the spec:
 *
 *   Unbilled Time        ₹1.2L
 *   Unbilled Expenses    ₹34K
 *   Unbilled Milestones  ₹80K
 *   ────────────────────────────
 *   Total Unbilled       ₹2.14L
 *
 * The total is the SUM of the three lines, computed in the domain service
 * (types/agency.dashboard.ts AgencyUnbilledSummary) — this component only
 * displays; it never adds numbers itself (Module 1.5 no-inference rule).
 */

const INR = (amount: number) => formatMoney({ amount, currency: 'INR' } as Money);

interface UnbilledWorkPanelProps {
  unbilled: AgencyUnbilledSummary;
  /** sourceReady — false renders the well-defined awaiting-source state. */
  sourceReady: boolean;
}

export function UnbilledWorkPanel({ unbilled, sourceReady }: UnbilledWorkPanelProps) {
  const lines: Array<{ label: string; amount: number }> = [
    { label: 'Unbilled Time', amount: unbilled.unbilledTime },
    { label: 'Unbilled Expenses', amount: unbilled.unbilledExpenses },
    { label: 'Unbilled Milestones', amount: unbilled.unbilledMilestones },
  ];

  return (
    <Card className="bg-[#050505] border-amber-500/[0.18]">
      <CardHeader className="pb-3">
        <CardTitle className="text-[14px] flex items-center gap-2">
          <Wallet className="w-4 h-4 text-amber-400" aria-hidden />
          Unbilled Work
        </CardTitle>
        <CardDescription>Revenue leakage before it becomes lost revenue</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {!sourceReady ? (
          // Pending state (Module 1.22): splits arrive with their sources —
          // never ₹0 masquerading as data.
          <p className="text-[13px] text-neutral-600">Waiting for time, expense, and milestone tracking</p>
        ) : (
          <div className="space-y-2">
            {lines.map(line => (
              <div key={line.label} className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] text-neutral-400">{line.label}</span>
                <span className="text-[13px] text-neutral-300 tabular-nums">{INR(line.amount)}</span>
              </div>
            ))}
            <div className="border-t border-white/[0.08] my-1" aria-hidden />
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-medium text-white">Total Unbilled</span>
              <span className="text-[18px] font-semibold text-amber-400 tabular-nums tracking-tight">
                {INR(unbilled.totalUnbilled)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
