"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Receipt, Plus, Pencil, Send, ClipboardCheck } from 'lucide-react';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';
import { tenantHasCapability } from '@/lib/agency/types/vertical';
import type { Expense, ExpenseApprovalStatus } from '@/lib/agency/types/expense';
import type { Money } from '@/lib/agency/types/money';
import { ExpenseDrawer } from '@/components/agency/expenses/ExpenseDrawer';
import { alertModal } from '@/components/ui/Dialog';
import { SearchBar } from '@/components/ui/SearchBar';

/**
 * Expenses (Module 8, §53) — the primary expense surface.
 *
 * Date-windowed views over the caller's own expenses (§33: the server
 * forces the scope for non-admins; admins may widen it). Row actions follow
 * the lifecycle: DRAFT/REJECTED are editable and submittable; SUBMITTED
 * await review; APPROVED show their client charge (§49); INVOICED are
 * locked. §99: non-admin payloads arrive cost-redacted — the Amount column
 * stays blank for them, never a fake number.
 */
type ExpenseRow = Omit<Expense, 'amount' | 'markupPercent'> & {
  amount?: Money;
  markupPercent?: number;
};

const STATUS_STYLE: Record<ExpenseApprovalStatus, string> = {
  DRAFT: 'text-neutral-400 bg-white/[0.05]',
  SUBMITTED: 'text-sky-300 bg-sky-400/10',
  APPROVED: 'text-emerald-300 bg-emerald-400/10',
  REJECTED: 'text-red-300 bg-red-400/10',
  REIMBURSED: 'text-violet-300 bg-violet-400/10',
};

const TYPE_STYLE: Record<string, string> = {
  BILLABLE: 'text-emerald-300',
  PASS_THROUGH: 'text-sky-300',
  INTERNAL: 'text-neutral-500',
};

function weekStart(date: Date): string {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;  // Monday = 0
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(d: string): string {
  try {
    return new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return d;
  }
}

function inr(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

export default function ExpensesPage() {
  const { tenant, user, loading: sessionLoading } = useDashboardContext();
  const allowed = tenantHasCapability(tenant, 'AGENCY_DASHBOARD');
  const isAdmin = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN';
  const userId = user?.id;

  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'TODAY' | 'WEEK' | 'HISTORY'>('WEEK');
  const [scope, setScope] = useState<'MINE' | 'ALL'>('MINE');
  const [statusFilter, setStatusFilter] = useState<'' | ExpenseApprovalStatus>('');
  const [vendorQuery, setVendorQuery] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Debounce the vendor filter so typing does not fetch per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setVendorFilter(vendorQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [vendorQuery]);

  const load = useCallback(() => {
    if (sessionLoading || !allowed) return;
    setLoading(true);
    const p = new URLSearchParams();
    const today = todayStr();
    if (view === 'TODAY') { p.set('dateFrom', today); p.set('dateTo', today); }
    if (view === 'WEEK') { p.set('dateFrom', weekStart(new Date())); p.set('dateTo', today); }
    if (statusFilter) p.set('status', statusFilter);
    if (vendorFilter) p.set('vendor', vendorFilter);
    // §33 — the admin scope toggle: "Just me" narrows to the caller's rows;
    // "Everyone" is the unfiltered admin view. (Non-admins are forced
    // server-side; their toggle stays hidden.)
    if (isAdmin && scope === 'MINE' && userId) p.set('createdBy', userId);
    fetch(`/api/agency/expenses?${p.toString()}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => {
        setRows(body.expenses || []);
        setProjectNames(body.projectNames || {});
        setClientNames(body.clientNames || {});
        setError(null);
      })
      .catch(() => setError('We couldn\'t load expenses. Try again.'))
      .finally(() => setLoading(false));
  }, [sessionLoading, allowed, view, statusFilter, vendorFilter, isAdmin, scope, userId]);

  useEffect(() => {
    if (!sessionLoading && allowed) load();
  }, [load, sessionLoading, allowed]);

  // Everyone in an agency workspace records expenses (§39 base capability);
  // admins may widen the scope to the whole workspace.
  useEffect(() => {
    if (!isAdmin && scope === 'ALL') setScope('MINE');
  }, [isAdmin, scope]);

  // The drawer's "open-new-expense" event (Command Palette / project tab).
  useEffect(() => {
    function openNew() { setEditing(null); setDrawerOpen(true); }
    window.addEventListener('open-new-expense', openNew);
    return () => window.removeEventListener('open-new-expense', openNew);
  }, []);

  async function submitOne(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/agency/expenses/${id}/submit`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        await alertModal({
          title: 'Submission Failed',
          message: body.error || 'That didn\'t work. Try again.',
          variant: 'error',
        });
      }
      load();
    } catch {
      await alertModal({
        title: 'Submission Failed',
        message: 'That didn\'t work. Try again.',
        variant: 'error',
      });
    } finally {
      setBusyId(null);
    }
  }

  const totals = useMemo(() => ({
    // Admin-only economics (§99 — USER payloads carry no amount).
    cost: rows.reduce((s, r) => s + (r.amount?.amount ?? 0), 0),
    charge: rows.reduce((s, r) => s + (r.clientChargeAmount?.amount ?? 0), 0),
  }), [rows]);

  if (!sessionLoading && !allowed) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <Receipt className="w-8 h-8 mx-auto text-neutral-700" aria-hidden />
        <h1 className="mt-4 text-[16px] font-semibold text-white">Agency workspace required</h1>
        <p className="mt-2 text-[13px] text-neutral-500">Expense tracking is an Agency workspace feature.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-[13px] text-neutral-300 underline underline-offset-4">Go to the standard dashboard</Link>
      </div>
    );
  }

  const tabCls = (v: typeof view) => `px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors ${view === v ? 'bg-white/[0.08] text-white' : 'text-neutral-500 hover:text-neutral-300'}`;
  const statusCls = (v: '' | ExpenseApprovalStatus) => `px-2.5 py-1 rounded text-[11.5px] font-medium transition-colors ${statusFilter === v ? 'bg-white/[0.08] text-white' : 'text-neutral-500 hover:text-neutral-300'}`;

  return (
    <div className="p-4 sm:p-6 space-y-4 w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[16px] font-semibold text-white tracking-tight">Expenses</h1>
          <p className="text-[12.5px] text-neutral-500">What the agency spent, on whose behalf, and what the client will be charged</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link
              href="/dashboard/agency/expenses/approvals"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-white/[0.08] text-[12.5px] text-neutral-300 hover:bg-white/[0.04] transition-colors"
            >
              <ClipboardCheck className="w-3.5 h-3.5" aria-hidden /> Approvals
            </Link>
          )}
          <button
            onClick={() => { setEditing(null); setDrawerOpen(true); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden /> Record expense
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1" role="tablist" aria-label="Expense views">
          <button role="tab" aria-selected={view === 'TODAY'} onClick={() => setView('TODAY')} className={tabCls('TODAY')}>Today</button>
          <button role="tab" aria-selected={view === 'WEEK'} onClick={() => setView('WEEK')} className={tabCls('WEEK')}>This week</button>
          <button role="tab" aria-selected={view === 'HISTORY'} onClick={() => setView('HISTORY')} className={tabCls('HISTORY')}>History</button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* §53 — "Expenses by Vendor" report: filter rows by vendor name. */}
          <SearchBar
            value={vendorQuery}
            onChange={e => setVendorQuery(e.target.value)}
            placeholder="Filter by vendor…"
            aria-label="Filter expenses by vendor"
            wrapperClassName="w-full sm:w-48 shrink-0"
          />
          {isAdmin && (
            <div className="flex gap-1">
              <button onClick={() => setScope(s => (s === 'MINE' ? 'ALL' : 'MINE'))} className={`px-2.5 py-1 rounded text-[11.5px] font-medium transition-colors ${scope === 'ALL' ? 'bg-white/[0.08] text-white' : 'text-neutral-500 hover:text-neutral-300'}`}>
                {scope === 'ALL' ? 'Everyone' : 'Just me'}
              </button>
            </div>
          )}
          <div className="flex gap-1" role="group" aria-label="Status filter">
            {(['', 'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'] as const).map(v => (
              <button key={v || 'all'} onClick={() => setStatusFilter(v)} className={statusCls(v)}>
                {v === '' ? 'All' : v.charAt(0) + v.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          {isAdmin && rows.length > 0 && (
            <span className="text-[12px] text-neutral-500 tabular-nums">
              cost <strong className="text-white">{inr(totals.cost)}</strong>
              {totals.charge > 0 && <> · charge <strong className="text-white">{inr(totals.charge)}</strong></>}
            </span>
          )}
        </div>
      </div>

      {loading && (
        <div className="space-y-2" aria-busy="true" aria-label="Loading expenses">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-white/[0.03] animate-pulse" />)}
        </div>
      )}

      {error && !loading && (
        <div role="alert" className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <p className="text-[13px] text-neutral-200">{error}</p>
          <button onClick={load} className="mt-2 text-[12.5px] text-neutral-400 underline underline-offset-4">Retry</button>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-[#050505] p-8 text-center">
          <Receipt className="w-8 h-8 mx-auto text-neutral-700" aria-hidden />
          <h2 className="mt-3 text-[14px] font-semibold text-white">No expenses here yet</h2>
          <p className="mt-1.5 text-[12.5px] text-neutral-500 max-w-sm mx-auto">
            Record what the agency paid — vendors, tools, travel — and mark what the client recharges.
          </p>
          <button
            onClick={() => { setEditing(null); setDrawerOpen(true); }}
            className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden /> Record your first expense
          </button>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] overflow-x-auto">
          <table className="w-full text-[13px]" aria-label="Expenses">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th scope="col" className="px-4 py-3 font-medium">Date</th>
                <th scope="col" className="px-4 py-3 font-medium">Vendor</th>
                <th scope="col" className="px-4 py-3 font-medium">Project / Client</th>
                <th scope="col" className="px-4 py-3 font-medium">Type</th>
                <th scope="col" className="px-4 py-3 font-medium text-right">Amount</th>
                <th scope="col" className="px-4 py-3 font-medium text-right">Client charge</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const editable = (r.status === 'DRAFT' || r.status === 'REJECTED') && (isAdmin || r.createdBy === user?.id);
                const context = r.projectId
                  ? (projectNames[r.projectId] || 'Project')
                  : r.clientId
                    ? (clientNames[r.clientId] || 'Client')
                    : null;
                return (
                  <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors align-top">
                    <td className="px-4 py-3 text-neutral-400 whitespace-nowrap">{formatDate(r.expenseDate)}</td>
                    <td className="px-4 py-3">
                      <span className="text-white">{r.vendorName}</span>
                      <div className="text-[11.5px] text-neutral-500 truncate max-w-[16rem]">{r.description}</div>
                    </td>
                    <td className="px-4 py-3 text-neutral-400">{context || <span className="text-neutral-600">Standalone</span>}</td>
                    <td className="px-4 py-3">
                      <span className={TYPE_STYLE[r.expenseType]}>{r.expenseType === 'PASS_THROUGH' ? 'PASS-THRU' : r.expenseType}</span>
                      {r.billable && r.markupPercent !== undefined && <span className="ml-1 text-[11px] text-neutral-600">+{r.markupPercent}%</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-white tabular-nums whitespace-nowrap">
                      {r.amount ? inr(r.amount.amount) : <span className="text-neutral-600" title="Cost visible to administrators only">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                      {r.billable
                        ? <span className="text-emerald-300">{r.clientChargeAmount ? inr(r.clientChargeAmount.amount) : '—'}</span>
                        : <span className="text-neutral-600">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                      {r.billingStatus === 'INVOICED' && <span className="ml-1 inline-block px-2 py-0.5 rounded text-[11px] font-medium text-violet-300 bg-violet-400/10">INVOICED</span>}
                      {r.transactionId && <div className="mt-0.5 text-[10.5px] text-neutral-600" title="Linked ledger transaction">ledger ✓</div>}
                      {r.rejectionReason && <div className="mt-1 text-[11.5px] text-red-400/80">Rejected: {r.rejectionReason}</div>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {editable && (
                        <>
                          <button
                            onClick={() => { setEditing(r); setDrawerOpen(true); }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-white/[0.08] text-[11.5px] text-neutral-300 hover:bg-white/[0.04] transition-colors mr-1"
                          >
                            <Pencil className="w-3 h-3" aria-hidden /> Edit
                          </button>
                          <button
                            onClick={() => void submitOne(r.id)}
                            disabled={busyId === r.id}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-white/[0.08] text-[11.5px] text-neutral-300 hover:bg-white/[0.04] disabled:opacity-40 transition-colors"
                          >
                            <Send className="w-3 h-3" aria-hidden /> Submit
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ExpenseDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => { setDrawerOpen(false); setEditing(null); load(); }}
        editing={editing}
      />
    </div>
  );
}
