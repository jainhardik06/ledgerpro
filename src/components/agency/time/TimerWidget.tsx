"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { Play, Square, Trash2, Timer as TimerIcon } from 'lucide-react';
import { formatDuration, type TimerSession } from '@/lib/agency/types/time';
import { TimerReviewDrawer } from './TimerReviewDrawer';
import { Select } from '@/components/ui/Select';
import { confirmModal } from '@/components/ui/Dialog';

/**
 * Timer widget (Module 7, §8 Path B / §9–§13).
 *
 * The server owns the truth (§10): this widget renders whatever
 * /api/agency/timer/current reports. The ticking display recomputes from
 * startedAt every second — visual only; the final duration always derives
 * from server timestamps (§12). One active timer per user (§11): a second
 * start is refused with a 409 and shown here as the stop/review prompt.
 */
interface ProjectOption { id: string; name: string; }
interface WorkItemOption { id: string; name: string; }

interface Props {
  onEntrySaved: () => void;
}

function liveElapsedSeconds(startedAt: string | Date): number {
  return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
}

export function TimerWidget({ onEntrySaved }: Props) {
  const [session, setSession] = useState<TimerSession | null>(null);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [projectName, setProjectName] = useState<string | undefined>();
  const [workItemName, setWorkItemName] = useState<string | undefined>();
  const [tick, setTick] = useState(0);

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [workItems, setWorkItems] = useState<WorkItemOption[]>([]);
  const [startProjectId, setStartProjectId] = useState('');
  const [startWorkItemId, setStartWorkItemId] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const loadCurrent = useCallback(() => {
    fetch('/api/agency/timer/current')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => {
        setSession(body.timerSession || null);
        setElapsedMinutes(body.elapsedMinutes || 0);
        setProjectName(body.projectName);
        setWorkItemName(body.workItemName);
      })
      .catch(() => {/* the widget fails silent — the list below shows the truth */});
  }, []);

  useEffect(() => { loadCurrent(); }, [loadCurrent]);

  // §74 — the Command Palette's "Start Timer" deep-links here: scroll the
  // widget into view and focus the start form; a RUNNING session instead
  // surfaces its stop/review drawer (one active timer per user, §11).
  useEffect(() => {
    const focusTimer = () => {
      document.getElementById('agency-timer')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (session) {
        setElapsedMinutes(Math.max(1, Math.floor(liveElapsedSeconds(session.startedAt) / 60)));
        setReviewOpen(true);
        return;
      }
      document.getElementById('timer-project')?.focus();
    };
    window.addEventListener('focus-agency-timer', focusTimer);
    return () => window.removeEventListener('focus-agency-timer', focusTimer);
  }, [session]);

  // §12 — the visual second ticker derives from startedAt, never accumulates.
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [session, tick === undefined]);

  // The start form needs its project options BEFORE any session exists —
  // fetching only while running left the first start with an empty select.
  useEffect(() => {
    fetch('/api/agency/projects?limit=100')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => setProjects((body.projects || []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))))
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (!startProjectId) { setWorkItems([]); return; }
    fetch(`/api/agency/projects/${startProjectId}/work-items`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => setWorkItems((body.workItems || []).map((w: { id: string; name: string }) => ({ id: w.id, name: w.name }))))
      .catch(() => setWorkItems([]));
  }, [startProjectId]);

  const start = useCallback(async () => {
    if (!startProjectId) { setError('Pick a project to track against.'); return; }
    setStarting(true);
    setError(null);
    try {
      const res = await fetch('/api/agency/timer/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: startProjectId, ...(startWorkItemId && { workItemId: startWorkItemId }) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // §11 — one active timer: the 409 routes to stop/review.
        if (body.code === 'TIMER_ALREADY_RUNNING') {
          setError('You already have a running timer — stop and review it first.');
          loadCurrent();
        } else {
          setError(body.error || 'That didn\'t work. Try again.');
        }
        return;
      }
      setStartProjectId('');
      setStartWorkItemId('');
      loadCurrent();
    } catch {
      setError('That didn\'t work. Try again.');
    } finally {
      setStarting(false);
    }
  }, [startProjectId, startWorkItemId, loadCurrent]);

  const discard = useCallback(async () => {
    const ok = await confirmModal({
      title: 'Discard Timer',
      message: 'Discard the running timer? No time entry will be created.',
      confirmText: 'Discard Timer',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await fetch('/api/agency/timer/discard', { method: 'POST' });
    } catch { /* the reload tells the truth */ }
    loadCurrent();
  }, [loadCurrent]);

  const runningSeconds = session ? liveElapsedSeconds(session.startedAt) : 0;
  const displayMinutes = Math.floor(runningSeconds / 60);
  const displaySeconds = runningSeconds % 60;

  // flex-1 lives on the Select's wrapper (see Select's wrapperClassName note) —
  // the wrapper, not the control, is the flex child of the row below.
  const selectCls = 'px-3 py-2 rounded-lg bg-[#0a0a0a] border border-white/[0.08] text-[13px] text-white focus:outline-none focus:border-white/25';
  const selectWrapCls = 'flex-1 min-w-0';

  return (
    <section
      id="agency-timer"
      aria-label="Timer"
      className={`rounded-xl border p-4 transition-colors ${session ? 'border-emerald-400/25 bg-emerald-400/[0.04]' : 'border-white/[0.06] bg-white/[0.02]'}`}
    >
      <div className="flex items-center gap-2.5">
        <span className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${session ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/[0.05] text-neutral-400'}`}>
          <TimerIcon className="w-4 h-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[13.5px] font-semibold text-white">Timer</h2>
          <p className="text-[11.5px] text-neutral-500 truncate">
            {session
              ? `${projectName || 'Project'}${workItemName ? ` · ${workItemName}` : ''}`
              : 'Track live work — the entry is created when you stop and review'}
          </p>
        </div>
        {session && (
          <span className="text-[18px] font-semibold text-emerald-300 tabular-nums" role="timer" aria-label="Elapsed time">
            {formatDuration(displayMinutes)}
            {` ${String(displaySeconds).padStart(2, '0')}s`}
          </span>
        )}
      </div>

      {session ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => { setElapsedMinutes(Math.max(1, displayMinutes)); setReviewOpen(true); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 transition-colors"
          >
            <Square className="w-3.5 h-3.5" aria-hidden /> Stop & review
          </button>
          <button
            onClick={() => void discard()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-white/[0.08] text-[12.5px] text-neutral-400 hover:text-red-300 hover:border-red-400/30 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden /> Discard
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <Select id="timer-project" value={startProjectId} onChange={e => { setStartProjectId(e.target.value); setStartWorkItemId(''); }} aria-label="Project to track" className={selectCls} wrapperClassName={selectWrapCls}>
              <option value="">Select a project…</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <Select value={startWorkItemId} onChange={e => setStartWorkItemId(e.target.value)} disabled={!startProjectId} aria-label="Work item (optional)" className={selectCls} wrapperClassName={selectWrapCls}>
              <option value="">No specific work item</option>
              {workItems.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          </div>
          <button
            onClick={() => void start()}
            disabled={starting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-400 text-black text-[12.5px] font-semibold hover:bg-emerald-300 disabled:opacity-40 transition-colors"
          >
            <Play className="w-3.5 h-3.5" aria-hidden /> {starting ? 'Starting…' : 'Start timer'}
          </button>
        </div>
      )}

      {error && <p role="alert" className="mt-2 text-[12px] text-red-400">{error}</p>}

      {/* §8 Path B: Stop → Review → Save (the drawer creates the entry). */}
      {reviewOpen && session && (
        <TimerReviewDrawer
          isOpen={reviewOpen}
          onClose={() => setReviewOpen(false)}
          session={session}
          elapsedMinutes={Math.max(elapsedMinutes, 1)}
          projectName={projectName}
          workItemName={workItemName}
          onSaved={() => { setReviewOpen(false); loadCurrent(); onEntrySaved(); }}
        />
      )}
    </section>
  );
}
