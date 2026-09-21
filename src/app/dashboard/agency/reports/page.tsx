"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FileBarChart, Download, Printer, ChevronLeft, ChevronRight, BarChart3 } from 'lucide-react';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';
import { tenantHasCapability } from '@/lib/agency/types/vertical';
import { formatMoney } from '@/lib/agency/types/money';
import { PROJECT_STATUSES } from '@/lib/agency/types/project';
import type { AgingBucket } from '@/lib/agency/types/dates';
import type {
  ReportPayload, PortfolioReportRow, PortfolioReportSummary,
  ProfitabilityReportRow, ProfitabilityReportSummary,
  TimeReportRow, TimeReportSummary, TimeReportBasis,
  UnbilledReportRow, UnbilledReportSummary,
  ReceivableReportRow, ReceivableReportSummary,
} from '@/lib/agency/reports/types';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';

/**
 * Reports (Module 16, §26–§41) — the reporting layer over the engines.
 *
 * ONE RULE everywhere on this page (§26/§41): it renders, never
 * recalculates. Every number comes from /api/agency/reports/:report —
 * the same server functions the CSV endpoint runs — so the visible
 * table, the CSV download and the printed PDF are three views of ONE
 * snapshot.
 *
 *   Portfolio (§29)      → projects × money, weighted margin
 *   Profitability (§31)  → the cost split: labor / expense / delivery
 *   Time (§32/§33)       → per-employee hours + utilization, explicit basis
 *   Unbilled (§34)       → approved billable work not yet invoiced
 *   Receivables (§35)    → the A/R position with aging
 *
 * §39 — pagination is server-side (limit/offset); the summary is always
 * over ALL filtered rows, so it never shifts with the page.
 * §127 — mixed currencies show "—" aggregates, never a converted total.
 */

type ReportTab = 'portfolio' | 'project-profitability' | 'time' | 'unbilled' | 'receivables';

/** Client-side mirror of the server's REPORT_ROUTE_RULES (export.ts is
 *  server-only — it imports the report functions — so the page keeps its
 *  own copy of WHICH filters each report takes; the server re-validates
 *  everything fail-closed either way). */
interface UiRules {
  endpoint: string;
  supports: ReadonlySet<'from' | 'to' | 'clientId' | 'projectId' | 'userId' | 'currency' | 'status'>;
  statuses?: readonly string[];
  supportsBasis?: boolean;
  supportsAgingBucket?: boolean;
  /** What the from/to window selects — shown as a hint (§80 semantics). */
  windowHint?: string;
  /** §38 — every report carries its own title + description. */
  title: string;
  description: string;
}

const UI_RULES: Record<ReportTab, UiRules> = {
  portfolio: {
    endpoint: '/api/agency/reports/portfolio',
    supports: new Set(['from', 'to', 'clientId', 'projectId', 'currency', 'status']),
    statuses: PROJECT_STATUSES,
    windowHint: 'the date window selects PROJECTS by start date (§80) — it never re-slices the money inside them',
    title: 'Portfolio',
    description: 'Every project\'s money position — contract, revenue, billed, collected, cost, profit — with the weighted portfolio margin (Σprofit ÷ Σrevenue).',
  },
  'project-profitability': {
    endpoint: '/api/agency/reports/project-profitability',
    supports: new Set(['from', 'to', 'clientId', 'projectId', 'currency', 'status']),
    statuses: PROJECT_STATUSES,
    windowHint: 'the date window selects PROJECTS by start date (§80)',
    title: 'Project profitability',
    description: 'The cost split per project — labor, expenses and delivery cost against revenue — straight from the Module 13 engine.',
  },
  time: {
    endpoint: '/api/agency/reports/time',
    supports: new Set(['from', 'to', 'clientId', 'projectId', 'userId']),
    supportsBasis: true,
    windowHint: 'the date window selects TIME ENTRIES by entry date',
    title: 'Time',
    description: 'Per-employee billable and non-billable hours with utilization. Financial basis counts approved time only; operational counts everything recorded.',
  },
  unbilled: {
    endpoint: '/api/agency/reports/unbilled',
    supports: new Set(['clientId', 'projectId', 'userId', 'currency']),
    title: 'Unbilled work',
    description: 'Approved billable time and expenses that exist operationally but have not yet become an invoice — the revenue-leakage position right now.',
  },
  receivables: {
    endpoint: '/api/agency/reports/receivables',
    supports: new Set(['from', 'to', 'clientId', 'projectId', 'currency', 'status']),
    statuses: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'],
    supportsAgingBucket: true,
    windowHint: 'the date window selects invoices by DUE DATE',
    title: 'Receivables',
    description: 'Who owes us money, how much, and for how long — open invoices with engine-derived aging, most overdue first.',
  },
};

const TABS: ReadonlyArray<[ReportTab, string]> = [
  ['portfolio', 'Portfolio'],
  ['project-profitability', 'Project profitability'],
  ['time', 'Time'],
  ['unbilled', 'Unbilled work'],
  ['receivables', 'Receivables'],
];

const AGING_BUCKETS: readonly AgingBucket[] = ['CURRENT', '1-30', '31-60', '61-90', '90+'];
const BUCKET_LABEL: Record<AgingBucket, string> = {
  CURRENT: 'Current', '1-30': '1–30 days', '31-60': '31–60 days', '61-90': '61–90 days', '90+': '90+ days',
};

const PAGE_SIZES = [25, 50, 100] as const;

interface ClientOption { id: string; name: string }

function formatDate(d: string): string {
  try {
    return new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return d;
  }
}

export default function AgencyReportsPage() {
  const { tenant, loading: sessionLoading } = useDashboardContext();
  const allowed = tenantHasCapability(tenant, 'AGENCY_DASHBOARD');

  const [tab, setTab] = useState<ReportTab>('portfolio');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  // §28 filters — only the ones the current report takes are ever set.
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [userId, setUserId] = useState('');
  const [currency, setCurrency] = useState('');
  const [status, setStatus] = useState('');
  // §33 — the time basis is explicit, default FINANCIAL (approved only).
  const [basis, setBasis] = useState<TimeReportBasis>('FINANCIAL');
  const [agingBucket, setAgingBucket] = useState('');

  // §39 — server-side pagination.
  const [limit, setLimit] = useState<number>(50);
  const [offset, setOffset] = useState(0);

  // The payload is a union of the five report shapes (one endpoint at a
  // time); rows are re-typed at render via the per-tab components below.
  const [payload, setPayload] = useState<ReportPayload<PortfolioReportRow | ProfitabilityReportRow | TimeReportRow | UnbilledReportRow | ReceivableReportRow, Record<string, unknown>> | null>(null);
  const [payloadBasis, setPayloadBasis] = useState<TimeReportBasis | null>(null);

  // Filter dropdown sources. Clients come from the clients API; project,
  // user and currency options ACCUMULATE from report rows across loads (a
  // filtered response narrows its own rows, so the option list must never
  // shrink with the data — same discipline as the receivables page).
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [projectOptions, setProjectOptions] = useState<ClientOption[]>([]);
  const [userOptions, setUserOptions] = useState<ClientOption[]>([]);
  const [currencyOptions, setCurrencyOptions] = useState<string[]>([]);

  const rules = UI_RULES[tab];
  const supports = (f: Parameters<typeof rules.supports.has>[0]) => rules.supports.has(f);

  useEffect(() => {
    if (!allowed) return;
    fetch('/api/agency/clients')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => setClients((body.clients || []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))))
      .catch(() => setClients([]));
  }, [allowed]);

  /** The exact query params the current view implies — used BOTH for the
   *  JSON fetch and the CSV link, so the download can never differ from
   *  the table (§41). Pagination is excluded: CSV is the full set. */
  const buildParams = useCallback((withPagination: boolean): URLSearchParams => {
    const p = new URLSearchParams();
    if (supports('from') && from) p.set('from', from);
    if (supports('to') && to) p.set('to', to);
    if (supports('clientId') && clientId) p.set('clientId', clientId);
    if (supports('projectId') && projectId) p.set('projectId', projectId);
    if (supports('userId') && userId) p.set('userId', userId);
    if (supports('currency') && currency) p.set('currency', currency);
    if (supports('status') && status) p.set('status', status);
    if (rules.supportsBasis) p.set('basis', basis);
    if (rules.supportsAgingBucket && agingBucket) p.set('agingBucket', agingBucket);
    if (withPagination) {
      p.set('limit', String(limit));
      p.set('offset', String(offset));
    }
    return p;
  }, [rules, supports, from, to, clientId, projectId, userId, currency, status, basis, agingBucket, limit, offset]);

  const load = useCallback(() => {
    if (sessionLoading || !allowed) return;
    setLoading(true);
    setForbidden(false);
    fetch(`${rules.endpoint}?${buildParams(true).toString()}`)
      .then(async res => {
        if (res.status === 403) {
          setForbidden(true);
          throw new Error('forbidden');
        }
        return res.ok ? res.json() : Promise.reject(new Error('failed'));
      })
      .then(body => {
        const report = body.report;
        setPayload(report);
        setPayloadBasis(rules.supportsBasis ? (report.basis ?? null) : null);
        setError(null);
        // Options grow monotonically from whatever rows this response
        // carried — never re-derived, never shrunk by a filter.
        setProjectOptions(prev => {
          const byId = new Map(prev.map(o => [o.id, o]));
          for (const r of report.rows as Array<{ projectId?: string | null; projectName?: string | null; employeeId?: string | null; userName?: string | null; currency?: string }>) {
            if (r.projectId) byId.set(r.projectId, { id: r.projectId, name: r.projectName || 'Project' });
          }
          const next = [...byId.values()];
          return next.length === prev.length ? prev : next;
        });
        setUserOptions(prev => {
          const byId = new Map(prev.map(o => [o.id, o]));
          for (const r of report.rows as Array<{ userId?: string; employeeId?: string | null; userName?: string | null }>) {
            const id = r.userId ?? r.employeeId ?? null;
            if (id) byId.set(id, { id, name: r.userName || 'Team Member' });
          }
          const next = [...byId.values()];
          return next.length === prev.length ? prev : next;
        });
        setCurrencyOptions(prev => {
          const seen = new Set(prev);
          for (const r of report.rows as Array<{ currency?: string }>) {
            if (r.currency) seen.add(r.currency);
          }
          return seen.size === prev.length ? prev : [...seen].sort();
        });
      })
      .catch(err => {
        if ((err as Error).message !== 'forbidden') {
          setError('We couldn\'t load this report. Try again.');
        }
      })
      .finally(() => setLoading(false));
  }, [sessionLoading, allowed, rules, buildParams]);

  useEffect(() => {
    if (!sessionLoading && allowed) load();
  }, [load, sessionLoading, allowed]);

  /** Switching tabs resets filters + pagination — every report has a
   *  different filter contract, so stale filters must never leak across. */
  const switchTab = (next: ReportTab) => {
    if (next === tab) return;
    setTab(next);
    setFrom(''); setTo(''); setClientId(''); setProjectId(''); setUserId('');
    setCurrency(''); setStatus(''); setAgingBucket('');
    setBasis('FINANCIAL');
    setOffset(0);
  };

  const hasFilters = !!(from || to || clientId || projectId || userId || currency || status || agingBucket);
  const clearFilters = () => {
    setFrom(''); setTo(''); setClientId(''); setProjectId(''); setUserId('');
    setCurrency(''); setStatus(''); setAgingBucket('');
    setOffset(0);
  };

  const csvHref = `/api/agency/reports/${tab}/export.csv?${buildParams(false).toString()}`;

  // §41 — the CSV is generated from the SAME filters; the PDF is the print
  // of THIS page (window.print), so all three views share one snapshot.
  const handlePrintPDF = () => window.print();

  if (!sessionLoading && !allowed) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <FileBarChart className="w-8 h-8 mx-auto text-neutral-700" aria-hidden />
        <h1 className="mt-4 text-[16px] font-semibold text-white">Agency workspace required</h1>
        <p className="mt-2 text-[13px] text-neutral-500">Reports are an Agency workspace feature.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-[13px] text-neutral-300 underline underline-offset-4">Go to the standard dashboard</Link>
      </div>
    );
  }

  const tabCls = (v: ReportTab) => `px-2.5 py-1 rounded text-[11.5px] font-medium transition-colors ${tab === v ? 'bg-white/[0.08] text-white' : 'text-neutral-500 hover:text-neutral-300'}`;
  const selectCls = 'px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[12.5px] text-neutral-200 focus:outline-none focus:border-white/20';

  const rows = payload?.rows ?? [];
  const summary = payload?.summary as Record<string, unknown> | undefined;
  const total = payload?.pagination.total ?? 0;

  // Summary money: null means mixed currencies (§127) — show "—".
  const sumMoney = (v: unknown) => (v === null || v === undefined ? '—' : String(v));
  const summaryMoney = (key: string, cur: string | null) => {
    const v = summary?.[key];
    return typeof v === 'number' ? formatMoney({ amount: v, currency: cur ?? 'INR' }) : '—';
  };
  const summaryPct = (key: string) => {
    const v = summary?.[key];
    return typeof v === 'number' ? `${v.toFixed(1)}%` : '—';
  };
  const summaryCount = (key: string) => String(summary?.[key] ?? 0);
  const mixedCurrencies = summary?.mixedCurrencies === true;
  const summaryCurrency = typeof summary?.currency === 'string' ? summary.currency as string : null;

  const cards: ReadonlyArray<{ label: string; value: string; tone?: string; note?: string }> = (() => {
    if (!summary) return [];
    switch (tab) {
      case 'portfolio':
        return [
          { label: 'Projects', value: summaryCount('projectCount') },
          { label: 'Contract value', value: summaryMoney('contractValue', summaryCurrency) },
          { label: 'Revenue', value: summaryMoney('applicableRevenue', summaryCurrency) },
          { label: 'Delivery cost', value: summaryMoney('deliveryCost', summaryCurrency) },
          { label: 'Gross profit', value: summaryMoney('profit', summaryCurrency) },
          { label: 'Weighted margin', value: summaryPct('weightedMarginPercent'), note: 'Σprofit ÷ Σrevenue (§29)' },
        ];
      case 'project-profitability':
        return [
          { label: 'Projects', value: summaryCount('projectCount') },
          { label: 'Revenue', value: summaryMoney('applicableRevenue', summaryCurrency) },
          { label: 'Labor cost', value: summaryMoney('laborCost', summaryCurrency) },
          { label: 'Expense cost', value: summaryMoney('expenseCost', summaryCurrency) },
          { label: 'Delivery cost', value: summaryMoney('deliveryCost', summaryCurrency) },
          { label: 'Gross profit', value: summaryMoney('profit', summaryCurrency) },
          { label: 'Weighted margin', value: summaryPct('weightedMarginPercent') },
        ];
      case 'time':
        return [
          { label: 'Employees', value: summaryCount('employeeCount') },
          { label: 'Billable hours', value: sumMoney(summary.billableHours) },
          { label: 'Total hours', value: sumMoney(summary.totalHours) },
          { label: 'Utilization', value: summaryPct('utilizationPercent') },
        ];
      case 'unbilled':
        return [
          { label: 'Rows', value: summaryCount('rowCount') },
          { label: 'Unbilled time', value: summaryMoney('totalUnbilledTime', summaryCurrency) },
          { label: 'Unbilled expenses', value: summaryMoney('totalUnbilledExpense', summaryCurrency) },
          { label: 'Total unbilled', value: summaryMoney('totalUnbilled', summaryCurrency) },
        ];
      case 'receivables':
        return [
          { label: 'Open invoices', value: summaryCount('openInvoiceCount') },
          { label: 'Outstanding', value: summaryMoney('outstanding', summaryCurrency) },
          { label: 'Due soon', value: summaryMoney('dueSoon', summaryCurrency) },
          { label: 'Overdue', value: summaryMoney('overdueAmount', summaryCurrency), note: Number(summary.overdueCount) > 0 ? `${summary.overdueCount} invoice(s)` : undefined },
        ];
    }
  })();

  const money = (v: number | null, cur: string) => formatMoney({ amount: v ?? 0, currency: cur });
  const pct = (v: number | null) => (v === null ? 'N/A' : `${v.toFixed(1)}%`);

  const fromLabel = tab === 'receivables' ? 'Due from' : tab === 'time' ? 'Entries from' : 'Projects from';

  return (
    <div className="p-4 sm:p-6 space-y-4 w-full overflow-hidden">
      {/* Print formatting — same pattern as the personal reports page. */}
      <style jsx global>{`
        @media print {
          aside, nav, header, button, select, input, .no-print {
            display: none !important;
          }
          body, main {
            background: #ffffff !important;
            color: #000000 !important;
          }
          .print-card {
            border: 1px solid #e5e5e5 !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
          .text-white, .text-neutral-400, .text-neutral-500, .text-neutral-300, .text-neutral-200 {
            color: #000000 !important;
          }
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div>
          <h1 className="text-[16px] font-semibold text-white tracking-tight">Reports</h1>
          <p className="text-[12.5px] text-neutral-500">
            Every report reconciles with its source engine — the table, the CSV and the printed PDF are one snapshot (§41).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrintPDF}
            className="h-9 px-3 border border-white/[0.1] text-white rounded-md text-[13px] font-medium hover:bg-white/[0.05] flex items-center gap-2 transition-colors"
          >
            <Printer className="w-4 h-4 shrink-0" aria-hidden /> Print PDF
          </button>
          <a
            href={csvHref}
            className="h-9 px-3 bg-white text-black rounded-md text-[13px] font-semibold hover:bg-neutral-200 flex items-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4 shrink-0" aria-hidden /> Export CSV
          </a>
        </div>
      </div>

      {/* §38 — the five report tabs. */}
      <div className="flex flex-wrap gap-1 no-print" role="group" aria-label="Reports">
        {TABS.map(([v, label]) => (
          <button key={v} onClick={() => switchTab(v)} className={tabCls(v)}>{label}</button>
        ))}
      </div>

      {/* §38 — every report carries its own title + description. */}
      <div>
        <h2 className="text-[14px] font-semibold text-white tracking-tight">{rules.title}</h2>
        <p className="mt-0.5 text-[12px] text-neutral-500">{rules.description}</p>
      </div>

      {/* §28 — the filters this report takes (and only those). */}
      <div className="flex flex-wrap items-center gap-2 no-print">
        {supports('clientId') && (
          <Select className={selectCls} wrapperClassName="w-full sm:w-40 shrink-0" value={clientId} onChange={e => { setClientId(e.target.value); setOffset(0); }} aria-label="Filter by client">
            <option value="">All clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}
        {supports('projectId') && (
          <Select className={selectCls} wrapperClassName="w-full sm:w-40 shrink-0" value={projectId} onChange={e => { setProjectId(e.target.value); setOffset(0); }} aria-label="Filter by project">
            <option value="">All projects</option>
            {projectOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        )}
        {supports('userId') && (
          <Select className={selectCls} wrapperClassName="w-full sm:w-40 shrink-0" value={userId} onChange={e => { setUserId(e.target.value); setOffset(0); }} aria-label="Filter by employee">
            <option value="">All employees</option>
            {userOptions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        )}
        {supports('status') && (
          <Select className={selectCls} wrapperClassName="w-full sm:w-36 shrink-0" value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }} aria-label="Filter by status">
            <option value="">Any status</option>
            {(rules.statuses ?? []).map(s => <option key={s} value={s}>{s.replaceAll('_', ' ').toLowerCase()}</option>)}
          </Select>
        )}
        {rules.supportsAgingBucket && (
          <Select className={selectCls} wrapperClassName="w-full sm:w-36 shrink-0" value={agingBucket} onChange={e => { setAgingBucket(e.target.value); setOffset(0); }} aria-label="Filter by aging bucket">
            <option value="">Any aging</option>
            {AGING_BUCKETS.map(b => <option key={b} value={b}>{BUCKET_LABEL[b]}</option>)}
          </Select>
        )}
        {supports('currency') && (
          <Select className={selectCls} wrapperClassName="w-full sm:w-32 shrink-0" value={currency} onChange={e => { setCurrency(e.target.value); setOffset(0); }} aria-label="Filter by currency">
            <option value="">Any currency</option>
            {currencyOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        )}
        {supports('from') && (
          <div className="flex items-center gap-1.5 text-[11.5px] text-neutral-500">
            <span>{fromLabel}</span>
            <DatePicker wrapperClassName="w-36" value={from} onChange={e => { setFrom(e.target.value); setOffset(0); }} aria-label="Window start" />
            <span>to</span>
            <DatePicker wrapperClassName="w-36" value={to} min={from} onChange={e => { setTo(e.target.value); setOffset(0); }} aria-label="Window end" />
          </div>
        )}
        {rules.supportsBasis && (
          <div className="flex p-0.5 bg-white/[0.02] border border-white/[0.05] rounded-md" role="group" aria-label="Time basis (§33)">
            {(['FINANCIAL', 'OPERATIONAL'] as const).map(b => (
              <button
                key={b}
                onClick={() => { setBasis(b); setOffset(0); }}
                className={`px-2.5 py-1 rounded text-[11.5px] font-medium transition-colors ${basis === b ? 'bg-white/[0.08] text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
                aria-pressed={basis === b}
                title={b === 'FINANCIAL' ? 'APPROVED entries only — the financial truth' : 'All recorded time, drafts included (§33)'}
              >
                {b === 'FINANCIAL' ? 'Financial' : 'Operational'}
              </button>
            ))}
          </div>
        )}
        {hasFilters && (
          <button onClick={clearFilters} className="text-[12px] text-neutral-400 underline underline-offset-4 hover:text-neutral-200">
            Clear filters
          </button>
        )}
      </div>
      {rules.windowHint && (
        <p className="-mt-2 text-[11px] text-neutral-600 no-print">{rules.windowHint}.</p>
      )}

      {loading && (
        <div className="space-y-2" aria-busy="true" aria-label="Loading report">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 rounded-xl bg-white/[0.03] animate-pulse" />)}
        </div>
      )}

      {forbidden && !loading && (
        <div role="alert" className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <p className="text-[13px] text-neutral-200">
            This report needs the agency profitability permission (§114 — cost and margin are salary economics).
          </p>
        </div>
      )}

      {error && !loading && !forbidden && (
        <div role="alert" className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <p className="text-[13px] text-neutral-200">{error}</p>
          <button onClick={load} className="mt-2 text-[12.5px] text-neutral-400 underline underline-offset-4">Retry</button>
        </div>
      )}

      {!loading && !error && !forbidden && payload && (
        <>
          {/* Summary — computed server-side over ALL filtered rows (§39),
              never the page. §127 — "—" on mixed currencies, never converted. */}
          {cards.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 print-card">
              {cards.map(({ label, value, tone, note }) => (
                <div key={label} className="rounded-xl border border-white/[0.06] bg-[#050505] p-3 print-card">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">{label}</div>
                  <div className={`mt-1 text-[14px] font-semibold tabular-nums tracking-tight ${tone ?? 'text-neutral-200'}`}>{value}</div>
                  {note && <div className="mt-0.5 text-[10.5px] text-neutral-500">{note}</div>}
                </div>
              ))}
            </div>
          )}
          {mixedCurrencies && (
            <div className="text-[11px] text-neutral-500 no-print">
              Rows span multiple currencies — summary money is withheld (§127); each row keeps its own currency.
            </div>
          )}

          {/* The table — a straight render of the payload rows. */}
          <div className="rounded-xl border border-white/[0.06] overflow-x-auto print-card">
            {rows.length === 0 ? (
              <div className="p-8 text-center">
                <BarChart3 className="w-8 h-8 mx-auto text-neutral-700 no-print" aria-hidden />
                <h2 className="mt-3 text-[14px] font-semibold text-white">Nothing in this view</h2>
                <p className="mt-1.5 text-[12.5px] text-neutral-500 max-w-sm mx-auto">
                  {hasFilters ? 'No rows match these filters.' : 'There is no data for this report yet.'}
                </p>
              </div>
            ) : (
              <table className="w-full text-[13px]" aria-label={`${tab} report`}>
                {tab === 'portfolio' && (
                  <>
                    <thead>
                      <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                        <th scope="col" className="px-4 py-3 font-medium">Project</th>
                        <th scope="col" className="px-4 py-3 font-medium">Client</th>
                        <th scope="col" className="px-4 py-3 font-medium">Status</th>
                        <th scope="col" className="px-4 py-3 font-medium text-right">Contract</th>
                        <th scope="col" className="px-4 py-3 font-medium text-right">Revenue</th>
                        <th scope="col" className="px-4 py-3 font-medium text-right">Billed</th>
                        <th scope="col" className="px-4 py-3 font-medium text-right">Collected</th>
                        <th scope="col" className="px-4 py-3 font-medium text-right">Delivery cost</th>
                        <th scope="col" className="px-4 py-3 font-medium text-right">Profit</th>
                        <th scope="col" className="px-4 py-3 font-medium text-right">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(rows as PortfolioReportRow[]).map(r => (
                        <tr key={r.projectId} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3 text-white">{r.projectName}</td>
                          <td className="px-4 py-3 text-neutral-400">{r.clientName ?? '—'}</td>
                          <td className="px-4 py-3 text-neutral-500">{r.status}</td>
                          <td className="px-4 py-3 text-right text-neutral-400 tabular-nums whitespace-nowrap">{r.contractValue === null ? '—' : money(r.contractValue, r.currency)}</td>
                          <td className="px-4 py-3 text-right text-neutral-300 tabular-nums whitespace-nowrap">{money(r.applicableRevenue, r.currency)}</td>
                          <td className="px-4 py-3 text-right text-neutral-400 tabular-nums whitespace-nowrap">{money(r.billedAmount, r.currency)}</td>
                          <td className="px-4 py-3 text-right text-neutral-400 tabular-nums whitespace-nowrap">{money(r.collectedAmount, r.currency)}</td>
                          <td className="px-4 py-3 text-right text-neutral-400 tabular-nums whitespace-nowrap">{money(r.deliveryCost, r.currency)}</td>
                          <td className={`px-4 py-3 text-right tabular-nums whitespace-nowrap font-medium ${r.profit < 0 ? 'text-red-300' : 'text-white'}`}>{money(r.profit, r.currency)}</td>
                          <td className="px-4 py-3 text-right text-neutral-300 tabular-nums whitespace-nowrap">{pct(r.marginPercent)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}
                {tab === 'project-profitability' && (
                  <>
                    <thead>
                      <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                        <th scope="col" className="px-4 py-3 font-medium">Project</th>
                        <th scope="col" className="px-4 py-3 font-medium">Client</th>
                        <th scope="col" className="px-4 py-3 font-medium text-right">Contract</th>
                        <th scope="col" className="px-4 py-3 font-medium text-right">Revenue</th>
                        <th scope="col" className="px-4 py-3 font-medium text-right">Labor</th>
                        <th scope="col" className="px-4 py-3 font-medium text-right">Expenses</th>
                        <th scope="col" className="px-4 py-3 font-medium text-right">Delivery cost</th>
                        <th scope="col" className="px-4 py-3 font-medium text-right">Profit</th>
                        <th scope="col" className="px-4 py-3 font-medium text-right">Margin</th>
                        <th scope="col" className="px-4 py-3 font-medium text-right">Planned h</th>
                        <th scope="col" className="px-4 py-3 font-medium text-right">Actual h</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(rows as ProfitabilityReportRow[]).map(r => (
                        <tr key={r.projectId} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3 text-white">{r.projectName}</td>
                          <td className="px-4 py-3 text-neutral-400">{r.clientName ?? '—'}</td>
                          <td className="px-4 py-3 text-right text-neutral-400 tabular-nums whitespace-nowrap">{r.contractValue === null ? '—' : money(r.contractValue, r.currency)}</td>
                          <td className="px-4 py-3 text-right text-neutral-300 tabular-nums whitespace-nowrap">{money(r.applicableRevenue, r.currency)}</td>
                          <td className="px-4 py-3 text-right text-neutral-400 tabular-nums whitespace-nowrap">{money(r.laborCost, r.currency)}</td>
                          <td className="px-4 py-3 text-right text-neutral-400 tabular-nums whitespace-nowrap">{money(r.expenseCost, r.currency)}</td>
                          <td className="px-4 py-3 text-right text-neutral-400 tabular-nums whitespace-nowrap">{money(r.deliveryCost, r.currency)}</td>
                          <td className={`px-4 py-3 text-right tabular-nums whitespace-nowrap font-medium ${r.profit < 0 ? 'text-red-300' : 'text-white'}`}>{money(r.profit, r.currency)}</td>
                          <td className="px-4 py-3 text-right text-neutral-300 tabular-nums whitespace-nowrap">{pct(r.marginPercent)}</td>
                          <td className="px-4 py-3 text-right text-neutral-500 tabular-nums whitespace-nowrap">{r.plannedHours === null ? '—' : String(r.plannedHours)}</td>
                          <td className="px-4 py-3 text-right text-neutral-400 tabular-nums whitespace-nowrap">{String(r.actualHours)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}
                {tab === 'time' && (
                  <>
                    <thead>
                      <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                        <th scope="col" className="px-4 py-3 font-medium">Employee</th>
                        <th scope="col" className="px-4 py-3 font-medium text-right">Billable h</th>
                        <th scope="col" className="px-4 py-3 font-medium text-right">Non-billable h</th>
                        <th scope="col" className="px-4 py-3 font-medium text-right">Total h</th>
                        <th scope="col" className="px-4 py-3 font-medium text-right">Utilization</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(rows as TimeReportRow[]).map(r => (
                        <tr key={r.userId} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3 text-white">{r.userName || 'Team Member'}</td>
                          <td className="px-4 py-3 text-right text-neutral-300 tabular-nums">{String(r.billableHours)}</td>
                          <td className="px-4 py-3 text-right text-neutral-400 tabular-nums">{String(r.nonBillableHours)}</td>
                          <td className="px-4 py-3 text-right text-neutral-400 tabular-nums">{String(r.totalHours)}</td>
                          <td className="px-4 py-3 text-right text-white tabular-nums font-medium">{r.utilizationPercent.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}
                {tab === 'unbilled' && (
                  <>
                    <thead>
                      <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                        <th scope="col" className="px-4 py-3 font-medium">Employee</th>
                        <th scope="col" className="px-4 py-3 font-medium">Project</th>
                        <th scope="col" className="px-4 py-3 font-medium">Client</th>
                        <th scope="col" className="px-4 py-3 font-medium text-right">Hours</th>
                        <th scope="col" className="px-4 py-3 font-medium text-right">Time amount</th>
                        <th scope="col" className="px-4 py-3 font-medium text-right">Expense amount</th>
                        <th scope="col" className="px-4 py-3 font-medium text-right">Total unbilled</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(rows as UnbilledReportRow[]).map((r, i) => (
                        <tr key={`${r.employeeId ?? 'project'}-${r.projectId}-${i}`} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3 text-white">
                            {r.employeeId === null ? <span className="text-neutral-500">(project)</span> : (r.employeeName || 'Team Member')}
                          </td>
                          <td className="px-4 py-3 text-neutral-300">{r.projectName || 'Project'}</td>
                          <td className="px-4 py-3 text-neutral-400">{r.clientName ?? '—'}</td>
                          <td className="px-4 py-3 text-right text-neutral-400 tabular-nums">{r.hours > 0 ? String(r.hours) : '—'}</td>
                          <td className="px-4 py-3 text-right text-neutral-400 tabular-nums whitespace-nowrap">{r.timeAmount > 0 ? money(r.timeAmount, r.currency) : '—'}</td>
                          <td className="px-4 py-3 text-right text-neutral-400 tabular-nums whitespace-nowrap">{r.expenseAmount > 0 ? money(r.expenseAmount, r.currency) : '—'}</td>
                          <td className="px-4 py-3 text-right text-white tabular-nums whitespace-nowrap font-medium">{money(r.totalUnbilled, r.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}
                {tab === 'receivables' && (
                  <>
                    <thead>
                      <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                        <th scope="col" className="px-4 py-3 font-medium">Client</th>
                        <th scope="col" className="px-4 py-3 font-medium">Invoice</th>
                        <th scope="col" className="px-4 py-3 font-medium">Project</th>
                        <th scope="col" className="px-4 py-3 font-medium text-right">Total</th>
                        <th scope="col" className="px-4 py-3 font-medium text-right">Paid</th>
                        <th scope="col" className="px-4 py-3 font-medium text-right">Outstanding</th>
                        <th scope="col" className="px-4 py-3 font-medium">Due date</th>
                        <th scope="col" className="px-4 py-3 font-medium text-right">Age</th>
                        <th scope="col" className="px-4 py-3 font-medium">Aging</th>
                        <th scope="col" className="px-4 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(rows as ReceivableReportRow[]).map(r => (
                        <tr key={r.invoiceId} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3 text-white">{r.clientName || 'Client'}</td>
                          <td className="px-4 py-3 text-neutral-300">{r.invoiceNumber || 'Invoice'}</td>
                          <td className="px-4 py-3 text-neutral-400">{r.projectId ? (r.projectName || 'Project') : '—'}</td>
                          <td className="px-4 py-3 text-right text-neutral-400 tabular-nums whitespace-nowrap">{money(r.total, r.currency)}</td>
                          <td className="px-4 py-3 text-right text-neutral-400 tabular-nums whitespace-nowrap">{money(r.paid, r.currency)}</td>
                          <td className="px-4 py-3 text-right text-white tabular-nums whitespace-nowrap font-medium">{money(r.outstanding, r.currency)}</td>
                          <td className="px-4 py-3 text-neutral-400 whitespace-nowrap">{formatDate(r.dueDate)}</td>
                          <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                            {r.ageDays > 0 ? <span className="text-red-300">{r.ageDays}d</span> : <span className="text-neutral-600">—</span>}
                          </td>
                          <td className="px-4 py-3 text-neutral-500 whitespace-nowrap">{BUCKET_LABEL[r.agingBucket]}</td>
                          <td className="px-4 py-3 text-neutral-300 whitespace-nowrap">
                            {r.displayStatus === 'PARTIALLY_PAID' ? 'Partially paid' : r.displayStatus.charAt(0) + r.displayStatus.slice(1).toLowerCase()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}
              </table>
            )}
          </div>

          {/* §39 — server-side pagination over the full filtered set. */}
          <div className="flex flex-wrap items-center justify-between gap-2 no-print">
            <div className="text-[12px] text-neutral-500">
              {total === 0
                ? 'No rows'
                : `Showing ${offset + 1}–${offset + rows.length} of ${total}${payloadBasis ? ` · ${payloadBasis === 'FINANCIAL' ? 'financial basis (approved only)' : 'operational basis (all recorded time)'}` : ''}`}
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[11.5px] text-neutral-500">
                Rows
                <Select
                  className={selectCls}
                  value={limit}
                  onChange={e => { setLimit(Number(e.target.value)); setOffset(0); }}
                  aria-label="Rows per page"
                >
                  {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
              </label>
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="p-1.5 rounded-lg border border-white/[0.08] text-neutral-300 disabled:opacity-30 hover:bg-white/[0.04] transition-colors"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden />
              </button>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={offset + rows.length >= total}
                className="p-1.5 rounded-lg border border-white/[0.08] text-neutral-300 disabled:opacity-30 hover:bg-white/[0.04] transition-colors"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" aria-hidden />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
