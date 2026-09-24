"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, X, ClipboardCheck } from 'lucide-react';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';
import { tenantHasCapability } from '@/lib/agency/types/vertical';
import type { Expense } from '@/lib/agency/types/expense';
import { alertModal } from '@/components/ui/Dialog';

/**
 * Expense Approval Queue (Module 8, §40/§53) — the manager view.
 *
 * Every SUBMITTED expense in the workspace, with its full economic picture
 * (approvers are admins — or, via the API, the project's own manager; the
 * page itself is the admin surface in Phase 1). Approve creates the core
 * Transaction exactly once (§41/§42); Reject demands a reason and returns
 * the expense to its author as an editable draft.
 */
export default function ExpenseApprovalsPage() {
  const { tenant, user, loading: sessionLoading } = useDashboardContext();
  const allowed = tenantHasCapability(tenant, 'AGENCY_DASHBOARD');
  const isAdmin = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN';

  const [rows, setRows] = useState<Expense[]>([]);
  const [userLabels, setUserLabels] = useState<Record<string, string>>({});
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Expense | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(() => {
    if (sessionLoading || !allowed || !isAdmin) return;
    setLoading(true);
    fetch('/api/agency/expenses/approvals')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => {
        setRows(body.expenses || []);
        setUserLabels(body.userLabels || {});
        setProjectNames(body.projectNames || {});
        setClientNames(body.clientNames || {});
        setError(null);
      })
      .catch(() => setError('We couldn\'t load the approval queue. Try again.'))
      .finally(() => setLoading(false));
  }, [sessionLoading, allowed, isAdmin]);

  useEffect(() => {
    if (!sessionLoading && allowed) load();
  }, [load, sessionLoading, allowed]);

  async function approve(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/agency/expenses/${id}/approve`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        await alertModal(body.error || "That didn't work. Try again.", { title: 'Approval Failed', variant: 'error' });
      }
      load();
    } catch {
      await alertModal("That didn't work. Try again.", { title: 'Approval Failed', variant: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  async function reject() {
    if (!rejecting) return;
    const trimmed = reason.trim();
    if (!trimmed) return;
    setBusyId(rejecting.id);
    try {
      const res = await fetch(`/api/agency/expenses/${rejecting.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: trimmed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        await alertModal(body.error || "That didn't work. Try again.", { title: 'Rejection Failed', variant: 'error' });
      }
      setRejecting(null);
      setReason('');
      load();
    } catch {
      await alertModal("That didn't work. Try again.", { title: 'Rejection Failed', variant: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  const totals = useMemo(() => ({
    cost: rows.reduce((s, r) => s + r.amount.amount, 0),
    charge: rows.reduce((s, r) => s + (r.clientChargeAmount?.amount ?? 0), 0),
  }), [rows]);

  function inr(n: number): string {
    return `₹${n.toLocaleString('en-IN')}`;
  }

  if (!sessionLoading && (!allowed || !isAdmin)) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <ClipboardCheck className="w-8 h-8 mx-auto text-neutral-700" aria-hidden />
        <h1 className="mt-4 text-[16px] font-semibold text-white">Admins only</h1>
        <p className="mt-2 text-[13px] text-neutral-500">Expense approvals are managed by workspace admins and project managers.</p>
        <Link href="/dashboard/agency/expenses" className="mt-4 inline-block text-[13px] text-neutral-300 underline underline-offset-4">Back to Expenses</Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[16px] font-semibold text-white tracking-tight">Expense Approvals</h1>
          <p className="text-[12.5px] text-neutral-500">Approval creates the ledger transaction once and makes billable spend invoice-eligible</p>
        </div>
        <Link href="/dashboard/agency/expenses" className="text-[12.5px] text-neutral-400 underline underline-offset-4 hover:text-white transition-colors">Back to Expenses</Link>
      </div>

      {rows.length > 0 && (
        <div className="flex flex-wrap gap-4 text-[12px] text-neutral-400">
          <span><strong className="text-white">{rows.length}</strong> awaiting review</span>
          <span>cost <strong className="text-white">{inr(totals.cost)}</strong></span>
          <span>client charge <strong className="text-white">{inr(totals.charge)}</strong></span>
        </div>
      )}

      {loading && (
        <div className="space-y-2" aria-busy="true" aria-label="Loading approval queue">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-white/[0.03] animate-pulse" />)}
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
          <ClipboardCheck className="w-8 h-8 mx-auto text-neutral-700" aria-hidden />
          <h2 className="mt-3 text-[14px] font-semibold text-white">Queue is clear</h2>
          <p className="mt-1.5 text-[12.5px] text-neutral-500 max-w-sm mx-auto">Nothing is waiting for approval. Submitted expenses land here.</p>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="space-y-2">
          {rows.map(r => (
            <article key={r.id} className="rounded-xl border border-white/[0.06] p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] text-white font-medium">{r.vendorName}</span>
                  <span className="text-neutral-600">·</span>
                  <span className="text-[13px] text-neutral-300">{r.description}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-neutral-400">
                  <span>{userLabels[r.createdBy] || 'Team Member'}</span>
                  <span>·</span>
                  <span>{r.expenseDate}</span>
                  {r.projectId && (<><span>·</span><span>{projectNames[r.projectId] || 'Project'}</span></>)}
                  {!r.projectId && r.clientId && (<><span>·</span><span>{clientNames[r.clientId] || 'Client'}</span></>)}
                  <span className="tabular-nums">{inr(r.amount.amount)}</span>
                  {r.billable
                    ? <span className="text-emerald-300 tabular-nums">
                        charge {r.clientChargeAmount ? inr(r.clientChargeAmount.amount) : '—'}{r.markupPercent !== undefined ? ` (+${r.markupPercent}%)` : ''}
                      </span>
                    : <span>internal — not billed</span>}
                  {r.receiptReference && <span className="text-neutral-600 truncate max-w-xs" title="Receipt reference">🧾 {r.receiptReference}</span>}
                  {r.notes && <span className="text-neutral-600 truncate max-w-xs">“{r.notes}”</span>}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => void approve(r.id)}
                  disabled={busyId === r.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-400 text-black text-[12.5px] font-semibold hover:bg-emerald-300 disabled:opacity-40 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" aria-hidden /> Approve
                </button>
                <button
                  onClick={() => { setRejecting(r); setReason(''); }}
                  disabled={busyId === r.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-white/[0.08] text-[12.5px] text-neutral-300 hover:text-red-300 hover:border-red-400/30 disabled:opacity-40 transition-colors"
                >
                  <X className="w-3.5 h-3.5" aria-hidden /> Reject
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* §40 — rejection demands a reason */}
      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-label="Reject expense">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setRejecting(null)} />
          <div className="relative w-full max-w-sm rounded-xl border border-white/[0.08] bg-[#0a0a0a] p-5">
            <button
              type="button"
              onClick={() => setRejecting(null)}
              aria-label="Close"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors"
              style={{ position: 'absolute', top: '14px', right: '14px', zIndex: 10 }}
            >
              <X className="w-4 h-4" />
            </button>
            <h2 className="text-[14px] font-semibold text-white pr-8">Reject this expense</h2>
            <p className="mt-1 text-[12px] text-neutral-500">
              {rejecting.vendorName} — {rejecting.description}. The author will see your reason and can edit and resubmit.
            </p>
            <label htmlFor="reject-reason" className="block mt-3 text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-1.5">Reason (required)</label>
            <textarea
              id="reject-reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              maxLength={2000}
              className="w-full px-3 py-2 rounded-lg bg-[#050505] border border-white/[0.08] text-[13px] text-white focus:outline-none focus:border-white/25 resize-none"
              placeholder="Why is this being rejected?"
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => void reject()}
                disabled={!reason.trim() || busyId === rejecting.id}
                className="flex-1 px-4 py-2 rounded-lg bg-red-400 text-black text-[13px] font-semibold hover:bg-red-300 disabled:opacity-40 transition-colors"
              >
                Reject expense
              </button>
              <button
                onClick={() => setRejecting(null)}
                className="px-4 py-2 rounded-lg border border-white/[0.08] text-[13px] text-neutral-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
