"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Clock, Plus, Pencil, Send, ClipboardCheck, CalendarRange } from 'lucide-react';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';
import { tenantHasCapability } from '@/lib/agency/types/vertical';
import { formatDuration, type TimeEntry, type TimeApprovalStatus } from '@/lib/agency/types/time';
import { TimerWidget } from '@/components/agency/time/TimerWidget';
import { TimeEntryDrawer } from '@/components/agency/time/TimeEntryDrawer';
import { alertModal } from '@/components/ui/Dialog';

/**
 * My Time (Module 7, §25) — the primary time surface.
 *
 * Today / This Week / History views over the caller's own entries (§33:
 * the server forces the scope for non-admins). Row actions follow the
 * lifecycle: DRAFT/REJECTED are editable and submittable; SUBMITTED await
 * review; APPROVED show their economics; INVOICED are locked (§22).
 *
 * §24: an entry whose rates never resolved shows "Rate setup required" —
 * tracked, but financially unrecognized. Never a silent zero.
 */
type TimeRow = TimeEntry;

const STATUS_STYLE: Record<TimeApprovalStatus, string> = {
  DRAFT: 'text-neutral-400 bg-white/[0.05]',
  SUBMITTED: 'text-sky-300 bg-sky-400/10',
  APPROVED: 'text-emerald-300 bg-emerald-400/10',
  REJECTED: 'text-red-300 bg-red-400/10',
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

export default function MyTimePage() {
  const { tenant, user, loading: sessionLoading } = useDashboardContext();
  const allowed = tenantHasCapability(tenant, 'AGENCY_DASHBOARD');
  const isAdmin = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN';
  const userId = user?.id;

  const [rows, setRows] = useState<TimeRow[]>([]);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'TODAY' | 'WEEK' | 'HISTORY'>('TODAY');
  const [scope, setScope] = useState<'MINE' | 'ALL'>('MINE');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<TimeRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (sessionLoading || !allowed) return;
    setLoading(true);
    const p = new URLSearchParams();
    const today = todayStr();
    if (view === 'TODAY') { p.set('dateFrom', today); p.set('dateTo', today); }
    if (view === 'WEEK') { p.set('dateFrom', weekStart(new Date())); p.set('dateTo', today); }
    // §33 — the admin scope toggle: "Just me" narrows to the caller's rows
    // (the API accepts userId only from admins); "Everyone" is unfiltered.
    // (Non-admins are forced server-side; their toggle stays hidden.)
    if (scope === 'MINE' && isAdmin && userId) p.set('userId', userId);
    fetch(`/api/agency/time?${p.toString()}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => {
        setRows(body.timeEntries || []);
        setProjectNames(body.projectNames || {});
        setError(null);
      })
      .catch(() => setError('We couldn\'t load your time. Try again.'))
      .finally(() => setLoading(false));
  }, [sessionLoading, allowed, view, scope, isAdmin, userId]);

  useEffect(() => {
    if (!sessionLoading && allowed) load();
  }, [load, sessionLoading, allowed]);

  // The Command Palette's "Log Time" lands here (Module 7 §27).
  useEffect(() => {
    function openNew() { setEditing(null); setDrawerOpen(true); }
    window.addEventListener('open-new-time-entry', openNew);
    return () => window.removeEventListener('open-new-time-entry', openNew);
  }, []);

  // §27 — bulk submit of the caller's selected DRAFT/REJECTED entries.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => { setSelected(new Set()); }, [view, scope]);

  const submittable = useMemo(
    () => rows.filter(r => (r.approvalStatus === 'DRAFT' || r.approvalStatus === 'REJECTED') && r.userId === user?.id),
    [rows, user?.id]
  );
  const allSelected = submittable.length > 0 && submittable.every(r => selected.has(r.id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(submittable.map(r => r.id)));
  }

  async function submitSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusyId('bulk');
    try {
      for (const id of ids) {
        await fetch(`/api/agency/time/${id}/submit`, { method: 'POST' });
      }
      load();
    } finally {
      setBusyId(null);
      setSelected(new Set());
    }
  }

  async function submitOne(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/agency/time/${id}/submit`, { method: 'POST' });
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

  const totalMinutes = useMemo(() => rows.reduce((sum, r) => sum + r.durationMinutes, 0), [rows]);

  if (!sessionLoading && !allowed) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <Clock className="w-8 h-8 mx-auto text-neutral-700" aria-hidden />
        <h1 className="mt-4 text-[16px] font-semibold text-white">Agency workspace required</h1>
        <p className="mt-2 text-[13px] text-neutral-500">Time tracking is an Agency workspace feature.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-[13px] text-neutral-300 underline underline-offset-4">Go to the standard dashboard</Link>
      </div>
    );
  }

  const tabCls = (v: typeof view) => `px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors ${view === v ? 'bg-white/[0.08] text-white' : 'text-neutral-500 hover:text-neutral-300'}`;

  return (
    <div className="p-4 sm:p-6 space-y-4 w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[16px] font-semibold text-white tracking-tight">My Time</h1>
          <p className="text-[12.5px] text-neutral-500">Today&apos;s work, this week&apos;s record — who worked, on what, for how long</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/agency/time/timesheet"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-white/[0.08] text-[12.5px] text-neutral-300 hover:bg-white/[0.04] transition-colors"
          >
            <CalendarRange className="w-3.5 h-3.5" aria-hidden /> Timesheet
          </Link>
          {isAdmin && (
            <Link
              href="/dashboard/agency/time/approvals"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-white/[0.08] text-[12.5px] text-neutral-300 hover:bg-white/[0.04] transition-colors"
            >
              <ClipboardCheck className="w-3.5 h-3.5" aria-hidden /> Approvals
            </Link>
          )}
          <button
            onClick={() => { setEditing(null); setDrawerOpen(true); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden /> Log time
          </button>
        </div>
      </div>

      <TimerWidget onEntrySaved={load} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1" role="tablist" aria-label="Time views">
          <button role="tab" aria-selected={view === 'TODAY'} onClick={() => setView('TODAY')} className={tabCls('TODAY')}>Today</button>
          <button role="tab" aria-selected={view === 'WEEK'} onClick={() => setView('WEEK')} className={tabCls('WEEK')}>This week</button>
          <button role="tab" aria-selected={view === 'HISTORY'} onClick={() => setView('HISTORY')} className={tabCls('HISTORY')}>History</button>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <div className="flex gap-1">
              <button onClick={() => setScope(s => (s === 'MINE' ? 'ALL' : 'MINE'))} className={`px-2.5 py-1 rounded text-[11.5px] font-medium transition-colors ${scope === 'ALL' ? 'bg-white/[0.08] text-white' : 'text-neutral-500 hover:text-neutral-300'}`}>
                {scope === 'ALL' ? 'Everyone' : 'Just me'}
              </button>
            </div>
          )}
          <span className="text-[12px] text-neutral-500 tabular-nums">{formatDuration(totalMinutes)} total</span>
        </div>
      </div>

      {loading && (
        <div className="space-y-2" aria-busy="true" aria-label="Loading time entries">
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
          <Clock className="w-8 h-8 mx-auto text-neutral-700" aria-hidden />
          <h2 className="mt-3 text-[14px] font-semibold text-white">No time here yet</h2>
          <p className="mt-1.5 text-[12.5px] text-neutral-500 max-w-sm mx-auto">
            Start the timer for live work, or log time manually for anything you did earlier.
          </p>
          <button
            onClick={() => { setEditing(null); setDrawerOpen(true); }}
            className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden /> Log your first entry
          </button>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] overflow-hidden overflow-x-auto">
          <table className="w-full text-[13px]" aria-label="Time entries">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                {(submittable.length > 0) && (
                  <th scope="col" className="px-4 py-3 w-8">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all submittable entries" />
                  </th>
                )}
                <th scope="col" className="px-4 py-3 font-medium">Date</th>
                <th scope="col" className="px-4 py-3 font-medium">Project</th>
                <th scope="col" className="px-4 py-3 font-medium">Work Item</th>
                <th scope="col" className="px-4 py-3 font-medium">Duration</th>
                <th scope="col" className="px-4 py-3 font-medium">Billable</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const editable = (r.approvalStatus === 'DRAFT' || r.approvalStatus === 'REJECTED') && (isAdmin || r.userId === user?.id);
                return (
                  <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors align-top">
                    {submittable.length > 0 && (
                      <td className="px-4 py-3">
                        {editable && (
                          <input
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onChange={() => setSelected(s => { const next = new Set(s); if (next.has(r.id)) { next.delete(r.id); } else { next.add(r.id); } return next; })}
                            aria-label={`Select entry on ${r.date}`}
                          />
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-neutral-400 whitespace-nowrap">{formatDate(r.date)}</td>
                    <td className="px-4 py-3 text-white">{projectNames[r.projectId] || 'Project'}</td>
                    <td className="px-4 py-3 text-neutral-400">{r.workItemId ? (r.notes || 'Work item') : <span className="text-neutral-600">Internal</span>}</td>
                    <td className="px-4 py-3 text-white tabular-nums whitespace-nowrap">{formatDuration(r.durationMinutes)}</td>
                    <td className="px-4 py-3">
                      {r.billable
                        ? <span className="text-emerald-300">{r.calculatedBillableAmount ? `₹${r.calculatedBillableAmount.amount.toLocaleString('en-IN')}` : 'Yes'}</span>
                        : <span className="text-neutral-600">No</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_STYLE[r.approvalStatus]}`}>{r.approvalStatus}</span>
                      {r.billingStatus === 'INVOICED' && <span className="ml-1 inline-block px-2 py-0.5 rounded text-[11px] font-medium text-violet-300 bg-violet-400/10">INVOICED</span>}
                      {r.financialStatus === 'RATE_CONFIGURATION_REQUIRED' && (
                        <span className="ml-1 inline-block px-2 py-0.5 rounded text-[11px] font-medium text-amber-300 bg-amber-400/10" title="Tracked, but rates are not configured — no financial recognition yet (§24)">
                          Rate setup required
                        </span>
                      )}
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

          {selected.size > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-white/[0.06] bg-white/[0.02]">
              <span className="text-[12px] text-neutral-400">{selected.size} selected</span>
              <button
                onClick={() => void submitSelected()}
                disabled={busyId === 'bulk'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white text-black text-[12px] font-semibold hover:bg-neutral-200 disabled:opacity-40 transition-colors"
              >
                <Send className="w-3.5 h-3.5" aria-hidden /> Submit selected
              </button>
            </div>
          )}
        </div>
      )}

      <TimeEntryDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => { setDrawerOpen(false); setEditing(null); load(); }}
        editing={editing}
      />
    </div>
  );
}
