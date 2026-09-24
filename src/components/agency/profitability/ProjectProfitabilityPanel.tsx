"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { TriangleAlert, Wallet, Receipt, Coins } from 'lucide-react';
import type {
  ProjectProfitability, ProfitabilityDrillDown, ProjectFinancialHealth,
} from '@/lib/agency/types/profitability';

/**
 * Project Profitability tab (Module 13 §70/§82) — the answer to "did this
 * project actually make money?"
 *
 * §70 — THIS COMPONENT ONLY RENDERS. Every number comes from
 * GET /api/agency/projects/:id/profitability (the one financial engine);
 * nothing is derived, summed or recalculated in React, so this view and the
 * reports can never disagree.
 *
 * The five dimensions (§60) never collapse — especially §66: collected cash
 * is shown BESIDE profitability, never inside it. §82: a null margin renders
 * "N/A", never a fake 0%. §83: percentages render at exactly 1 decimal.
 */
interface ProfitabilityResponse {
  success: boolean;
  project: { id: string; name: string; currency: string; billingModel: string };
  profitability: ProjectProfitability;
  drillDown: ProfitabilityDrillDown;
}

const REVENUE_MODEL_LABEL: Record<string, string> = {
  FIXED_FEE: 'Contract value (fixed fee)',
  TIME_MATERIALS: 'Approved billable time',
  MILESTONE: 'Completed milestones',
};

const HEALTH_STYLE: Record<ProjectFinancialHealth, { chip: string; icon: string }> = {
  HEALTHY: { chip: 'text-emerald-300 bg-emerald-400/10 border-emerald-500/25', icon: 'text-emerald-400' },
  WATCH: { chip: 'text-amber-300 bg-amber-400/10 border-amber-500/25', icon: 'text-amber-400' },
  AT_RISK: { chip: 'text-orange-300 bg-orange-400/10 border-orange-500/25', icon: 'text-orange-400' },
  OVER_BUDGET: { chip: 'text-red-300 bg-red-400/10 border-red-500/25', icon: 'text-red-400' },
};

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('en-IN')}`;
  }
}

/** §83 — percentages render at exactly 1 decimal (full precision stays in the engine). */
function pct(value: number | null, suffix = '%'): string {
  return value === null ? '—' : `${value.toFixed(1)}${suffix}`;
}

/** A burn ratio is 0–1 in the payload; display multiplies by 100. */
function burnPct(ratio: number | null): string {
  return ratio === null ? 'no baseline' : `${(ratio * 100).toFixed(1)}%`;
}

export function ProjectProfitabilityPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<ProfitabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/agency/projects/${projectId}/profitability`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => { setData(body); setError(null); })
      .catch(() => setError('We couldn\'t load this project\'s profitability.'))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading project profitability">
        <div className="h-24 rounded-xl bg-white/[0.03] animate-pulse" />
        <div className="h-32 rounded-xl bg-white/[0.03] animate-pulse" />
        <div className="h-40 rounded-xl bg-white/[0.03] animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div role="alert" className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-[13px] text-neutral-200">
        {error || 'Profitability is unavailable for this project.'}
      </div>
    );
  }

  const p = data.profitability;
  const cur = p.currency;
  const health = HEALTH_STYLE[p.health];

  return (
    <section className="space-y-4" aria-label="Project profitability">

      {/* Verdict banner (§75/§76/§77) — health, the explaining margin alert, hours warning */}
      <div className={`rounded-xl border p-4 flex flex-wrap items-start gap-3 ${health.chip}`}>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-current text-[11px] font-semibold uppercase tracking-wider">
          <TriangleAlert className="w-3.5 h-3.5" aria-hidden /> {p.health.replace('_', ' ')}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          {p.marginAlert && (
            <p className="text-[13px]">
              <strong className="font-semibold">{p.marginAlert.severity === 'CRITICAL' ? 'Margin alert:' : 'Margin watch:'}</strong>{' '}
              {p.marginAlert.reason}
            </p>
          )}
          {p.hoursWarning && <p className="text-[13px]">{p.hoursWarning.message}</p>}
          {!p.marginAlert && !p.hoursWarning && (
            <p className="text-[13px] opacity-80">
              Delivery is tracking within its budgets{p.targetMargin !== null ? ` and at or above the ${p.targetMargin}% target margin` : ''}.
            </p>
          )}
        </div>
        {/* §82 — the headline margin; N/A when revenue is zero, never a fake 0%. */}
        <div className="text-right shrink-0">
          <div className="text-[11px] font-medium uppercase tracking-wider opacity-70">Margin</div>
          <div className="text-[22px] font-semibold tabular-nums">
            {p.marginPercent === null ? 'N/A' : `${p.marginPercent.toFixed(1)}%`}
          </div>
          {p.targetMargin !== null && <div className="text-[11px] opacity-70">target {p.targetMargin}%</div>}
        </div>
      </div>

      {/* The five dimensions (§60) — revenue vs cost is NEVER cash */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-4 space-y-3">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            <Coins className="w-3.5 h-3.5" aria-hidden /> Profitability
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
            <div>
              <dt className="text-neutral-500 text-[12px]">Applicable revenue</dt>
              <dd className="mt-0.5 font-semibold text-neutral-100 tabular-nums">{money(p.applicableRevenue.amount, cur)}</dd>
              <p className="text-[11px] text-neutral-600">{REVENUE_MODEL_LABEL[p.revenueModel]}</p>
            </div>
            <div>
              <dt className="text-neutral-500 text-[12px]">Delivery cost</dt>
              <dd className="mt-0.5 font-semibold text-neutral-100 tabular-nums">{money(p.deliveryCost.amount, cur)}</dd>
              <p className="text-[11px] text-neutral-600">
                labor {money(p.laborCost.amount, cur)} · expenses {money(p.expenseCost.amount, cur)}
              </p>
            </div>
            <div>
              <dt className="text-neutral-500 text-[12px]">Gross profit</dt>
              <dd className={`mt-0.5 font-semibold tabular-nums ${p.grossProfit.amount < 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                {money(p.grossProfit.amount, cur)}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500 text-[12px]">Gross Margin</dt>
              <dd className="mt-0.5 font-semibold text-neutral-100 tabular-nums">
                {p.marginPercent === null ? <span className="text-neutral-500">N/A — no revenue yet</span> : `${p.marginPercent.toFixed(1)}%`}
              </dd>
            </div>
            <div className="col-span-2 pt-1 border-t border-white/[0.05]">
              <dt className="text-neutral-500 text-[12px]">Contract Value</dt>
              <dd className="mt-0.5 text-neutral-200 tabular-nums">{p.contractValue ? money(p.contractValue.amount, cur) : '—'}</dd>
            </div>
          </dl>
        </div>

        {/* §66 — cash is a separate view: billed/collected never touch the margin above. */}
        <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-4 space-y-3">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            <Wallet className="w-3.5 h-3.5" aria-hidden /> Cash & Invoicing
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
            <div>
              <dt className="text-neutral-500 text-[12px]">Billed (issued invoices)</dt>
              <dd className="mt-0.5 font-semibold text-neutral-100 tabular-nums">{money(p.billedAmount.amount, cur)}</dd>
            </div>
            <div>
              <dt className="text-neutral-500 text-[12px]">Collected</dt>
              <dd className="mt-0.5 font-semibold text-neutral-100 tabular-nums">{money(p.collectedAmount.amount, cur)}</dd>
            </div>
            <div>
              <dt className="text-neutral-500 text-[12px]">Outstanding (receivable)</dt>
              <dd className="mt-0.5 text-neutral-200 tabular-nums">{money(p.outstandingAmount.amount, cur)}</dd>
            </div>
            <div>
              <dt className="text-neutral-500 text-[12px]">Unbilled Work</dt>
              <dd className="mt-0.5 text-neutral-200 tabular-nums">{money(p.unbilledAmount.amount, cur)}</dd>
            </div>
          </dl>
          <p className="text-[11px] text-neutral-600">
            Collecting payments settles customer invoices. Margin and profitability reflect delivery cost versus earned revenue.
          </p>
        </div>
      </div>

      {/* §74 — three separate burns, never one generic percentage */}
      <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-4 space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Budget Burn</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <div className="text-[12px] text-neutral-500">Hours</div>
            <div className="mt-0.5 text-[14px] font-semibold text-neutral-200 tabular-nums">{burnPct(p.burn.hours)}</div>
            <p className="text-[11px] text-neutral-600">
              {p.plannedHours !== null
                ? `${p.actualHours}h logged of ${p.plannedHours}h planned${p.remainingHours !== null ? ` · ${p.remainingHours}h remaining` : ''}`
                : `${p.actualHours}h logged — no planned baseline`}
            </p>
          </div>
          <div>
            <div className="text-[12px] text-neutral-500">Cost</div>
            <div className="mt-0.5 text-[14px] font-semibold text-neutral-200 tabular-nums">{burnPct(p.burn.cost)}</div>
            <p className="text-[11px] text-neutral-600">{money(p.deliveryCost.amount, cur)} delivered</p>
          </div>
          <div>
            <div className="text-[12px] text-neutral-500">Revenue</div>
            <div className="mt-0.5 text-[14px] font-semibold text-neutral-200 tabular-nums">{burnPct(p.burn.revenue)}</div>
            <p className="text-[11px] text-neutral-600">informational — never a health input</p>
          </div>
        </div>
      </div>

      {/* §78 — the drill-down: trustworthy margin lines */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/[0.06] overflow-hidden overflow-x-auto">
          <div className="px-4 py-2.5 border-b border-white/[0.06] text-[11px] font-medium uppercase tracking-wider text-neutral-500 flex items-center gap-2">
            <Receipt className="w-3.5 h-3.5" aria-hidden /> Labor by team member
          </div>
          {data.drillDown.labor.length === 0 ? (
            <p className="p-4 text-[13px] text-neutral-500">No approved time yet.</p>
          ) : (
            <table className="w-full text-[13px]" aria-label="Labor cost breakdown">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                  <th scope="col" className="px-4 py-2 font-medium">Member</th>
                  <th scope="col" className="px-4 py-2 font-medium">Hours × rate</th>
                  <th scope="col" className="px-4 py-2 font-medium text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.drillDown.labor.map((l, i) => (
                  <tr key={`${l.userId}-${i}`} className="border-b border-white/[0.04] last:border-0">
                    <td className="px-4 py-2 text-neutral-200">{l.userName || 'Former member'}</td>
                    <td className="px-4 py-2 text-neutral-400 tabular-nums">
                      {l.hours}h × {l.rate ? money(l.rate.amount, cur) : 'rate unassigned'}
                      <span className="text-neutral-600"> · {l.entryCount} entr{l.entryCount === 1 ? 'y' : 'ies'}</span>
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-200 tabular-nums">{money(l.cost.amount, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-xl border border-white/[0.06] overflow-hidden overflow-x-auto">
          <div className="px-4 py-2.5 border-b border-white/[0.06] text-[11px] font-medium uppercase tracking-wider text-neutral-500 flex items-center gap-2">
            <Receipt className="w-3.5 h-3.5" aria-hidden /> Expenses by vendor
          </div>
          {data.drillDown.expenses.length === 0 ? (
            <p className="p-4 text-[13px] text-neutral-500">No approved expenses yet.</p>
          ) : (
            <table className="w-full text-[13px]" aria-label="Expense cost breakdown">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                  <th scope="col" className="px-4 py-2 font-medium">Vendor</th>
                  <th scope="col" className="px-4 py-2 font-medium">Items</th>
                  <th scope="col" className="px-4 py-2 font-medium text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.drillDown.expenses.map((e, i) => (
                  <tr key={`${e.vendorName}-${i}`} className="border-b border-white/[0.04] last:border-0">
                    <td className="px-4 py-2 text-neutral-200">{e.vendorName}</td>
                    <td className="px-4 py-2 text-neutral-400 tabular-nums">{e.expenseCount}</td>
                    <td className="px-4 py-2 text-right text-neutral-200 tabular-nums">{money(e.cost.amount, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* §79 — explainability notes (deterministic, never speculation) */}
      {(p.notes.length > 0 || p.currencyMismatches > 0) && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4 space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-wider text-amber-400/80">Exclusions and Notes</div>
          <ul className="space-y-1">
            {p.notes.map((n, i) => (
              <li key={i} className="text-[12.5px] text-amber-100/80">{n}</li>
            ))}
            {p.currencyMismatches > 0 && (
              <li className="text-[12.5px] text-amber-100/80">
                {p.currencyMismatches} source item{p.currencyMismatches === 1 ? '' : 's'} in another currency — excluded from direct conversion.
              </li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
