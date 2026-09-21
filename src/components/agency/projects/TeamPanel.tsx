"use client";

import React, { useEffect, useState } from 'react';
import { Plus, UserMinus } from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import type { Project, ProjectMember } from '@/lib/agency/types/project';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { Req, Opt } from '@/components/ui/Req';
import { confirmModal } from '@/components/ui/Dialog';

/**
 * Agency Team panel (Module 5, §42–§46) — the "Team" tab of the project
 * workspace.
 *
 * The three DISTINCT concepts (§31) render distinctly: the Project Manager
 * section (accountability, lives on the project) vs the Members table
 * (participation). Roles are context labels (§33) — they never imply
 * permissions. Removal is SOFT (§45): the membership flips to inactive and
 * stays visible under "Past members" as history (§37).
 *
 * Team summary (§46): member count + role grouping. Planned/actual hours,
 * cost and utilization are FUTURE metrics — shown as honestly pending,
 * never as fake zeros.
 */

const inputCls = 'px-3 py-1.5 rounded-lg bg-[#0a0a0a] border border-white/[0.06] text-[12.5px] text-white placeholder:text-neutral-600 focus:outline-none focus:border-white/20';

/** §33 — suggestions only; a project role is a free-form context label. */
const ROLE_SUGGESTIONS = [
  'Project Manager', 'Developer', 'Designer', 'Copywriter', 'QA',
  'Account Manager', 'Consultant',
];

interface SafeUser { id: string; username: string; role: string }

export interface TeamNotice { kind: 'info' | 'warn' | 'error'; text: string }

interface TeamPanelProps {
  projectId: string;
  canManage: boolean;
  users: SafeUser[];
  project: Project;
  members: ProjectMember[];
  /** §37 — removed memberships, kept as history for audit/time records. */
  pastMembers: ProjectMember[];
  userLabels: Record<string, string>;
  /** Reload the workspace payload after a mutation. */
  onChanged: () => void;
  onNotice: (notice: TeamNotice) => void;
}

function formatDate(d: string | Date | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function TeamPanel({
  projectId, canManage, users, project, members, pastMembers, userLabels, onChanged, onNotice,
}: TeamPanelProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // §43 — drawer defaults: allocation 100, dates from the project timeline
  // (defaults only — every field stays overridable).
  const [form, setForm] = useState({
    userId: '',
    role: '',
    allocationPercent: '100',
    startDate: '',
    endDate: '',
  });
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (drawerOpen) {
      setForm({
        userId: '',
        role: '',
        allocationPercent: '100',
        startDate: project.startDate || '',
        endDate: project.endDate || '',
      });
      setFormError(null);
    }
  }, [drawerOpen, project.startDate, project.endDate]);

  // §40 — an active membership already covers this user; the picker hides
  // them so the 409 is a backstop, not the primary defense.
  const memberUserIds = new Set(members.map(m => m.userId));
  const addableUsers = users.filter(u => !memberUserIds.has(u.id));

  async function addMember() {
    if (!form.userId.trim()) { setFormError('Pick a user first.'); return; }
    const allocation = form.allocationPercent.trim();
    if (allocation !== '' && (Number(allocation) <= 0 || Number(allocation) > 100)) {
      setFormError('Allocation must be between 1 and 100 (§35).');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/agency/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: form.userId,
          ...(form.role.trim() && { role: form.role.trim() }),
          ...(allocation !== '' && { allocationPercent: Number(allocation) }),
          ...(form.startDate && { startDate: form.startDate }),
          ...(form.endDate && { endDate: form.endDate }),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(json.error || 'The member could not be added.');
        return;
      }
      setDrawerOpen(false);
      onNotice({ kind: 'info', text: `${userLabels[form.userId] || 'Member'} added to the team.` });
      onChanged();
    } catch {
      setFormError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  /** §45 — remove = deactivate. History stays; the user stays. */
  async function removeMember(member: ProjectMember) {
    const name = userLabels[member.userId] || 'this member';
    const ok = await confirmModal({
      title: 'Remove Team Member',
      message: `Remove ${name} from the project? Their membership is kept as history — nothing is deleted.`,
      confirmText: 'Remove Member',
      variant: 'danger',
    });
    if (!ok) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/agency/projects/${projectId}/members/${member.id}/remove`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        onNotice({ kind: 'error', text: json.error || 'The member could not be removed.' });
        return;
      }
      onNotice({ kind: 'info', text: `${name} removed from the project — membership kept as history.` });
      onChanged();
    } catch {
      onNotice({ kind: 'error', text: 'Network error — please try again.' });
    } finally {
      setBusy(false);
    }
  }

  // §46 — role grouping for the summary line.
  const roleCounts = new Map<string, number>();
  for (const m of members) {
    const label = m.role || 'Unlabeled';
    roleCounts.set(label, (roleCounts.get(label) ?? 0) + 1);
  }

  const pmName = project.projectManagerId ? (userLabels[project.projectManagerId] || '—') : null;

  return (
    <section className="space-y-3" aria-label="Project team">
      {/* §46 — Team summary */}
      <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-[13px] text-neutral-300">
            <span className="font-semibold text-white">{members.length}</span>
            <span className="text-neutral-500"> {members.length === 1 ? 'member' : 'members'}</span>
            {roleCounts.size > 0 && (
              <span className="text-neutral-500"> · {Array.from(roleCounts.entries()).map(([role, n]) => `${role} ${n}`).join(' · ')}</span>
            )}
          </div>
          {canManage && (
            <button onClick={() => setDrawerOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 transition-colors">
              <Plus className="w-3.5 h-3.5" aria-hidden /> Add Member
            </button>
          )}
        </div>
        {/* §46 future metrics — honestly pending, never fake zeros */}
        <p className="mt-2 text-[11px] text-neutral-600">
          Planned hours, actual hours, cost and utilization populate with Time Tracking (Phase 1).
        </p>
      </div>

      {/* §42 — Project Manager vs Members: distinct concepts, distinct blocks */}
      <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-4">
        <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Project Manager</div>
        {pmName ? (
          <div className="mt-1.5 text-[13.5px] text-neutral-200">
            {pmName}
            <span className="ml-2 text-[11.5px] text-neutral-500">accountable for coordination (§31)</span>
          </div>
        ) : (
          <div className="mt-1.5 text-[13px] text-neutral-500">No project manager assigned.</div>
        )}
      </div>

      <div className="rounded-xl border border-white/[0.06] overflow-hidden overflow-x-auto">
        {members.length === 0 ? (
          <p className="p-6 text-center text-[13px] text-neutral-500">No team members yet.</p>
        ) : (
          <>
            {/* Desktop table (§42) */}
            <table className="hidden sm:table w-full text-[13px]" aria-label="Project team">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                  <th scope="col" className="px-4 py-2.5 font-medium">Member</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Role</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Allocation</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">On project</th>
                  {canManage && <th scope="col" className="px-4 py-2.5 font-medium text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id} className="border-b border-white/[0.04] last:border-0">
                    <td className="px-4 py-2.5 text-neutral-200">{userLabels[m.userId] || '—'}</td>
                    <td className="px-4 py-2.5 text-neutral-400">{m.role || '—'}</td>
                    <td className="px-4 py-2.5 text-neutral-400">{m.allocationPercent !== undefined ? `${m.allocationPercent}%` : '—'}</td>
                    <td className="px-4 py-2.5 text-neutral-500 text-[12px]">
                      {m.startDate || m.endDate ? `${m.startDate || '…'} → ${m.endDate || '…'}` : formatDate(m.createdAt)}
                    </td>
                    {canManage && (
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => void removeMember(m)} disabled={busy} aria-label={`Remove ${userLabels[m.userId] || 'member'}`} className="p-1.5 rounded text-neutral-500 hover:text-red-400 hover:bg-white/[0.04] transition-colors">
                          <UserMinus className="w-3.5 h-3.5" aria-hidden />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Mobile cards (progressive disclosure, same pattern as Work) */}
            <ul className="sm:hidden divide-y divide-white/[0.04]" aria-label="Project team">
              {members.map(m => (
                <li key={m.id} className="p-3.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] text-neutral-200 truncate">{userLabels[m.userId] || '—'}</div>
                    <div className="mt-0.5 text-[12px] text-neutral-500">
                      {m.role || 'No role'}{m.allocationPercent !== undefined ? ` · ${m.allocationPercent}%` : ''}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-neutral-600">
                      {m.startDate || m.endDate ? `${m.startDate || '…'} → ${m.endDate || '…'}` : `Since ${formatDate(m.createdAt)}`}
                    </div>
                  </div>
                  {canManage && (
                    <button onClick={() => void removeMember(m)} disabled={busy} aria-label={`Remove ${userLabels[m.userId] || 'member'}`} className="shrink-0 p-1.5 rounded text-neutral-500 hover:text-red-400 hover:bg-white/[0.04] transition-colors">
                      <UserMinus className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* §37 — removed memberships stay visible as history */}
      {pastMembers.length > 0 && (
        <details className="rounded-xl border border-white/[0.06] bg-[#050505] p-4">
          <summary className="cursor-pointer text-[12px] font-medium text-neutral-400 hover:text-neutral-200 transition-colors">
            Past members ({pastMembers.length}) — kept as history (§37)
          </summary>
          <ul className="mt-3 space-y-2">
            {pastMembers.map(m => (
              <li key={m.id} className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                <span className="text-neutral-400">{userLabels[m.userId] || '—'}</span>
                {m.role && <span className="text-neutral-600">· {m.role}</span>}
                <span className="text-neutral-600">
                  · {m.startDate || '…'} → {m.endDate || '…'} · removed
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-neutral-600">
            Historical membership answers audit and time-record questions — it is never deleted.
          </p>
        </details>
      )}

      {/* §43 — Team Assignment Drawer */}
      <Drawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} title="Add team member">
        <div className="space-y-4">
          <div>
            <label htmlFor="team-user" className="block text-[12px] font-medium text-neutral-400 mb-1.5">User <Req satisfied={Boolean(form.userId.trim())} /></label>
            <Select id="team-user" value={form.userId} onChange={e => { setForm(f => ({ ...f, userId: e.target.value })); setFormError(null); }} className={`${inputCls} w-full ${formError && !form.userId.trim() ? 'border-rose-500/50' : ''}`} disabled={busy}>
              <option value="">Select a user</option>
              {addableUsers.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
            </Select>
            <p className="mt-1 text-[11px] text-neutral-600">Only users from your organization (§38). Active members are hidden — one membership per user (§40).</p>
          </div>

          <div>
            <label htmlFor="team-role" className="block text-[12px] font-medium text-neutral-400 mb-1.5">Project Role <Opt /></label>
            <input
              id="team-role"
              list="team-role-suggestions"
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              placeholder="e.g. Designer"
              maxLength={100}
              className={`${inputCls} w-full`}
              disabled={busy}
            />
            <datalist id="team-role-suggestions">
              {ROLE_SUGGESTIONS.map(r => <option key={r} value={r} />)}
            </datalist>
            <p className="mt-1 text-[11px] text-neutral-600">A context label (§33) — it never grants permissions.</p>
          </div>

          <div>
            <label htmlFor="team-allocation" className="block text-[12px] font-medium text-neutral-400 mb-1.5">Allocation % <Opt /></label>
            <input
              id="team-allocation"
              type="number"
              min={1}
              max={100}
              value={form.allocationPercent}
              onChange={e => setForm(f => ({ ...f, allocationPercent: e.target.value }))}
              className={`${inputCls} w-full`}
              disabled={busy}
            />
            <p className="mt-1 text-[11px] text-neutral-600">Approximate planned share of capacity (§34) — metadata only in Phase 1. Over-allocation across projects is recorded, not blocked (§35).</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="team-start" className="block text-[12px] font-medium text-neutral-400 mb-1.5">Start Date <Opt /></label>
              <DatePicker id="team-start" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} disabled={busy} />
            </div>
            <div>
              <label htmlFor="team-end" className="block text-[12px] font-medium text-neutral-400 mb-1.5">End Date <Opt /></label>
              <DatePicker id="team-end" value={form.endDate} min={form.startDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} disabled={busy} />
            </div>
          </div>
          <p className="text-[11px] text-neutral-600">Dates default to the project timeline (§43) — adjust freely.</p>

          {formError && <p role="alert" className="text-[12.5px] text-red-400">{formError}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setDrawerOpen(false)} disabled={busy} className="px-3 py-1.5 rounded-lg border border-white/[0.08] text-[12.5px] text-neutral-300 hover:text-white transition-colors">
              Cancel
            </button>
            <button onClick={() => void addMember()} disabled={busy} className="px-3 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 disabled:opacity-50 transition-colors">
              Add Member
            </button>
          </div>
        </div>
      </Drawer>
    </section>
  );
}
