"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, X, ClipboardCheck, Clock } from 'lucide-react';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';
import { tenantHasCapability } from '@/lib/agency/types/vertical';
import { formatDuration, type TimeEntry } from '@/lib/agency/types/time';
import { alertModal } from '@/components/ui/Dialog';

/**
 * Approval Queue (Module 7, §25/§21) — the manager view.
 *
 * Every SUBMITTED entry in the workspace, with its full economic picture
 * (approvers are admins — or, via the API, the project's own manager; the
 * page itself is the admin surface in Phase 1). Approve computes economics
 * from the frozen snapshots (§23); Reject demands a reason (§20) and
 * returns the entry to its author as an editable draft.
 */
export default function TimeApprovalsPage() {
  const { tenant, user, loading: sessionLoading } = useDashboardContext();
  const allowed = tenantHasCapability(tenant, 'AGENCY_DASHBOARD');
  const isAdmin = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN';

  const [rows, setRows] = useState<TimeEntry[]>([]);
  const [userLabels, setUserLabels] = useState<Record<string, string>>({});
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<TimeEntry | null>(null);
  const [reason, setReason] = useState('');
  // §27 — limited bulk actions: the checked entries, one shared rejection
  // reason, and a bulk run in progress.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRejecting, setBulkRejecting] = useState(false);
  const [bulkReason, setBulkReason] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(() => {
    if (sessionLoading || !allowed || !isAdmin) return;
    setLoading(true);
    fetch('/api/agency/time/approvals')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => {
        setRows(body.timeEntries || []);
        setUserLabels(body.userLabels || {});
        setProjectNames(body.projectNames || {});
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
      const res = await fetch(`/api/agency/time/${id}/approve`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        await alertModal({
          title: 'Approval Failed',
          message: body.error || 'That didn\'t work. Try again.',
          variant: 'error',
        });
      }
      load();
    } catch {
      await alertModal({
        title: 'Approval Failed',
        message: 'That didn\'t work. Try again.',
        variant: 'error',
      });
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
      const res = await fetch(`/api/agency/time/${rejecting.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: trimmed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        await alertModal({
          title: 'Rejection Failed',
          message: body.error || 'That didn\'t work. Try again.',
          variant: 'error',
        });
      }
      setRejecting(null);
      setReason('');
      load();
    } catch {
      await alertModal({
        title: 'Rejection Failed',
        message: 'That didn\'t work. Try again.',
        variant: 'error',
      });
    } finally {
      setBusyId(null);
    }
  }

  function toggleSelected(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.id!));

  /**
   * §27 — one shared action over every checked entry, sequentially. A failed
   * item doesn't abort the run (each entry is its own state machine); the
   * summary names the survivors so nothing silently disappears.
   */
  async function runBulk(action: 'approve' | 'reject', rejectionReason?: string) {
    const ids = rows.filter(r => selected.has(r.id!)).map(r => r.id!);
    if (ids.length === 0) return;
    setBulkBusy(true);
    let failures = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/agency/time/${id}/${action}`, {
          method: 'POST',
          ...(action === 'reject' && {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: rejectionReason }),
          }),
        });
        if (!res.ok) failures++;
      } catch {
        failures++;
      }
    }
    setBulkBusy(false);
    setSelected(new Set());
    if (failures > 0) {
      await alertModal({
        title: 'Bulk Action Notice',
        message: `${ids.length - failures} of ${ids.length} succeeded. ${failures} could not be ${action}d — they are still in the queue.`,
        variant: 'warning',
      });
    }
    load();
  }

  async function bulkReject() {
    const trimmed = bulkReason.trim();
    if (!trimmed) return;
    await runBulk('reject', trimmed);
    setBulkRejecting(false);
    setBulkReason('');
  }

  const totals = useMemo(() => ({
    minutes: rows.reduce((s, r) => s + r.durationMinutes, 0),
    cost: rows.reduce((s, r) => s + (r.calculatedCost?.amount ?? 0), 0),
    billable: rows.reduce((s, r) => s + (r.calculatedBillableAmount?.amount ?? 0), 0),
  }), [rows]);

  if (!sessionLoading && (!allowed || !isAdmin)) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <ClipboardCheck className="w-8 h-8 mx-auto text-neutral-700" aria-hidden />
        <h1 className="mt-4 text-[16px] font-semibold text-white">Admins only</h1>
        <p className="mt-2 text-[13px] text-neutral-500">Time approvals are managed by workspace admins and project managers.</p>
        <Link href="/dashboard/agency/time" className="mt-4 inline-block text-[13px] text-neutral-300 underline underline-offset-4">Back to My Time</Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[16px] font-semibold text-white tracking-tight">Time Approvals</h1>
          <p className="text-[12.5px] text-neutral-500">Only approved work becomes invoice-eligible — review what your team submitted</p>
        </div>
        <Link href="/dashboard/agency/time" className="text-[12.5px] text-neutral-400 underline underline-offset-4 hover:text-white transition-colors">Back to My Time</Link>
      </div>

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 text-[12px] text-neutral-400">
          <span><strong className="text-white">{rows.length}</strong> awaiting review</span>
          <span><strong className="text-white">{formatDuration(totals.minutes)}</strong> submitted</span>
          <span>est. cost <strong className="text-white">₹{totals.cost.toLocaleString('en-IN')}</strong></span>
          <span>est. billable <strong className="text-white">₹{totals.billable.toLocaleString('en-IN')}</strong></span>
          {selected.size > 0 && (
            <span className="flex items-center gap-2 ml-auto">
              {/* §27 — limited bulk actions over the checked entries */}
              <button
                onClick={() => void runBulk('approve')}
                disabled={bulkBusy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-400 text-black text-[12px] font-semibold hover:bg-emerald-300 disabled:opacity-40 transition-colors"
              >
                <Check className="w-3.5 h-3.5" aria-hidden /> Approve {selected.size} selected
              </button>
              <button
                onClick={() => { setBulkRejecting(true); setBulkReason(''); }}
                disabled={bulkBusy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-white/[0.08] text-[12px] text-neutral-300 hover:text-red-300 hover:border-red-400/30 disabled:opacity-40 transition-colors"
              >
                <X className="w-3.5 h-3.5" aria-hidden /> Reject {selected.size} selected
              </button>
            </span>
          )}
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
          <p className="mt-1.5 text-[12.5px] text-neutral-500 max-w-sm mx-auto">Nothing is waiting for approval. Submitted entries land here.</p>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-[12px] text-neutral-400 select-none w-fit">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map(r => r.id!)))}
              className="accent-white/80"
              aria-label="Select all entries"
            />
            Select all
          </label>
          {rows.map(r => (
            <article key={r.id} className="rounded-xl border border-white/[0.06] p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <input
                type="checkbox"
                checked={selected.has(r.id!)}
                onChange={() => toggleSelected(r.id!)}
                className="accent-white/80 shrink-0"
                aria-label={`Select entry by ${userLabels[r.userId] || 'Team Member'} on ${r.date}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] text-white font-medium">{userLabels[r.userId] || 'Team Member'}</span>
                  <span className="text-neutral-600">·</span>
                  <span className="text-[13px] text-neutral-300">{projectNames[r.projectId] || 'Project'}</span>
                  <span className="text-neutral-600">·</span>
                  <span className="text-[12px] text-neutral-500">{r.date}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-neutral-400">
                  <span className="tabular-nums">{formatDuration(r.durationMinutes)}</span>
                  <span>{r.billable ? <span className="text-emerald-300">Billable</span> : 'Non-billable'}</span>
                  {r.costRateSnapshot && r.calculatedCost && <span className="tabular-nums">cost ₹{r.calculatedCost.amount.toLocaleString('en-IN')}</span>}
                  {r.billable && r.calculatedBillableAmount && <span className="tabular-nums">bill ₹{r.calculatedBillableAmount.amount.toLocaleString('en-IN')}</span>}
                  {r.financialStatus === 'RATE_CONFIGURATION_REQUIRED' && (
                    <span className="text-amber-300" title="Tracked, but rates are not configured — approval proceeds while financial recognition awaits rate configuration">
                      rate setup required
                    </span>
                  )}
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

      {/* §20 — rejection demands a reason */}
      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-label="Reject time entry">
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
            <h2 className="text-[14px] font-semibold text-white pr-8">Reject this entry</h2>
            <p className="mt-1 text-[12px] text-neutral-500">
              {formatDuration(rejecting.durationMinutes)} on {rejecting.date} — the author will see your reason and can edit and resubmit.
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
                Reject entry
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

      {/* §27 — bulk rejection: ONE reason, applied to every checked entry */}
      {bulkRejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-label="Reject selected time entries">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setBulkRejecting(false)} />
          <div className="relative w-full max-w-sm rounded-xl border border-white/[0.08] bg-[#0a0a0a] p-5">
            <h2 className="text-[14px] font-semibold text-white">Reject {selected.size} entr{selected.size === 1 ? 'y' : 'ies'}</h2>
            <p className="mt-1 text-[12px] text-neutral-500">
              Every selected author will see this reason and can edit and resubmit their entry.
            </p>
            <label htmlFor="bulk-reject-reason" className="block mt-3 text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-1.5">Reason (required)</label>
            <textarea
              id="bulk-reject-reason"
              value={bulkReason}
              onChange={e => setBulkReason(e.target.value)}
              rows={3}
              maxLength={2000}
              className="w-full px-3 py-2 rounded-lg bg-[#050505] border border-white/[0.08] text-[13px] text-white focus:outline-none focus:border-white/25 resize-none"
              placeholder="Why are these being rejected?"
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => void bulkReject()}
                disabled={!bulkReason.trim() || bulkBusy}
                className="flex-1 px-4 py-2 rounded-lg bg-red-400 text-black text-[13px] font-semibold hover:bg-red-300 disabled:opacity-40 transition-colors"
              >
                {bulkBusy ? 'Rejecting…' : `Reject ${selected.size} entr${selected.size === 1 ? 'y' : 'ies'}`}
              </button>
              <button
                onClick={() => setBulkRejecting(false)}
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
