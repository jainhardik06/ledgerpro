"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { formatDuration, type TimerSession } from '@/lib/agency/types/time';

/**
 * Timer review drawer (Module 7, §8 Path B: Stop → Review → Save).
 *
 * Stopping halts the session server-side; this form completes the review.
 * Billable is explicit (§17); duration defaults to the real elapsed time and
 * can only adjust DOWN (Rule 6 — the server caps it too, never inflates).
 */
interface Props {
  isOpen: boolean;
  onClose: () => void;
  session: TimerSession | null;
  elapsedMinutes: number;
  projectName?: string;
  workItemName?: string;
  onSaved: (entryCreated: boolean) => void;
}

const inputCls = 'w-full px-3 py-2 rounded-lg bg-[#0a0a0a] border border-white/[0.08] text-[13px] text-white focus:outline-none focus:border-white/25';
const labelCls = 'block text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-1.5';

export function TimerReviewDrawer({ isOpen, onClose, session, elapsedMinutes, projectName, workItemName, onSaved }: Props) {
  const [billable, setBillable] = useState(true);
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setBillable(true);
    setDuration(elapsedMinutes > 0 ? String(elapsedMinutes) : '');
    setNotes('');
    setError(null);
  }, [isOpen, elapsedMinutes]);

  const save = useCallback(async (withReview: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const payload = withReview
        ? {
            review: {
              billable,
              ...(Number(duration) > 0 && { durationMinutes: Math.round(Number(duration)) }),
              ...(notes.trim() !== '' && { notes: notes.trim() }),
            },
          }
        : {};
      const res = await fetch('/api/agency/timer/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'That didn\'t work. Try again.');
        return;
      }
      onSaved(withReview);
    } catch {
      setError('That didn\'t work. Try again.');
    } finally {
      setSaving(false);
    }
  }, [billable, duration, notes, onSaved]);

  const durationNum = Number(duration);
  const invalid = Number.isFinite(durationNum) === false || durationNum <= 0;

  if (!isOpen || !session) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label="Review timer entry">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-[#0a0a0a] border-l border-white/[0.08] flex flex-col">
        <div className="flex items-center justify-between px-5 h-14 border-b border-white/[0.06] shrink-0">
          <h2 className="text-[14px] font-semibold text-white">Review your timer</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <p className="text-[12px] text-neutral-500">{projectName || 'Project'}{workItemName ? ` · ${workItemName}` : ''}</p>
            <p className="mt-1 text-[20px] font-semibold text-white tabular-nums">{formatDuration(elapsedMinutes)}</p>
            <p className="text-[11.5px] text-neutral-600">tracked from timestamps — the browser closing never changed it</p>
          </div>

          <div>
            <span className={labelCls}>Billable?</span>
            <div className="flex gap-2" role="radiogroup" aria-label="Billable">
              {[true, false].map(v => (
                <button
                  key={String(v)}
                  type="button"
                  role="radio"
                  aria-checked={billable === v}
                  onClick={() => setBillable(v)}
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
            <label htmlFor="tr-duration" className={labelCls}>Duration (minutes) <span className="normal-case tracking-normal text-neutral-600">— adjust down only</span></label>
            <input
              id="tr-duration"
              type="number"
              min={1}
              max={Math.max(elapsedMinutes, 1)}
              value={duration}
              onChange={e => setDuration(e.target.value)}
              className={inputCls}
              aria-describedby="tr-duration-help"
            />
            <p id="tr-duration-help" className="mt-1 text-[11.5px] text-neutral-600">
              {invalid ? 'Enter the honest duration (at least 1 minute).' : formatDuration(Math.round(durationNum))}
            </p>
          </div>

          <div>
            <label htmlFor="tr-notes" className={labelCls}>Notes</label>
            <textarea id="tr-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3} maxLength={2000} className={`${inputCls} resize-none`} placeholder="What was worked on?" />
          </div>

          {error && <p role="alert" className="text-[12.5px] text-red-400">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-white/[0.06] shrink-0 space-y-2">
          <button
            onClick={() => void save(true)}
            disabled={saving || invalid}
            className="w-full px-4 py-2.5 rounded-lg bg-white text-black text-[13px] font-semibold hover:bg-neutral-200 disabled:opacity-40 transition-colors"
          >
            {saving ? 'Saving…' : 'Save time entry'}
          </button>
          <button
            onClick={() => void save(false)}
            disabled={saving}
            className="w-full px-4 py-2 rounded-lg border border-white/[0.08] text-[12.5px] text-neutral-400 hover:text-white hover:bg-white/[0.04] disabled:opacity-40 transition-colors"
          >
            Stop without saving (review later)
          </button>
        </div>
      </div>
    </div>
  );
}
