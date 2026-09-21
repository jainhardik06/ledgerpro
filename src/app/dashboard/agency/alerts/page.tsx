"use client";

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, AlertTriangle, AlertCircle, Info, ChevronRight } from 'lucide-react';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';
import { tenantHasCapability } from '@/lib/agency/types/vertical';
import type {
  AlertSeverity, AlertStatus, AlertCategory, AlertRuleType,
} from '@/lib/agency/alerts/types';
import { Select } from '@/components/ui/Select';

/**
 * Alert Center (Module 15 §23) — the filterable list of every stored alert,
 * with acknowledge/resolve actions (§19 lifecycle).
 *
 * §70-style one-engine rule: opening this page hits /api/agency/alerts/summary
 * — the ONE endpoint that evaluates (§21) — and the list is a READ-ONLY query
 * over the store. The page never recomputes anything, it renders detections.
 *
 * §114 privacy: the API already removed cost-bearing rows for sessions
 * without agency.profitability.read; the counts (summary cards) include them.
 * Acknowledge/resolve are admin-only (agency.alerts.manage).
 */

/** The API view row (record + catalog-derived category/label). */
interface AlertRow {
  id: string;
  ruleType: AlertRuleType;
  severity: AlertSeverity;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  entityLabel?: string;
  clientId?: string;
  projectId?: string;
  invoiceId?: string;
  status: AlertStatus;
  triggeredAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  category: AlertCategory;
  ruleLabel: string;
}

interface SummaryCounts {
  open: number;
  acknowledged: number;
  resolved: number;
  openBySeverity: Record<AlertSeverity, number>;
}

const SEVERITY_ICON = {
  INFO: Info,
  WARNING: AlertTriangle,
  CRITICAL: AlertCircle,
} as const;
const SEVERITY_CLASS = {
  INFO: 'text-sky-400',
  WARNING: 'text-amber-400',
  CRITICAL: 'text-rose-400',
} as const;
const SEVERITY_BADGE = {
  INFO: 'text-sky-300 bg-sky-400/10',
  WARNING: 'text-amber-300 bg-amber-400/10',
  CRITICAL: 'text-red-300 bg-red-400/10',
} as const;
const SEVERITY_RANK: Record<AlertSeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };

const CATEGORY_TABS: ReadonlyArray<{ value: '' | AlertCategory; label: string }> = [
  { value: '', label: 'All' },
  { value: 'PROJECTS', label: 'Projects' },
  { value: 'BILLING', label: 'Billing' },
  { value: 'CASH', label: 'Cash' },
];

function formatStamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** The row's click-through (§23): project page or invoice page. */
function rowHref(row: AlertRow): string | undefined {
  if (row.projectId !== undefined) return `/dashboard/agency/projects/${row.projectId}`;
  if (row.invoiceId !== undefined) return `/dashboard/agency/invoices/${row.invoiceId}`;
  return undefined;
}

export default function AlertCenterPage() {
  const { tenant, user, loading: sessionLoading } = useDashboardContext();
  const allowed = tenantHasCapability(tenant, 'AGENCY_DASHBOARD');
  const canManage = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN';

  const [rows, setRows] = useState<AlertRow[]>([]);
  const [counts, setCounts] = useState<SummaryCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // §23 filters — every change re-queries the read-only list.
  const [category, setCategory] = useState<'' | AlertCategory>('');
  const [severity, setSeverity] = useState<'' | AlertSeverity>('');
  const [status, setStatus] = useState<'' | AlertStatus>('');

  /** The list query — READ-ONLY over the store (§21). */
  const loadRows = useCallback(() => {
    const p = new URLSearchParams();
    if (category) p.set('category', category);
    if (severity) p.set('severity', severity);
    if (status) p.set('status', status);
    fetch(`/api/agency/alerts?${p.toString()}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then((body: { alerts?: AlertRow[] }) => {
        setRows(body.alerts || []);
        setError(null);
      })
      .catch(() => setError('We couldn\'t load alerts. Try again.'));
  }, [category, severity, status]);

  /**
   * §21 — the ONE evaluating read: the summary endpoint runs the snapshot
   * pass (idempotent) and reports the counts. Opening the Alert Center is a
   * sanctioned evaluation trigger; the list query above never evaluates.
   */
  const loadSummary = useCallback(() => {
    return fetch('/api/agency/alerts/summary')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then((body: { counts?: SummaryCounts }) => {
        setCounts(body.counts ?? null);
        return true;
      })
      .catch(() => false);
  }, []);

  useEffect(() => {
    if (sessionLoading || !allowed) return;
    setLoading(true);
    loadSummary().then(ok => {
      if (ok) loadRows();
      else setError('We couldn\'t evaluate alerts right now. Try again.');
    }).finally(() => setLoading(false));
    // The summary runs once per filter session (it evaluates); only the
    // read-only rows re-query on filter changes.
  }, [sessionLoading, allowed]);

  useEffect(() => {
    if (!loading && allowed) loadRows();
  }, [loadRows, loading, allowed]);

  /** §19 lifecycle actions (admin-only: agency.alerts.manage). */
  const act = async (row: AlertRow, action: 'acknowledge' | 'resolve') => {
    setBusyId(row.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/agency/alerts/${row.id}/${action}`, { method: 'POST' });
      if (res.status === 409) {
        setNotice({ kind: 'error', text: 'That alert has already moved on — refreshing.' });
      } else if (res.status === 404) {
        setNotice({ kind: 'error', text: 'That alert no longer exists — refreshing.' });
      } else if (!res.ok) {
        setNotice({ kind: 'error', text: `Couldn't ${action} the alert. Try again.` });
      } else {
        setNotice({ kind: 'info', text: action === 'acknowledge' ? 'Alert acknowledged.' : 'Alert resolved.' });
      }
    } catch {
      setNotice({ kind: 'error', text: `Couldn't ${action} the alert. Try again.` });
    } finally {
      setBusyId(null);
      // Re-evaluate + re-read: the summary pass is idempotent, and the row's
      // status/lifecycle fields must come from the store, never local edits.
      loadSummary().then(() => loadRows());
    }
  };

  if (!sessionLoading && !allowed) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <Bell className="w-8 h-8 mx-auto text-neutral-700" aria-hidden />
        <h1 className="mt-4 text-[16px] font-semibold text-white">Agency workspace required</h1>
        <p className="mt-2 text-[13px] text-neutral-500">The Alert Center is an Agency workspace feature.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-[13px] text-neutral-300 underline underline-offset-4">Go to the standard dashboard</Link>
      </div>
    );
  }

  const sorted = [...rows].sort((a, b) =>
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    || new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime()
  );

  const selectCls = 'px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[12.5px] text-neutral-200 focus:outline-none focus:border-white/20';
  const tabCls = (v: '' | AlertCategory) =>
    `px-2.5 py-1 rounded text-[11.5px] font-medium transition-colors ${category === v ? 'bg-white/[0.08] text-white' : 'text-neutral-500 hover:text-neutral-300'}`;

  const summaryCards = [
    {
      label: 'Open',
      value: counts ? String(counts.open) : '—',
      note: counts && counts.open > 0
        ? `${counts.openBySeverity.CRITICAL} critical · ${counts.openBySeverity.WARNING} warning · ${counts.openBySeverity.INFO} info`
        : undefined,
      tone: counts && counts.open > 0 ? 'text-rose-300' : 'text-neutral-200',
    },
    { label: 'Acknowledged', value: counts ? String(counts.acknowledged) : '—', tone: 'text-neutral-200' },
    { label: 'Resolved', value: counts ? String(counts.resolved) : '—', tone: 'text-neutral-500' },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-4 w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[16px] font-semibold text-white tracking-tight">Alert Center</h1>
          <p className="text-[12.5px] text-neutral-500">
            Deterministic warnings from your projects, billing and cash — nothing here is predictive.
          </p>
        </div>
        <Link
          href="/dashboard/agency"
          className="inline-flex items-center gap-1.5 text-[13px] text-neutral-300 hover:text-white transition-colors"
        >
          Back to Command Center <ChevronRight className="w-3.5 h-3.5" aria-hidden />
        </Link>
      </div>

      {notice && (
        <div
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`rounded-xl border p-3 text-[13px] ${
            notice.kind === 'error'
              ? 'border-red-500/25 bg-red-500/[0.06] text-red-300'
              : 'border-white/[0.08] bg-white/[0.02] text-neutral-300'
          }`}
        >
          {notice.text}
        </div>
      )}

      {loading && (
        <div className="space-y-2" aria-busy="true" aria-label="Evaluating alerts">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-white/[0.03] animate-pulse" />)}
        </div>
      )}

      {error && !loading && (
        <div role="alert" className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <p className="text-[13px] text-neutral-200">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* §22 — the headline counts (includes cost-bearing alerts; the
              rows below are already §114-filtered by the API). */}
          <div className="grid grid-cols-3 gap-3">
            {summaryCards.map(({ label, value, tone, note }) => (
              <div key={label} className="rounded-xl border border-white/[0.06] bg-[#050505] p-3.5">
                <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">{label}</div>
                <div className={`mt-1.5 text-[16px] font-semibold tabular-nums tracking-tight ${tone}`}>{value}</div>
                {note && <div className="mt-0.5 text-[10.5px] text-neutral-500">{note}</div>}
              </div>
            ))}
          </div>

          {/* §23 filters: category × severity × status. */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex flex-wrap gap-1" role="group" aria-label="Alert categories">
              {CATEGORY_TABS.map(({ value, label }) => (
                <button key={value || 'all'} onClick={() => setCategory(value)} className={tabCls(value)}>{label}</button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Select
                className={selectCls}
                value={severity}
                onChange={e => setSeverity(e.target.value as '' | AlertSeverity)}
                aria-label="Filter by severity"
                wrapperClassName="w-full sm:w-36 shrink-0"
              >
                <option value="">Any severity</option>
                <option value="CRITICAL">Critical</option>
                <option value="WARNING">Warning</option>
                <option value="INFO">Info</option>
              </Select>
              <Select
                className={selectCls}
                value={status}
                onChange={e => setStatus(e.target.value as '' | AlertStatus)}
                aria-label="Filter by status"
                wrapperClassName="w-full sm:w-36 shrink-0"
              >
                <option value="">Any status</option>
                <option value="OPEN">Open</option>
                <option value="ACKNOWLEDGED">Acknowledged</option>
                <option value="RESOLVED">Resolved</option>
              </Select>
            </div>
          </div>

          {sorted.length === 0 ? (
            <div className="rounded-xl border border-white/[0.08] bg-[#050505] p-8 text-center">
              <Bell className="w-8 h-8 mx-auto text-neutral-700" aria-hidden />
              <h2 className="mt-3 text-[14px] font-semibold text-white">No alerts match</h2>
              <p className="mt-1.5 text-[12.5px] text-neutral-500 max-w-sm mx-auto">
                Nothing detected under these filters — either you're on top of things, or the filter is narrow.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-white/[0.06] overflow-x-auto">
              <table className="w-full text-[13px]" aria-label="Alerts">
                <thead>
                  <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                    <th scope="col" className="px-4 py-3 font-medium">Alert</th>
                    <th scope="col" className="px-4 py-3 font-medium">Rule</th>
                    <th scope="col" className="px-4 py-3 font-medium">Detected</th>
                    <th scope="col" className="px-4 py-3 font-medium">Status</th>
                    {canManage && <th scope="col" className="px-4 py-3 font-medium text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(row => {
                    const Icon = SEVERITY_ICON[row.severity];
                    const href = rowHref(row);
                    return (
                      <tr key={row.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors align-top">
                        <td className="px-4 py-3 max-w-[28rem]">
                          <div className="flex items-start gap-2.5">
                            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${SEVERITY_CLASS[row.severity]}`} aria-hidden />
                            <div className="min-w-0">
                              <div className="text-neutral-200">
                                <span className="sr-only">{row.severity === 'CRITICAL' ? 'Critical: ' : row.severity === 'WARNING' ? 'Warning: ' : ''}</span>
                                {row.message}
                              </div>
                              {row.entityLabel && (
                                href
                                  ? <Link href={href} className="mt-0.5 inline-flex items-center gap-0.5 text-[12px] text-neutral-500 hover:text-neutral-300 transition-colors">
                                      {row.entityLabel}
                                      <ChevronRight className="w-3 h-3" aria-hidden />
                                    </Link>
                                  : <span className="mt-0.5 block text-[12px] text-neutral-500">{row.entityLabel}</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-[12px] text-neutral-400">{row.ruleLabel}</span>
                          <div className="text-[10.5px] text-neutral-600">{row.category.charAt(0) + row.category.slice(1).toLowerCase()}</div>
                        </td>
                        <td className="px-4 py-3 text-neutral-400 whitespace-nowrap">{formatStamp(row.triggeredAt)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${SEVERITY_BADGE[row.severity]}`}>
                            {row.severity.charAt(0) + row.severity.slice(1).toLowerCase()}
                          </span>
                          <div className="mt-1 text-[11px] text-neutral-500">
                            {row.status === 'OPEN' && 'Open'}
                            {row.status === 'ACKNOWLEDGED' && `Acknowledged${row.acknowledgedBy ? ` by ${row.acknowledgedBy}` : ''}`}
                            {row.status === 'RESOLVED' && `${row.resolvedBy ? `Resolved by ${row.resolvedBy}` : 'Auto-resolved'}`}
                          </div>
                        </td>
                        {canManage && (
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {/* §19 lifecycle: OPEN → ACKNOWLEDGED → RESOLVED. */}
                            {row.status === 'OPEN' && (
                              <button
                                onClick={() => act(row, 'acknowledge')}
                                disabled={busyId === row.id}
                                className="px-2.5 py-1 rounded-lg border border-white/[0.1] text-[12px] text-neutral-300 hover:bg-white/[0.06] transition-colors disabled:opacity-50"
                              >
                                {busyId === row.id ? '…' : 'Acknowledge'}
                              </button>
                            )}
                            {(row.status === 'OPEN' || row.status === 'ACKNOWLEDGED') && (
                              <button
                                onClick={() => act(row, 'resolve')}
                                disabled={busyId === row.id}
                                className="ml-2 px-2.5 py-1 rounded-lg border border-white/[0.1] text-[12px] text-neutral-300 hover:bg-white/[0.06] transition-colors disabled:opacity-50"
                              >
                                {busyId === row.id ? '…' : 'Resolve'}
                              </button>
                            )}
                            {row.status === 'RESOLVED' && <span className="text-[11px] text-neutral-600">—</span>}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
