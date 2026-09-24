"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { TrendingUp } from 'lucide-react';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';
import { tenantHasCapability } from '@/lib/agency/types/vertical';
import type {
  PortfolioProfitability, ProjectProfitability, ProjectFinancialHealth,
} from '@/lib/agency/types/profitability';
import { PROJECT_STATUSES } from '@/lib/agency/types/project';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';

/**
 * Portfolio Profitability (Module 13 §81) — the reports view over the ONE
 * financial engine: every lens (Project Profitability, Client Profitability,
 * Margin by Project, Cost by Project, Budget Burn, Unbilled Work) renders the
 * SAME rows from GET /api/agency/profitability, only re-ordered or
 * re-emphasized. §70 — nothing is calculated here; a lens may sort or hide
 * engine-computed values but never derives one.
 *
 * §82 — a null margin renders "N/A". §83 — percentages at exactly 1 decimal.
 * §127 — a currency-mixing portfolio shows null totals with an honest
 * "mixed currencies" label, never a converted number.
 */
type Lens = 'projects' | 'clients' | 'margin' | 'cost' | 'burn' | 'unbilled';

const LENSES: ReadonlyArray<{ key: Lens; label: string }> = [
  { key: 'projects', label: 'Project Profitability' },
  { key: 'clients', label: 'Client Profitability' },
  { key: 'margin', label: 'Margin by Project' },
  { key: 'cost', label: 'Cost by Project' },
  { key: 'burn', label: 'Budget Burn' },
  { key: 'unbilled', label: 'Unbilled Work' },
];

const HEALTH_STYLE: Record<ProjectFinancialHealth, string> = {
  HEALTHY: 'text-emerald-300 bg-emerald-400/10',
  WATCH: 'text-amber-300 bg-amber-400/10',
  AT_RISK: 'text-orange-300 bg-orange-400/10',
  OVER_BUDGET: 'text-red-300 bg-red-400/10',
};

const REVENUE_MODEL_SHORT: Record<string, string> = {
  FIXED_FEE: 'Fixed fee',
  TIME_MATERIALS: 'T&M',
  MILESTONE: 'Milestone',
};

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('en-IN')}`;
  }
}

function pct(value: number | null): string {
  return value === null ? 'N/A' : `${value.toFixed(1)}%`;
}

function burnPct(ratio: number | null): string {
  return ratio === null ? '—' : `${(ratio * 100).toFixed(1)}%`;
}

const inputCls = 'px-3 py-1.5 rounded-lg bg-[#0a0a0a] border border-white/[0.06] text-[12.5px] text-white focus:outline-none focus:border-white/20';

interface ClientOption { id: string; name: string }

export default function PortfolioProfitabilityPage() {
  const { tenant, loading: sessionLoading } = useDashboardContext();
  const allowed = tenantHasCapability(tenant, 'AGENCY_DASHBOARD');

  const [portfolio, setPortfolio] = useState<PortfolioProfitability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lens, setLens] = useState<Lens>('projects');

  // §80 filters — from/to select PROJECTS by start date; invalid values are
  // impossible from these controls (date inputs + a fixed status list).
  const [clientId, setClientId] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [clients, setClients] = useState<ClientOption[]>([]);

  useEffect(() => {
    if (!allowed) return;
    fetch('/api/agency/clients')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => setClients((body.clients || []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))))
      .catch(() => setClients([]));
  }, [allowed]);

  const load = useCallback(() => {
    if (sessionLoading || !allowed) return;
    setLoading(true);
    const p = new URLSearchParams();
    if (clientId) p.set('clientId', clientId);
    if (status) p.set('status', status);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    fetch(`/api/agency/profitability?${p.toString()}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => { setPortfolio(body.portfolio); setError(null); })
      .catch(() => setError('We couldn\'t load portfolio profitability. Try again.'))
      .finally(() => setLoading(false));
  }, [sessionLoading, allowed, clientId, status, from, to]);

  useEffect(() => {
    if (!sessionLoading && allowed) load();
  }, [load, sessionLoading, allowed]);

  // A lens may RE-ORDER engine-computed rows (§81 "the same rows, each report
  // a different sort") — it never derives a value (§70).
  const rows: readonly ProjectProfitability[] = useMemo(() => {
    const list = portfolio?.projects ?? [];
    if (lens === 'margin') return [...list].sort((a, b) => (b.marginPercent ?? -Infinity) - (a.marginPercent ?? -Infinity));
    if (lens === 'cost') return [...list].sort((a, b) => b.deliveryCost.amount - a.deliveryCost.amount);
    if (lens === 'unbilled') return [...list].sort((a, b) => b.unbilledAmount.amount - a.unbilledAmount.amount);
    return list; // projects/burn keep the API's problems-first order
  }, [portfolio, lens]);

  if (!sessionLoading && !allowed) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <h1 className="text-[16px] font-semibold text-white">Agency workspace required</h1>
        <p className="mt-2 text-[13px] text-neutral-500">Profitability reports are an Agency workspace feature.</p>
      </div>
    );
  }

  const s = portfolio?.summary;
  const singleCurrency = s && !s.mixedCurrencies;
  const cur = portfolio?.projects[0]?.currency ?? 'INR';

  return (
    <div className="p-4 sm:p-6 space-y-5 w-full">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[18px] font-semibold text-white tracking-tight">Profitability</h1>
          <p className="mt-1 text-[12.5px] text-neutral-500">
            Unified reporting — margins, costs, burns and unbilled work consistently aligned across all projects.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            aria-label="Filter by client"
            className={inputCls}
            wrapperClassName="w-full sm:w-44 shrink-0"
          >
            <option value="">All clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select
            value={status}
            onChange={e => setStatus(e.target.value)}
            aria-label="Filter by project status"
            className={inputCls}
            wrapperClassName="w-full sm:w-40 shrink-0"
          >
            <option value="">All statuses</option>
            {PROJECT_STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
          </Select>
          <DatePicker wrapperClassName="w-36" value={from} onChange={e => setFrom(e.target.value)} aria-label="Projects starting from" />
          <span className="text-[12px] text-neutral-600">→</span>
          <DatePicker wrapperClassName="w-36" value={to} min={from} onChange={e => setTo(e.target.value)} aria-label="Projects starting until" />
        </div>
      </div>
      <p className="-mt-3 text-[11px] text-neutral-600">
        The date filter selects projects by start date across their full lifecycle.
      </p>

      {/* Portfolio totals (§81) — null money on mixed currencies is honest, never converted (§127) */}
      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {([
            ['Projects', String(s.projectCount), false],
            ['Contract value', s.contractValue ? money(s.contractValue.amount, cur) : '—', false],
            ['Revenue', singleCurrency && s.applicableRevenue ? money(s.applicableRevenue.amount, cur) : null, s.mixedCurrencies],
            ['Delivery cost', singleCurrency && s.deliveryCost ? money(s.deliveryCost.amount, cur) : null, s.mixedCurrencies],
            ['Gross profit', singleCurrency && s.grossProfit ? money(s.grossProfit.amount, cur) : null, s.mixedCurrencies],
            ['Margin', singleCurrency ? pct(s.marginPercent) : null, s.mixedCurrencies],
            ['Unbilled', singleCurrency && s.unbilledAmount ? money(s.unbilledAmount.amount, cur) : null, s.mixedCurrencies],
          ] as Array<[string, string | null, boolean]>).map(([label, value, mixed]) => (
            <div key={label} className="rounded-xl border border-white/[0.06] bg-[#050505] p-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 truncate">{label}</div>
              <div className="mt-1 text-[14px] font-semibold tabular-nums text-neutral-200">
                {value ?? <span className="text-amber-400/80 text-[12px] font-medium" title="Projects in this view use multiple distinct currencies">mixed currencies</span>}
              </div>
              {mixed && <div className="text-[10px] text-neutral-600">never converted</div>}
            </div>
          ))}
        </div>
      )}

      {/* Lens switcher (§81) — same rows, different emphasis */}
      <div className="flex items-center gap-1 flex-wrap border-b border-white/[0.06]" role="tablist" aria-label="Profitability reports">
        {LENSES.map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={lens === key}
            onClick={() => setLens(key)}
            className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
              lens === key ? 'border-white text-white' : 'border-transparent text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading profitability">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 rounded-xl bg-white/[0.03] animate-pulse" />)}
        </div>
      ) : error ? (
        <div role="alert" className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-[13px] text-neutral-200">{error}</div>
      ) : !portfolio || rows.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-6 text-center">
          <TrendingUp className="w-6 h-6 mx-auto text-neutral-700" aria-hidden />
          <p className="mt-2 text-[13px] text-neutral-500">No projects match this view. Adjust the filters, or create a project to see its profitability.</p>
        </div>
      ) : lens === 'clients' ? (
        /* §81 — Client Profitability: the client rollup, a derivative of project profitability. */
        <div className="rounded-xl border border-white/[0.06] overflow-hidden overflow-x-auto">
          <table className="w-full text-[13px]" aria-label="Client profitability">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th scope="col" className="px-4 py-2.5 font-medium">Client</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Projects</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">Revenue</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">Delivery cost</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">Gross profit</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.byClient.map(c => (
                <tr key={c.clientId} className="border-b border-white/[0.04] last:border-0">
                  <td className="px-4 py-2.5 text-neutral-200">
                    <Link href={`/dashboard/agency/clients/${c.clientId}`} className="hover:text-white underline underline-offset-2">{c.clientName || 'Unknown client'}</Link>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-400 tabular-nums">{c.projectCount}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-neutral-200">{c.applicableRevenue ? money(c.applicableRevenue.amount, c.applicableRevenue.currency) : <span className="text-amber-400/80 text-[12px]">mixed</span>}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-neutral-200">{c.deliveryCost ? money(c.deliveryCost.amount, c.deliveryCost.currency) : <span className="text-amber-400/80 text-[12px]">mixed</span>}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-neutral-200">{c.grossProfit ? money(c.grossProfit.amount, c.grossProfit.currency) : <span className="text-amber-400/80 text-[12px]">mixed</span>}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-neutral-200">{pct(c.marginPercent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* The per-project lenses — same rows, different columns/order (§81). */
        <div className="rounded-xl border border-white/[0.06] overflow-hidden overflow-x-auto">
          <table className="w-full text-[13px]" aria-label={`Profitability report: ${LENSES.find(l => l.key === lens)?.label}`}>
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th scope="col" className="px-4 py-2.5 font-medium">Project</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Model</th>
                {lens !== 'burn' && lens !== 'unbilled' && <th scope="col" className="px-4 py-2.5 font-medium text-right">Revenue</th>}
                {lens === 'cost' && <th scope="col" className="px-4 py-2.5 font-medium text-right">Labor</th>}
                {lens === 'cost' && <th scope="col" className="px-4 py-2.5 font-medium text-right">Expenses</th>}
                {(lens === 'projects' || lens === 'cost') && <th scope="col" className="px-4 py-2.5 font-medium text-right">Delivery cost</th>}
                {(lens === 'projects' || lens === 'margin') && <th scope="col" className="px-4 py-2.5 font-medium text-right">Gross profit</th>}
                {(lens === 'projects' || lens === 'margin') && <th scope="col" className="px-4 py-2.5 font-medium text-right">Margin</th>}
                {lens === 'burn' && <th scope="col" className="px-4 py-2.5 font-medium text-right">Hours burn</th>}
                {lens === 'burn' && <th scope="col" className="px-4 py-2.5 font-medium text-right">Cost burn</th>}
                {lens === 'burn' && <th scope="col" className="px-4 py-2.5 font-medium text-right">Revenue burn</th>}
                {lens === 'unbilled' && <th scope="col" className="px-4 py-2.5 font-medium text-right">Unbilled</th>}
                {lens === 'unbilled' && <th scope="col" className="px-4 py-2.5 font-medium text-right">Billed</th>}
                {lens === 'unbilled' && <th scope="col" className="px-4 py-2.5 font-medium text-right">Collected</th>}
                {lens === 'projects' && <th scope="col" className="px-4 py-2.5 font-medium text-right">Health</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.projectId} className="border-b border-white/[0.04] last:border-0">
                  <td className="px-4 py-2.5">
                    <Link href={`/dashboard/agency/projects/${p.projectId}?tab=profitability`} className="text-neutral-100 underline underline-offset-2 hover:text-white">{p.projectName}</Link>
                    {p.marginAlert && (
                      <span className="ml-2 text-[10.5px] text-orange-300/90" title={p.marginAlert.reason}>margin {pct(p.marginAlert.currentMarginPercent)} vs {p.marginAlert.targetMarginPercent}% target</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-500">{REVENUE_MODEL_SHORT[p.revenueModel]}</td>
                  {lens !== 'burn' && lens !== 'unbilled' && <td className="px-4 py-2.5 text-right tabular-nums text-neutral-200">{money(p.applicableRevenue.amount, p.currency)}</td>}
                  {lens === 'cost' && <td className="px-4 py-2.5 text-right tabular-nums text-neutral-400">{money(p.laborCost.amount, p.currency)}</td>}
                  {lens === 'cost' && <td className="px-4 py-2.5 text-right tabular-nums text-neutral-400">{money(p.expenseCost.amount, p.currency)}</td>}
                  {(lens === 'projects' || lens === 'cost') && <td className="px-4 py-2.5 text-right tabular-nums text-neutral-200">{money(p.deliveryCost.amount, p.currency)}</td>}
                  {(lens === 'projects' || lens === 'margin') && (
                    <td className={`px-4 py-2.5 text-right tabular-nums ${p.grossProfit.amount < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{money(p.grossProfit.amount, p.currency)}</td>
                  )}
                  {(lens === 'projects' || lens === 'margin') && (
                    <td className="px-4 py-2.5 text-right tabular-nums text-neutral-200">
                      {pct(p.marginPercent)}
                      {lens === 'margin' && p.targetMargin !== null && <span className="text-neutral-600"> / {p.targetMargin}% target</span>}
                    </td>
                  )}
                  {lens === 'burn' && (
                    <td className="px-4 py-2.5 text-right tabular-nums text-neutral-200">
                      {burnPct(p.burn.hours)}
                      {p.hoursWarning && <span className={`ml-1.5 text-[10.5px] ${p.hoursWarning.level === 'OVER' ? 'text-red-300' : 'text-amber-300'}`}>{p.hoursWarning.level}</span>}
                    </td>
                  )}
                  {lens === 'burn' && <td className="px-4 py-2.5 text-right tabular-nums text-neutral-200">{burnPct(p.burn.cost)}</td>}
                  {lens === 'burn' && <td className="px-4 py-2.5 text-right tabular-nums text-neutral-400">{burnPct(p.burn.revenue)}</td>}
                  {lens === 'unbilled' && <td className="px-4 py-2.5 text-right tabular-nums text-neutral-200">{money(p.unbilledAmount.amount, p.currency)}</td>}
                  {lens === 'unbilled' && <td className="px-4 py-2.5 text-right tabular-nums text-neutral-400">{money(p.billedAmount.amount, p.currency)}</td>}
                  {lens === 'unbilled' && <td className="px-4 py-2.5 text-right tabular-nums text-neutral-400">{money(p.collectedAmount.amount, p.currency)}</td>}
                  {lens === 'projects' && (
                    <td className="px-4 py-2.5 text-right">
                      <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${HEALTH_STYLE[p.health]}`}>{p.health.replace('_', ' ')}</span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
