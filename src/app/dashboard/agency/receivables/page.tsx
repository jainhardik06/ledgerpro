"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Wallet, AlertTriangle, ArrowRight } from 'lucide-react';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';
import { tenantHasCapability } from '@/lib/agency/types/vertical';
import type {
  ReceivableInvoiceRow, ClientReceivablesRow, ProjectReceivablesRow, AgingBuckets,
} from '@/lib/agency/types/receivables';
import type { AgingBucket, CollectionRisk } from '@/lib/agency/types/dates';
import { formatMoney } from '@/lib/agency/types/money';
import type { Payment } from '@/lib/agency/types/payment';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';

/**
 * Receivables (Module 14 §85–§106) — the A/R operating view: who owes us
 * money, how much, and for how long.
 *
 * §70-style one-engine rule: every number on this page arrives from
 * /api/agency/receivables (the same query the dashboard and reports read) —
 * the page only renders, it never recalculates aging, sums or risk.
 *
 *   Summary (§87) → Outstanding / Due Soon / Overdue (+ count)
 *   Ladder (§88)  → CURRENT / 1-30 / 31-60 / 61-90 / 90+
 *   List (§96)    → rows sorted most-overdue-first (§97) with §101 badges
 *   Reports (§104)→ by client (§94), by project (§95), collections history
 *
 * §127 — a mixed-currency position shows null aggregates ("Mixed"), never a
 * converted or zeroed total; per-row money keeps its own currency.
 */

type Tab = 'invoices' | 'clients' | 'projects' | 'collections';

const BUCKETS: readonly AgingBucket[] = ['CURRENT', '1-30', '31-60', '61-90', '90+'];
const BUCKET_LABEL: Record<AgingBucket, string> = {
  CURRENT: 'Current', '1-30': '1–30 days', '31-60': '31–60 days', '61-90': '61–90 days', '90+': '90+ days',
};

/** §101 — deterministic collection-risk badges (no predictive scoring). */
const RISK_STYLE: Record<CollectionRisk, string> = {
  OVERDUE: 'text-amber-300 bg-amber-400/10',
  OVERDUE_10_PLUS: 'text-orange-300 bg-orange-400/10',
  OVERDUE_30_PLUS: 'text-red-300 bg-red-400/10',
  OVERDUE_60_PLUS: 'text-red-300 bg-red-500/20',
  OVERDUE_90_PLUS: 'text-red-200 bg-red-600/30',
};
const RISK_LABEL: Record<CollectionRisk, string> = {
  OVERDUE: 'Overdue', OVERDUE_10_PLUS: '10+ days', OVERDUE_30_PLUS: '30+ days',
  OVERDUE_60_PLUS: '60+ days', OVERDUE_90_PLUS: '90+ days',
};

const STATUS_STYLE: Record<string, string> = {
  SENT: 'text-sky-300 bg-sky-400/10',
  PARTIALLY_PAID: 'text-amber-300 bg-amber-400/10',
  OVERDUE: 'text-red-300 bg-red-400/10',
};

interface ReceivablesPayload {
  asOf: string;
  dueSoonDays: number;
  outstanding: number | null;
  dueSoon: number | null;
  overdueAmount: number | null;
  overdueCount: number;
  openInvoiceCount: number;
  currency: string | null;
  mixedCurrencies: boolean;
  byAgingBucket: AgingBuckets;
  byClient: Array<ClientReceivablesRow & { clientName: string | null }>;
  byProject: Array<ProjectReceivablesRow & { projectName: string | null }>;
  invoices: Array<ReceivableInvoiceRow & { clientName: string | null; projectName: string | null }>;
}

function formatDate(d: string): string {
  try {
    return new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return d;
  }
}

export default function ReceivablesPage() {
  const { tenant, loading: sessionLoading } = useDashboardContext();
  const allowed = tenantHasCapability(tenant, 'AGENCY_DASHBOARD');

  const [data, setData] = useState<ReceivablesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('invoices');

  // §96 filters — every change re-queries the ONE engine.
  const [clientFilter, setClientFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [bucketFilter, setBucketFilter] = useState('');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');
  // §90 — the configurable due-soon window (default 7; the API bounds 1..90).
  const [dueSoonDays, setDueSoonDays] = useState(7);
  // Currency options accumulate across loads (a filtered response narrows its
  // own rows, so the option list must never shrink with the data).
  const [currencyOptions, setCurrencyOptions] = useState<string[]>([]);

  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [paymentLabels, setPaymentLabels] = useState<Record<string, string>>({});
  const [paymentClients, setPaymentClients] = useState<Record<string, string>>({});

  const hasFilters = !!(clientFilter || projectFilter || statusFilter || bucketFilter || fromFilter || toFilter || currencyFilter);

  const load = useCallback(() => {
    if (sessionLoading || !allowed) return;
    setLoading(true);
    const p = new URLSearchParams();
    if (clientFilter) p.set('clientId', clientFilter);
    if (projectFilter) p.set('projectId', projectFilter);
    if (statusFilter) p.set('status', statusFilter);
    if (bucketFilter) p.set('agingBucket', bucketFilter);
    if (fromFilter) p.set('from', fromFilter);
    if (toFilter) p.set('to', toFilter);
    if (currencyFilter) p.set('currency', currencyFilter);
    p.set('dueSoonDays', String(dueSoonDays));
    fetch(`/api/agency/receivables?${p.toString()}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => {
        setData(body.receivables || null);
        setError(null);
        // Currency options grow monotonically — a filtered payload only
        // carries its own rows, so the full set is remembered, not re-derived.
        setCurrencyOptions(prev => {
          const seen = new Set(prev);
          for (const inv of (body.receivables?.invoices ?? []) as Array<{ total: { currency: string } }>) {
            seen.add(inv.total.currency);
          }
          return seen.size === prev.length ? prev : [...seen].sort();
        });
      })
      .catch(() => setError('We couldn\'t load receivables. Try again.'))
      .finally(() => setLoading(false));
  }, [sessionLoading, allowed, clientFilter, projectFilter, statusFilter, bucketFilter, fromFilter, toFilter, currencyFilter, dueSoonDays]);

  useEffect(() => {
    if (!sessionLoading && allowed) load();
  }, [load, sessionLoading, allowed]);

  // §104 collection history — loaded once, when the tab is first opened.
  useEffect(() => {
    if (tab !== 'collections' || payments !== null) return;
    fetch('/api/agency/payments')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => {
        setPayments(body.payments || []);
        setPaymentLabels(body.invoiceLabels || {});
        setPaymentClients(body.clientNames || {});
      })
      .catch(() => setPayments([]));
  }, [tab, payments]);

  const summaryCards = useMemo(() => {
    if (!data) return [];
    const money = (v: number | null) =>
      v === null ? 'Mixed' : formatMoney({ amount: v, currency: data.currency ?? 'INR' });
    return [
      { label: 'Outstanding', value: money(data.outstanding), tone: 'text-neutral-200' },
      { label: `Due in ${data.dueSoonDays} days`, value: money(data.dueSoon), tone: 'text-neutral-200' },
      {
        label: 'Overdue',
        value: money(data.overdueAmount),
        tone: data.overdueAmount !== null && data.overdueAmount > 0 ? 'text-amber-400' : 'text-neutral-200',
        note: data.overdueCount > 0 ? `${data.overdueCount} invoice${data.overdueCount === 1 ? '' : 's'}` : undefined,
      },
      { label: 'Open invoices', value: String(data.openInvoiceCount), tone: 'text-neutral-200' },
    ];
  }, [data]);

  if (!sessionLoading && !allowed) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <Wallet className="w-8 h-8 mx-auto text-neutral-700" aria-hidden />
        <h1 className="mt-4 text-[16px] font-semibold text-white">Agency workspace required</h1>
        <p className="mt-2 text-[13px] text-neutral-500">Receivables is an Agency workspace feature.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-[13px] text-neutral-300 underline underline-offset-4">Go to the standard dashboard</Link>
      </div>
    );
  }

  const tabCls = (v: Tab) => `px-2.5 py-1 rounded text-[11.5px] font-medium transition-colors ${tab === v ? 'bg-white/[0.08] text-white' : 'text-neutral-500 hover:text-neutral-300'}`;
  const selectCls = 'px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[12.5px] text-neutral-200 focus:outline-none focus:border-white/20';

  return (
    <div className="p-4 sm:p-6 space-y-4 w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[16px] font-semibold text-white tracking-tight">Receivables</h1>
          <p className="text-[12.5px] text-neutral-500">
            Who owes us money, how much, and for how long{data ? ` — as of ${formatDate(data.asOf)}` : ''}
          </p>
        </div>
        <Link
          href="/dashboard/agency/invoices"
          className="inline-flex items-center gap-1.5 text-[13px] text-neutral-300 hover:text-white transition-colors"
        >
          Go to invoices <ArrowRight className="w-3.5 h-3.5" aria-hidden />
        </Link>
      </div>

      {loading && (
        <div className="space-y-2" aria-busy="true" aria-label="Loading receivables">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-white/[0.03] animate-pulse" />)}
        </div>
      )}

      {error && !loading && (
        <div role="alert" className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <p className="text-[13px] text-neutral-200">{error}</p>
          <button onClick={load} className="mt-2 text-[12.5px] text-neutral-400 underline underline-offset-4">Retry</button>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* §87 — the summary position. §127 — "Mixed" never a fake total. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {summaryCards.map(({ label, value, tone, note }) => (
              <div key={label} className="rounded-xl border border-white/[0.06] bg-[#050505] p-3.5">
                <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">{label}</div>
                <div className={`mt-1.5 text-[16px] font-semibold tabular-nums tracking-tight ${tone}`}>{value}</div>
                {note && <div className="mt-0.5 text-[10.5px] text-neutral-500">{note}</div>}
              </div>
            ))}
          </div>

          {/* §88 — the aging ladder over the remaining balance. */}
          <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-3.5">
            <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Aging (by days past due)</div>
            <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-5 gap-2">
              {BUCKETS.map(bucket => (
                <button
                  key={bucket}
                  onClick={() => setBucketFilter(bucketFilter === bucket ? '' : bucket)}
                  className={`rounded-lg border p-2.5 text-left transition-colors ${
                    bucketFilter === bucket
                      ? 'border-white/25 bg-white/[0.06]'
                      : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                  }`}
                  aria-pressed={bucketFilter === bucket}
                >
                  <div className="text-[10.5px] text-neutral-500">{BUCKET_LABEL[bucket]}</div>
                  <div className={`mt-1 text-[14px] font-semibold tabular-nums ${bucket === 'CURRENT' ? 'text-neutral-200' : bucket === '90+' ? 'text-red-300' : 'text-amber-300'}`}>
                    {data.byAgingBucket[bucket] === null
                      ? '—'
                      : formatMoney({ amount: data.byAgingBucket[bucket]!, currency: data.currency ?? 'INR' })}
                  </div>
                </button>
              ))}
            </div>
            {data.mixedCurrencies && (
              <div className="mt-2 text-[11px] text-neutral-500">
                Open invoices span multiple currencies — totals are displayed per invoice currency.
              </div>
            )}
          </div>

          {/* §96 — the filters. */}
          <div className="flex flex-wrap items-center gap-2">
            <Select
              className={selectCls}
              value={clientFilter}
              onChange={e => setClientFilter(e.target.value)}
              aria-label="Filter by client"
              wrapperClassName="w-full sm:w-40 shrink-0"
            >
              <option value="">All clients</option>
              {data.byClient.map(c => (
                <option key={c.clientId} value={c.clientId}>{c.clientName || 'Unnamed Client'}</option>
              ))}
            </Select>
            <Select
              className={selectCls}
              value={projectFilter}
              onChange={e => setProjectFilter(e.target.value)}
              aria-label="Filter by project"
              wrapperClassName="w-full sm:w-40 shrink-0"
            >
              <option value="">All projects</option>
              {data.byProject.filter(p => p.projectId !== null).map(p => (
                <option key={p.projectId!} value={p.projectId!}>{p.projectName || 'Unnamed Project'}</option>
              ))}
            </Select>
            <Select
              className={selectCls}
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
              wrapperClassName="w-full sm:w-36 shrink-0"
            >
              <option value="">Any status</option>
              <option value="SENT">Sent</option>
              <option value="PARTIALLY_PAID">Partially paid</option>
              <option value="OVERDUE">Overdue</option>
            </Select>
            <Select
              className={selectCls}
              value={bucketFilter}
              onChange={e => setBucketFilter(e.target.value)}
              aria-label="Filter by aging bucket"
              wrapperClassName="w-full sm:w-36 shrink-0"
            >
              <option value="">Any aging</option>
              {BUCKETS.map(b => <option key={b} value={b}>{BUCKET_LABEL[b]}</option>)}
            </Select>
            <Select
              className={selectCls}
              value={currencyFilter}
              onChange={e => setCurrencyFilter(e.target.value)}
              aria-label="Filter by currency"
              wrapperClassName="w-full sm:w-32 shrink-0"
            >
              <option value="">Any currency</option>
              {currencyOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <label className="flex items-center gap-1 text-[11.5px] text-neutral-500">
              Due soon in
              <Select
                className={selectCls}
                value={dueSoonDays}
                onChange={e => setDueSoonDays(Number(e.target.value))}
                aria-label="Due-soon window (days)"
              >
                {[1, 3, 7, 14, 30, 60, 90].map(d => (
                  <option key={d} value={d}>{d === 1 ? '1 day' : `${d} days`}</option>
                ))}
              </Select>
            </label>
            <div className="flex items-center gap-1.5 text-[11.5px] text-neutral-500 shrink-0">
              <span>Due from</span>
              <DatePicker
                wrapperClassName="w-36"
                value={fromFilter}
                onChange={e => setFromFilter(e.target.value)}
                aria-label="Due date from"
              />
              <span>to</span>
              <DatePicker
                wrapperClassName="w-36"
                value={toFilter}
                min={fromFilter}
                onChange={e => setToFilter(e.target.value)}
                aria-label="Due date to"
              />
            </div>
            {hasFilters && (
              <button
                onClick={() => { setClientFilter(''); setProjectFilter(''); setStatusFilter(''); setBucketFilter(''); setFromFilter(''); setToFilter(''); setCurrencyFilter(''); }}
                className="text-[12px] text-neutral-400 underline underline-offset-4 hover:text-neutral-200"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* §104 — the report lenses. */}
          <div className="flex flex-wrap gap-1" role="group" aria-label="Receivables views">
            {([
              ['invoices', `Invoices (${data.invoices.length})`],
              ['clients', `By client (${data.byClient.length})`],
              ['projects', `By project (${data.byProject.length})`],
              ['collections', 'Collections'],
            ] as Array<[Tab, string]>).map(([v, label]) => (
              <button key={v} onClick={() => setTab(v)} className={tabCls(v)}>{label}</button>
            ))}
          </div>

          {tab === 'invoices' && (
            data.invoices.length === 0 ? (
              <div className="rounded-xl border border-white/[0.08] bg-[#050505] p-8 text-center">
                <Wallet className="w-8 h-8 mx-auto text-neutral-700" aria-hidden />
                <h2 className="mt-3 text-[14px] font-semibold text-white">Nothing outstanding here</h2>
                <p className="mt-1.5 text-[12.5px] text-neutral-500 max-w-sm mx-auto">
                  {hasFilters ? 'No open invoices match these filters.' : 'Every issued invoice is fully settled.'}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-white/[0.06] overflow-x-auto">
                <table className="w-full text-[13px]" aria-label="Accounts receivable list">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                      <th scope="col" className="px-4 py-3 font-medium">Invoice</th>
                      <th scope="col" className="px-4 py-3 font-medium">Client / Project</th>
                      <th scope="col" className="px-4 py-3 font-medium text-right">Total</th>
                      <th scope="col" className="px-4 py-3 font-medium text-right">Paid</th>
                      <th scope="col" className="px-4 py-3 font-medium text-right">Due</th>
                      <th scope="col" className="px-4 py-3 font-medium">Due date</th>
                      <th scope="col" className="px-4 py-3 font-medium text-right">Age</th>
                      <th scope="col" className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.invoices.map(r => (
                      <tr key={r.invoiceId} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors align-top">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Link href={`/dashboard/agency/invoices/${r.invoiceId}`} className="text-white underline underline-offset-2 hover:text-neutral-300">
                            {r.invoiceNumber || 'Invoice'}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-neutral-400">
                          {r.clientName || 'Client'}
                          {r.projectId && <div className="text-[11.5px] text-neutral-600 truncate max-w-[14rem]">{r.projectName || 'Project'}</div>}
                        </td>
                        <td className="px-4 py-3 text-right text-neutral-300 tabular-nums whitespace-nowrap">{formatMoney(r.total)}</td>
                        <td className="px-4 py-3 text-right text-neutral-400 tabular-nums whitespace-nowrap">{formatMoney(r.paid)}</td>
                        <td className="px-4 py-3 text-right text-white tabular-nums whitespace-nowrap font-medium">{formatMoney(r.due)}</td>
                        <td className="px-4 py-3 text-neutral-400 whitespace-nowrap">
                          {formatDate(r.dueDate)}
                          {r.status !== r.displayStatus && <div className="text-[10.5px] text-neutral-600">state: {r.status}</div>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                          {r.ageDays > 0
                            ? <span className="text-red-300">{r.ageDays}d</span>
                            : <span className="text-neutral-600">—</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_STYLE[r.displayStatus] ?? ''}`}>
                            {r.displayStatus === 'PARTIALLY_PAID' ? 'Partially paid' : r.displayStatus.charAt(0) + r.displayStatus.slice(1).toLowerCase()}
                          </span>
                          {r.collectionRisk && (
                            <span className={`ml-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${RISK_STYLE[r.collectionRisk]}`}>
                              <AlertTriangle className="w-3 h-3" aria-hidden />
                              {RISK_LABEL[r.collectionRisk]}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {tab === 'clients' && (
            <div className="rounded-xl border border-white/[0.06] overflow-x-auto">
              <table className="w-full text-[13px]" aria-label="Receivables by client">
                <thead>
                  <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                    <th scope="col" className="px-4 py-3 font-medium">Client</th>
                    <th scope="col" className="px-4 py-3 font-medium text-right">Invoices</th>
                    <th scope="col" className="px-4 py-3 font-medium text-right">Outstanding</th>
                    <th scope="col" className="px-4 py-3 font-medium text-right">Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byClient.map(c => (
                    <tr key={c.clientId} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-white">{c.clientName || 'Unnamed Client'}</td>
                      <td className="px-4 py-3 text-right text-neutral-400 tabular-nums">{c.invoiceCount}</td>
                      <td className="px-4 py-3 text-right text-white tabular-nums font-medium">
                        {c.outstanding === null ? '—' : formatMoney({ amount: c.outstanding, currency: c.currency ?? 'INR' })}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums ${(c.overdue ?? 0) > 0 ? 'text-amber-300' : 'text-neutral-500'}`}>
                        {c.overdue === null ? '—' : formatMoney({ amount: c.overdue, currency: c.currency ?? 'INR' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'projects' && (
            <div className="rounded-xl border border-white/[0.06] overflow-x-auto">
              <table className="w-full text-[13px]" aria-label="Receivables by project">
                <thead>
                  <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                    <th scope="col" className="px-4 py-3 font-medium">Project</th>
                    <th scope="col" className="px-4 py-3 font-medium text-right">Invoices</th>
                    <th scope="col" className="px-4 py-3 font-medium text-right">Outstanding</th>
                    <th scope="col" className="px-4 py-3 font-medium text-right">Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byProject.map(p => (
                    <tr key={p.projectId ?? '__none'} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-white">
                        {p.projectId === null
                          ? <span className="text-neutral-500">No project (standalone invoices)</span>
                          : (p.projectName || 'Unnamed Project')}
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-400 tabular-nums">{p.invoiceCount}</td>
                      <td className="px-4 py-3 text-right text-white tabular-nums font-medium">
                        {p.outstanding === null ? '—' : formatMoney({ amount: p.outstanding, currency: p.currency ?? 'INR' })}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums ${(p.overdue ?? 0) > 0 ? 'text-amber-300' : 'text-neutral-500'}`}>
                        {p.overdue === null ? '—' : formatMoney({ amount: p.overdue, currency: p.currency ?? 'INR' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'collections' && (
            <div className="rounded-xl border border-white/[0.06] overflow-x-auto">
              {payments === null ? (
                <div className="p-8 text-center text-[12.5px] text-neutral-500" aria-busy="true">Loading collections…</div>
              ) : payments.length === 0 ? (
                <div className="p-8 text-center">
                  <h2 className="text-[14px] font-semibold text-white">No payments recorded yet</h2>
                  <p className="mt-1.5 text-[12.5px] text-neutral-500">Collection history appears here as payments are confirmed.</p>
                </div>
              ) : (
                <table className="w-full text-[13px]" aria-label="Collection history">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                      <th scope="col" className="px-4 py-3 font-medium">Received</th>
                      <th scope="col" className="px-4 py-3 font-medium">Invoice</th>
                      <th scope="col" className="px-4 py-3 font-medium">Client</th>
                      <th scope="col" className="px-4 py-3 font-medium">Method</th>
                      <th scope="col" className="px-4 py-3 font-medium text-right">Amount</th>
                      <th scope="col" className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map(p => (
                      <tr key={p.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 text-neutral-400 whitespace-nowrap">{formatDate(p.receivedAt)}</td>
                        <td className="px-4 py-3 text-neutral-300">{paymentLabels[p.invoiceId] ?? p.invoiceId}</td>
                        <td className="px-4 py-3 text-neutral-400">{paymentClients[p.clientId] ?? p.clientId}</td>
                        <td className="px-4 py-3 text-neutral-400 whitespace-nowrap">{p.method}</td>
                        <td className="px-4 py-3 text-right text-white tabular-nums whitespace-nowrap">{formatMoney(p.amount)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`text-[11px] font-medium ${
                            p.status === 'CONFIRMED' ? 'text-emerald-300' : p.status === 'PENDING' ? 'text-amber-300' : 'text-neutral-500'
                          }`}>{p.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="px-4 py-2.5 border-t border-white/[0.06]">
                <Link href="/dashboard/agency/payments" className="inline-flex items-center gap-1 text-[12.5px] text-neutral-300 hover:text-white transition-colors">
                  Full payment history <ArrowRight className="w-3.5 h-3.5" aria-hidden />
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
