"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { formatDuration, minutesFromHoursInput, type TimeEntry } from '@/lib/agency/types/time';
import { todayInTimezone } from '@/lib/agency/types/dates';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { Req, Opt } from '@/components/ui/Req';
import { cn } from '@/lib/utils';

/**
 * Manual time entry drawer (Module 7, §8 Path A / §15 / §28).
 *
 * Create mode: Project → Work Item → Date → Duration → Billable? → Notes →
 * Save. Historical dates allowed (§13). Duration is entered in minutes (or
 * decimal hours — converted at the boundary, §14).
 *
 * Edit mode: the §28 lifecycle is server-enforced (full pre-approval /
 * notes-only after approval / locked once invoiced); this drawer simply
 * renders the fields and lets the domain say no.
 */
interface ProjectOption { id: string; name: string; }
interface WorkItemOption { id: string; name: string; }

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Present → edit mode (§28); absent → create mode (§8 Path A). */
  editing?: TimeEntry | null;
}

const inputCls = 'w-full px-3 py-2 rounded-lg bg-[#0a0a0a] border border-white/[0.08] text-[13px] text-white focus:outline-none focus:border-white/25';
const labelCls = 'block text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-1.5';

export function TimeEntryDrawer({ isOpen, onClose, onSaved, editing }: Props) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [workItems, setWorkItems] = useState<WorkItemOption[]>([]);
  const [projectId, setProjectId] = useState('');
  const [workItemId, setWorkItemId] = useState('');
  const [date, setDate] = useState(todayInTimezone());
  const [durationInput, setDurationInput] = useState('');
  const [durationIsHours, setDurationIsHours] = useState(false);
  const [billable, setBillable] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!editing;
  const locked = editing?.billingStatus === 'INVOICED' || editing?.approvalStatus === 'SUBMITTED';

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/agency/projects?limit=100')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => setProjects((body.projects || []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))))
      .catch(() => setProjects([]));
    // Reset the form per open (§8 Path A flow).
    if (editing) {
      setProjectId(editing.projectId);
      setWorkItemId(editing.workItemId ?? '');
      setDate(editing.date);
      setDurationInput(String(editing.durationMinutes));
      setDurationIsHours(false);
      setBillable(editing.billable);
      setNotes(editing.notes ?? '');
    } else {
      setProjectId('');
      setWorkItemId('');
      setDate(todayInTimezone());
      setDurationInput('');
      setDurationIsHours(false);
      setBillable(true);
      setNotes('');
    }
    setError(null);
  }, [isOpen, editing]);

  // Work items follow the selected project (§15).
  useEffect(() => {
    if (!projectId) { setWorkItems([]); return; }
    fetch(`/api/agency/projects/${projectId}/work-items`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => setWorkItems((body.workItems || []).map((w: { id: string; name: string }) => ({ id: w.id, name: w.name }))))
      .catch(() => setWorkItems([]));
  }, [projectId]);

  const durationMinutes = useMemo(() => {
    const v = Number(durationInput);
    if (!Number.isFinite(v) || durationInput.trim() === '') return null;
    return durationIsHours ? minutesFromHoursInput(v) : Math.round(v);
  }, [durationInput, durationIsHours]);

  const save = useCallback(async () => {
    if (!projectId || durationMinutes === null || durationMinutes <= 0) {
      setError('Pick a project and enter a duration.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        projectId,
        workItemId: workItemId || '',   // '' = administrative/internal time (§16)
        date,
        durationMinutes,
        billable,
        ...(notes.trim() !== '' && { notes: notes.trim() }),
      };
      const res = await fetch(isEdit ? `/api/agency/time/${editing!.id}` : '/api/agency/time', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'That didn\'t work. Try again.');
        return;
      }
      onSaved();
    } catch {
      setError('That didn\'t work. Try again.');
    } finally {
      setSaving(false);
    }
  }, [projectId, durationMinutes, workItemId, date, billable, notes, isEdit, editing, onSaved]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label={isEdit ? 'Edit time entry' : 'Log time'}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-[#0a0a0a] border-l border-white/[0.08] flex flex-col">
        <div className="flex items-center justify-between px-5 h-14 border-b border-white/[0.06] shrink-0">
          <h2 className="text-[14px] font-semibold text-white">{isEdit ? 'Edit Time Entry' : 'Log Time'}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {locked && (
            <p className="text-[12px] text-amber-400/90 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2">
              {editing?.billingStatus === 'INVOICED'
                ? 'This entry has been invoiced and is financially locked against modifications.'
                : 'This entry is awaiting review — only notes can be saved here.'}
            </p>
          )}

          <div>
            <label htmlFor="te-project" className={labelCls}>Project <Req satisfied={Boolean(projectId)} /></label>
            <Select
              id="te-project"
              value={projectId}
              onChange={e => { setProjectId(e.target.value); setWorkItemId(''); setError(null); }}
              disabled={locked}
              className={cn(inputCls, error && !projectId && 'border-rose-500/50')}
            >
              <option value="">Select a project…</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>

          <div>
            <label htmlFor="te-workitem" className={labelCls}>Work Item <Opt /></label>
            <Select id="te-workitem" value={workItemId} onChange={e => setWorkItemId(e.target.value)} disabled={locked || !projectId} className={inputCls}>
              <option value="">No specific work item</option>
              {workItems.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="te-date" className={labelCls}>Date <Req satisfied={Boolean(date)} /></label>
              <DatePicker id="te-date" value={date} max={todayInTimezone()} onChange={e => setDate(e.target.value)} disabled={locked} />
            </div>
            <div>
              <label htmlFor="te-duration" className={labelCls}>Duration <Req satisfied={Boolean(durationMinutes && durationMinutes > 0)} /></label>
              <div className="flex gap-2">
                <input
                  id="te-duration"
                  type="number"
                  min={1}
                  step={durationIsHours ? 0.25 : 1}
                  value={durationInput}
                  onChange={e => { setDurationInput(e.target.value); setError(null); }}
                  disabled={locked}
                  className={cn(inputCls, error && (!durationInput.trim() || Number(durationInput) <= 0) && 'border-rose-500/50')}
                  aria-describedby="te-duration-help"
                />
                <button
                  type="button"
                  onClick={() => setDurationIsHours(h => !h)}
                  disabled={locked}
                  className="px-2.5 rounded-lg border border-white/[0.08] text-[12px] text-neutral-400 hover:text-white hover:bg-white/[0.04] transition-colors shrink-0"
                  aria-label={durationIsHours ? 'Switch to minutes' : 'Switch to hours'}
                >
                  {durationIsHours ? 'hrs' : 'min'}
                </button>
              </div>
            </div>
          </div>
          <p id="te-duration-help" className="text-[11.5px] text-neutral-600">
            {durationMinutes && durationMinutes > 0 ? formatDuration(durationMinutes) : 'Integer minutes are stored — never decimal hours.'}
          </p>

          <div>
            <span className={labelCls}>Billable? <Req satisfied={typeof billable === 'boolean'} /></span>
            <div className="flex gap-2" role="radiogroup" aria-label="Billable">
              {[true, false].map(v => (
                <button
                  key={String(v)}
                  type="button"
                  role="radio"
                  aria-checked={billable === v}
                  onClick={() => setBillable(v)}
                  disabled={locked}
                  className={`flex-1 px-3 py-2 rounded-lg border text-[13px] transition-colors ${billable === v
                    ? v ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300' : 'border-white/20 bg-white/[0.06] text-white'
                    : 'border-white/[0.08] text-neutral-500 hover:text-neutral-300'}`}
                >
                  {v ? 'Billable' : 'Non-billable'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="te-notes" className={labelCls}>Notes <Opt /></label>
            <textarea id="te-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3} maxLength={2000} className={`${inputCls} resize-none`} placeholder="What was worked on?" />
          </div>

          {error && <p role="alert" className="text-[12.5px] text-red-400">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-white/[0.06] shrink-0">
          <button
            onClick={() => void save()}
            disabled={saving || locked}
            className="w-full px-4 py-2.5 rounded-lg bg-white text-black text-[13px] font-semibold hover:bg-neutral-200 disabled:opacity-40 transition-colors"
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save entry'}
          </button>
        </div>
      </div>
    </div>
  );
}
