"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarRange, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';
import { tenantHasCapability } from '@/lib/agency/types/vertical';
import { formatDuration, type TimeEntry } from '@/lib/agency/types/time';

/**
 * Weekly timesheet (Module 7, §26) — a VIEW over individual entries.
 *
 * The entry model stays one-record-per-work (§26); this page groups the
 * caller's week into the familiar day rows: Day | Project | Work Item |
 * Duration | Billable | Status. Day totals and a week total; week navigation
 * with the Monday-anchored arrows.
 */
function weekStartOf(date: Date): Date {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;  // Monday = 0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'text-neutral-400',
  SUBMITTED: 'text-sky-300',
  APPROVED: 'text-emerald-300',
  REJECTED: 'text-red-300',
};

export default function TimesheetPage() {
  const { tenant, loading: sessionLoading } = useDashboardContext();
  const allowed = tenantHasCapability(tenant, 'AGENCY_DASHBOARD');

  const [weekStart, setWeekStart] = useState(() => weekStartOf(new Date()));
  const [rows, setRows] = useState<TimeEntry[]>([]);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const from = toYMD(weekStart);
  const to = toYMD(new Date(weekStart.getTime() + 6 * 86400000));

  const load = useCallback(() => {
    if (sessionLoading || !allowed) return;
    setLoading(true);
    fetch(`/api/agency/time?dateFrom=${from}&dateTo=${to}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => {
        setRows(body.timeEntries || []);
        setProjectNames(body.projectNames || {});
        setError(null);
      })
      .catch(() => setError('We couldn\'t load your timesheet. Try again.'))
      .finally(() => setLoading(false));
  }, [sessionLoading, allowed, from, to]);

  useEffect(() => {
    if (!sessionLoading && allowed) load();
  }, [load, sessionLoading, allowed]);

  // Group by day, Monday-first, with honest empty days.
  const byDay = useMemo(() => {
    const groups: TimeEntry[][] = Array.from({ length: 7 }, () => []);
    for (const r of rows) {
      const idx = Math.floor((new Date(`${r.date}T00:00:00`).getTime() - weekStart.getTime()) / 86400000);
      if (idx >= 0 && idx < 7) groups[idx].push(r);
    }
    return groups;
  }, [rows, weekStart]);

  const weekTotal = useMemo(() => rows.reduce((s, r) => s + r.durationMinutes, 0), [rows]);

  if (!sessionLoading && !allowed) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <Clock className="w-8 h-8 mx-auto text-neutral-700" aria-hidden />
        <h1 className="mt-4 text-[16px] font-semibold text-white">Agency workspace required</h1>
        <Link href="/dashboard" className="mt-4 inline-block text-[13px] text-neutral-300 underline underline-offset-4">Go to the standard dashboard</Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[16px] font-semibold text-white tracking-tight">Timesheet</h1>
          <p className="text-[12.5px] text-neutral-500">Your week at a glance — a view over individual entries, the record itself never collapses</p>
        </div>
        <Link href="/dashboard/agency/time" className="text-[12.5px] text-neutral-400 underline underline-offset-4 hover:text-white transition-colors">Back to My Time</Link>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setWeekStart(d => new Date(d.getTime() - 7 * 86400000))}
          className="p-2 rounded-lg border border-white/[0.08] text-neutral-400 hover:text-white hover:bg-white/[0.04] transition-colors"
          aria-label="Previous week"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-[13px] text-neutral-300 tabular-nums">
          {new Date(`${from}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          {' – '}
          {new Date(`${to}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          <span className="ml-3 text-neutral-500">{formatDuration(weekTotal)}</span>
        </div>
        <button
          onClick={() => setWeekStart(d => new Date(d.getTime() + 7 * 86400000))}
          className="p-2 rounded-lg border border-white/[0.08] text-neutral-400 hover:text-white hover:bg-white/[0.04] transition-colors"
          aria-label="Next week"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {loading && (
        <div className="space-y-2" aria-busy="true" aria-label="Loading timesheet">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-white/[0.03] animate-pulse" />)}
        </div>
      )}

      {error && !loading && (
        <div role="alert" className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <p className="text-[13px] text-neutral-200">{error}</p>
          <button onClick={load} className="mt-2 text-[12.5px] text-neutral-400 underline underline-offset-4">Retry</button>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-2">
          {byDay.map((dayRows, i) => {
            const dayDate = new Date(weekStart.getTime() + i * 86400000);
            const dayTotal = dayRows.reduce((s, r) => s + r.durationMinutes, 0);
            return (
              <section key={i} className="rounded-xl border border-white/[0.06] overflow-hidden overflow-x-auto" aria-label={DAY_LABELS[i]}>
                <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.02] border-b border-white/[0.06]">
                  <h2 className="text-[12.5px] font-semibold text-white flex items-center gap-2">
                    <CalendarRange className="w-3.5 h-3.5 text-neutral-500" aria-hidden />
                    {DAY_LABELS[i]}
                    <span className="font-normal text-neutral-500">{dayDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                  </h2>
                  <span className="text-[12px] text-neutral-400 tabular-nums">{dayTotal > 0 ? formatDuration(dayTotal) : '—'}</span>
                </div>
                {dayRows.length === 0 ? (
                  <p className="px-4 py-3 text-[12px] text-neutral-600">No time logged</p>
                ) : (
                  <table className="w-full text-[12.5px]">
                    <tbody>
                      {dayRows.map(r => (
                        <tr key={r.id} className="border-b border-white/[0.03] last:border-0">
                          <td className="px-4 py-2.5 text-white">{projectNames[r.projectId] || 'Project'}</td>
                          <td className="px-4 py-2.5 text-neutral-500">{r.workItemId ? 'Work item' : 'Internal'}</td>
                          <td className="px-4 py-2.5 text-neutral-300 tabular-nums whitespace-nowrap">{formatDuration(r.durationMinutes)}</td>
                          <td className="px-4 py-2.5">{r.billable ? <span className="text-emerald-300">Yes</span> : <span className="text-neutral-600">No</span>}</td>
                          <td className={`px-4 py-2.5 font-medium ${STATUS_STYLE[r.approvalStatus] ?? 'text-neutral-400'}`}>{r.approvalStatus}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
