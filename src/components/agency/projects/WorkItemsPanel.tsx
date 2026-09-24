"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, Plus, Search } from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import type { WorkItem, WorkItemStatus } from '@/lib/agency/types/project';
import { WORK_ITEM_STATUSES, canTransitionWorkItemStatus } from '@/lib/agency/types/project';
import { Select } from '@/components/ui/Select';
import { SearchBar } from '@/components/ui/SearchBar';
import { Req, Opt } from '@/components/ui/Req';
import { confirmModal } from '@/components/ui/Dialog';

/**
 * Agency Work panel (Module 4, §19–§25) — the "Work" tab of the project
 * workspace.
 *
 * List: Work Item | Assignee | Estimate | Status | Updated (§20), cards on
 * mobile (§21). Filtering: All / My Work / Not Started / In Progress /
 * Done / Unassigned, search across name/description/assignee (§24). Sorting:
 * manual order (sortOrder) by default, then updated/created/estimate/status
 * (§25). Creation: a drawer with Name*, Description, Assign To, Estimated
 * Time and Status, defaulting to NOT_STARTED (§22).
 *
 * Minutes (§9): estimates are stored in minutes and rendered "1h 30m" —
 * never decimal hours.
 */

const inputCls = 'px-3 py-1.5 rounded-lg bg-[#0a0a0a] border border-white/[0.06] text-[12.5px] text-white placeholder:text-neutral-600 focus:outline-none focus:border-white/20';

const STATUS_STYLE: Record<WorkItemStatus, string> = {
  NOT_STARTED: 'text-neutral-400',
  IN_PROGRESS: 'text-amber-400',
  DONE: 'text-emerald-400',
  ARCHIVED: 'text-neutral-600',
};

/** §9 — minutes render as "1h 30m"; never a decimal. */
export function formatMinutes(minutes: number | undefined): string {
  if (minutes === undefined) return '—';
  if (minutes === 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatRelative(d: string | Date | undefined): string {
  if (!d) return '—';
  const date = new Date(d);
  const today = new Date();
  const days = Math.floor((today.setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

type View = 'all' | 'mine' | 'unassigned' | 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'ARCHIVED';

const VIEW_OPTIONS: Array<{ value: View; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'mine', label: 'My Work' },
  { value: 'NOT_STARTED', label: 'Not Started' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'DONE', label: 'Done' },
  { value: 'unassigned', label: 'Unassigned' },
];

const SORT_OPTIONS = [
  { value: 'sortOrder', label: 'Manual order' },
  { value: 'updatedAt', label: 'Recently updated' },
  { value: 'createdAt', label: 'Recently created' },
  { value: 'estimatedMinutes', label: 'Estimate' },
  { value: 'status', label: 'Status' },
] as const;

interface SafeUser { id: string; username: string; role: string }

interface WorkItemsPanelProps {
  projectId: string;
  canManage: boolean;
  users: SafeUser[];
  /** Page-level drawer open state (the palette event opens it, §23). */
  drawerOpen: boolean;
  onDrawerClose: () => void;
  onNotice: (notice: { kind: 'info' | 'warn' | 'error'; text: string }) => void;
}

export function WorkItemsPanel({
  projectId, canManage, users, drawerOpen, onDrawerClose, onNotice,
}: WorkItemsPanelProps) {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [userLabels, setUserLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [view, setView] = useState<View>('all');
  const [sort, setSort] = useState<string>('sortOrder');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [busy, setBusy] = useState(false);

  // §22 — creation drawer form. Status defaults to NOT_STARTED.
  const [form, setForm] = useState({ name: '', description: '', assignedTo: '', hours: '', minutes: '', status: 'NOT_STARTED' as WorkItemStatus });
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (debounced.trim()) p.set('search', debounced.trim());
    if (view === 'mine') p.set('view', 'mine');
    else if (view === 'unassigned') p.set('view', 'unassigned');
    else if (view !== 'all') p.set('status', view);
    if (sort !== 'sortOrder') {
      p.set('sort', sort);
      p.set('sortDir', sortDir);
    }
    return p.toString();
  }, [debounced, view, sort, sortDir]);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/agency/projects/${projectId}/work-items?${query}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => {
        setItems(body.workItems || []);
        setUserLabels(body.userLabels || {});
      })
      .catch(() => onNotice({ kind: 'error', text: 'We couldn\'t load the work list. Try again.' }))
      .finally(() => setLoading(false));
  }, [projectId, query, onNotice]);

  useEffect(() => { load(); }, [load]);

  async function request(path: string, method: string, body?: unknown): Promise<{ ok: boolean; error?: string }> {
    setBusy(true);
    try {
      const res = await fetch(path, {
        method,
        ...(body !== undefined && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: json.error || 'Something went wrong. Try again.' };
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error — please try again.' };
    } finally {
      setBusy(false);
    }
  }

  /** §22 — create from the drawer. Hours+minutes collapse into §9 minutes. */
  async function createWorkItem() {
    if (!form.name.trim()) { setFormError('Work item name is required.'); return; }
    const hours = form.hours.trim() === '' ? 0 : Number(form.hours);
    const mins = form.minutes.trim() === '' ? 0 : Number(form.minutes);
    if (Number.isNaN(hours) || Number.isNaN(mins) || hours < 0 || mins < 0) { setFormError('Estimated time must be zero or more.'); return; }
    const totalMinutes = Math.round(hours * 60 + mins);
    const result = await request(`/api/agency/projects/${projectId}/work-items`, 'POST', {
      name: form.name.trim(),
      ...(form.description.trim() && { description: form.description.trim() }),
      ...(form.assignedTo && { assignedTo: form.assignedTo }),
      ...(totalMinutes > 0 && { estimatedMinutes: totalMinutes }),
      status: form.status,
    });
    if (!result.ok) { setFormError(result.error!); return; }
    setForm({ name: '', description: '', assignedTo: '', hours: '', minutes: '', status: 'NOT_STARTED' });
    setFormError(null);
    onDrawerClose();
    onNotice({ kind: 'info', text: 'Work item created.' });
    load();
  }

  /** §11 — dedicated status action; only legal targets are offered. */
  async function changeStatus(itemId: string, to: WorkItemStatus) {
    const result = await request(`/api/agency/projects/${projectId}/work-items/${itemId}?action=status`, 'PATCH', { status: to });
    if (!result.ok) onNotice({ kind: 'error', text: result.error! });
    load();
  }

  async function archiveItem(itemId: string, name: string) {
    const ok = await confirmModal({
      title: 'Archive Work Item',
      message: `Archive "${name}"? Archived work items stay resolvable for their history but leave the operational list.`,
      confirmText: 'Archive',
      variant: 'warning',
    });
    if (!ok) return;
    const result = await request(`/api/agency/projects/${projectId}/work-items/${itemId}/archive`, 'POST');
    if (!result.ok) onNotice({ kind: 'error', text: result.error! });
    load();
  }

  const visible = items;

  return (
    <section className="space-y-3" aria-label="Work">
      {/* Toolbar: search (§24) + view filter + sort (§25) + Add Work (§23) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        <SearchBar
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, description, or assignee…"
          aria-label="Search work items"
        />
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
          <Select
            value={view}
            onChange={e => setView(e.target.value as View)}
            aria-label="Filter work items"
            className="h-9"
            wrapperClassName="w-full sm:w-36 shrink-0"
          >
            {VIEW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <Select
            value={`${sort}:${sortDir}`}
            onChange={e => { const [f, d] = e.target.value.split(':'); setSort(f); setSortDir(d as 'asc' | 'desc'); }}
            aria-label="Sort work items"
            className="h-9"
            wrapperClassName="w-full sm:w-44 shrink-0"
          >
            {SORT_OPTIONS.map(o => (
              <React.Fragment key={o.value}>
                <option value={`${o.value}:asc`}>{o.label} ↑</option>
                <option value={`${o.value}:desc`}>{o.label} ↓</option>
              </React.Fragment>
            ))}
          </Select>
        </div>
      </div>

      {/* Loading — skeleton, no numbers */}
      {loading && (
        <div className="space-y-2" aria-busy="true" aria-label="Loading work items">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 rounded-xl bg-white/[0.03] animate-pulse" />)}
        </div>
      )}

      {!loading && visible.length === 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-[#050505] p-6 text-center">
          <p className="text-[13px] text-neutral-500">No work items match{view !== 'all' || debounced ? ' this view' : ' yet'} — they give future time entries their &ldquo;on what?&rdquo;.</p>
        </div>
      )}

      {/* List (§20) */}
      {!loading && visible.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] overflow-hidden overflow-x-auto">
          {/* Desktop table — §20 columns */}
          <table className="hidden md:table w-full text-[13px]" aria-label="Work items">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th scope="col" className="px-4 py-2.5 font-medium">Work item</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Assignee</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Estimate</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Updated</th>
                {canManage && <th scope="col" className="px-4 py-2.5 font-medium sr-only">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map(w => (
                <tr key={w.id} className="border-b border-white/[0.04] last:border-0">
                  <td className="px-4 py-2.5 text-neutral-200">
                    {w.name}
                    {w.description && <div className="text-[11.5px] text-neutral-500 truncate max-w-xs">{w.description}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-400">{w.assignedTo ? (userLabels[w.assignedTo] || '—') : <span className="text-neutral-600">Unassigned</span>}</td>
                  <td className="px-4 py-2.5 text-neutral-400 tabular-nums">{formatMinutes(w.estimatedMinutes)}</td>
                  <td className="px-4 py-2.5">
                    {canManage && w.status !== 'ARCHIVED' ? (
                      // §11 — only legal transitions offered; ARCHIVED is the
                      // dedicated action button, never a dropdown option.
                      <Select value={w.status} onChange={e => void changeStatus(w.id, e.target.value as WorkItemStatus)} aria-label={`Status of ${w.name}`} className={inputCls}>
                        {WORK_ITEM_STATUSES.filter(s => s === w.status || canTransitionWorkItemStatus(w.status, s)).map(s => <option key={s} value={s}>{s}</option>)}
                      </Select>
                    ) : (
                      <span className={STATUS_STYLE[w.status]}>{w.status}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-500 text-[12px]">{formatRelative(w.updatedAt || w.createdAt)}</td>
                  {canManage && (
                    <td className="px-4 py-2.5 text-right">
                      {w.status !== 'ARCHIVED' && canTransitionWorkItemStatus(w.status, 'ARCHIVED') && (
                        <button onClick={() => void archiveItem(w.id, w.name)} aria-label={`Archive ${w.name}`} className="p-1.5 rounded text-neutral-500 hover:text-neutral-200 hover:bg-white/[0.04] transition-colors">
                          <Archive className="w-3.5 h-3.5" aria-hidden />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile cards (§21) — DOM order matches desktop priority */}
          <div className="md:hidden divide-y divide-white/[0.04]">
            {visible.map(w => (
              <div key={w.id} className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13.5px] text-neutral-200 truncate">{w.name}</div>
                    <div className="text-[11.5px] text-neutral-500 truncate">
                      {w.assignedTo ? (userLabels[w.assignedTo] || '—') : 'Unassigned'}
                      {' · '}
                      <span className={STATUS_STYLE[w.status]}>{w.status}</span>
                    </div>
                  </div>
                  {canManage && w.status !== 'ARCHIVED' && canTransitionWorkItemStatus(w.status, 'ARCHIVED') && (
                    <button onClick={() => void archiveItem(w.id, w.name)} aria-label={`Archive ${w.name}`} className="shrink-0 p-1.5 rounded text-neutral-500 hover:text-neutral-200 hover:bg-white/[0.04] transition-colors">
                      <Archive className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-[12px] text-neutral-500 tabular-nums">
                    Estimate {formatMinutes(w.estimatedMinutes)} · {formatRelative(w.updatedAt || w.createdAt)}
                  </span>
                  {canManage && w.status !== 'ARCHIVED' && (
                    <Select value={w.status} onChange={e => void changeStatus(w.id, e.target.value as WorkItemStatus)} aria-label={`Status of ${w.name}`} className={`${inputCls} py-1`}>
                      {WORK_ITEM_STATUSES.filter(s => s === w.status || canTransitionWorkItemStatus(w.status, s)).map(s => <option key={s} value={s}>{s}</option>)}
                    </Select>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Creation drawer (§22) */}
      <Drawer isOpen={drawerOpen} onClose={onDrawerClose} title="Work Item">
        <div className="space-y-4">
          <div>
            <label htmlFor="wi-name" className="block text-[12px] font-medium text-neutral-400 mb-1.5">Name <Req satisfied={Boolean(form.name.trim())} /></label>
            <input
              id="wi-name"
              value={form.name}
              onChange={e => {
                setForm(f => ({ ...f, name: e.target.value }));
                if (formError) setFormError(null);
              }}
              placeholder="e.g. Design homepage"
              maxLength={120}
              className={`w-full px-3 py-2 rounded-lg bg-[#0a0a0a] border text-[13px] text-white placeholder:text-neutral-600 focus:outline-none transition-colors ${
                formError && !form.name.trim() ? 'border-rose-500/80 focus:border-rose-500' : 'border-white/[0.06] focus:border-white/20'
              }`}
            />
          </div>
          <div>
            <label htmlFor="wi-desc" className="block text-[12px] font-medium text-neutral-400 mb-1.5">Description <Opt /></label>
            <textarea id="wi-desc" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} maxLength={2000} placeholder="Optional context" className="w-full px-3 py-2 rounded-lg bg-[#0a0a0a] border border-white/[0.06] text-[13px] text-white placeholder:text-neutral-600 focus:outline-none focus:border-white/20 resize-y" />
          </div>
          <div>
            <label htmlFor="wi-assignee" className="block text-[12px] font-medium text-neutral-400 mb-1.5">Assign To <Opt /></label>
            <Select id="wi-assignee" value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-[#0a0a0a] border border-white/[0.06] text-[13px] text-white focus:outline-none focus:border-white/20">
              <option value="">Unassigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
            </Select>
            <p className="mt-1 text-[11px] text-neutral-600">Assign a primary owner for this work item.</p>
          </div>
          <div>
            <span className="block text-[12px] font-medium text-neutral-400 mb-1.5">Estimated Time <Opt /></span>
            <div className="flex items-center gap-2">
              <input type="number" min={0} value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} placeholder="h" aria-label="Estimated hours" className="w-20 px-3 py-2 rounded-lg bg-[#0a0a0a] border border-white/[0.06] text-[13px] text-white placeholder:text-neutral-600 focus:outline-none focus:border-white/20" />
              <span className="text-[12px] text-neutral-500">h</span>
              <input type="number" min={0} max={59} value={form.minutes} onChange={e => setForm(f => ({ ...f, minutes: e.target.value }))} placeholder="m" aria-label="Estimated minutes" className="w-20 px-3 py-2 rounded-lg bg-[#0a0a0a] border border-white/[0.06] text-[13px] text-white placeholder:text-neutral-600 focus:outline-none focus:border-white/20" />
              <span className="text-[12px] text-neutral-500">m</span>
              <span className="text-[11px] text-neutral-600">{formatMinutes((form.hours.trim() === '' ? 0 : Number(form.hours) * 60) + (form.minutes.trim() === '' ? 0 : Number(form.minutes)))}</span>
            </div>
          </div>
          <div>
            <label htmlFor="wi-status" className="block text-[12px] font-medium text-neutral-400 mb-1.5">Status <Req satisfied={Boolean(form.status)} /></label>
            <Select id="wi-status" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as WorkItemStatus }))} className="w-full px-3 py-2 rounded-lg bg-[#0a0a0a] border border-white/[0.06] text-[13px] text-white focus:outline-none focus:border-white/20">
              {WORK_ITEM_STATUSES.filter(s => s !== 'ARCHIVED').map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
          {formError && <p role="alert" className="text-[12.5px] text-red-400">{formError}</p>}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
            <button onClick={onDrawerClose} className="px-3 py-1.5 rounded border border-white/[0.08] text-[12.5px] text-neutral-300 hover:bg-white/[0.04] transition-colors">Cancel</button>
            <button onClick={() => void createWorkItem()} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 disabled:opacity-50 transition-colors">
              <Plus className="w-3.5 h-3.5" aria-hidden /> Create
            </button>
          </div>
        </div>
      </Drawer>
    </section>
  );
}
