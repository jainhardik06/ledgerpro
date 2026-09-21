"use client";

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft, Briefcase, Check, Pause, Play, Square, X, Archive, Plus, TriangleAlert,
  ChevronRight, Receipt, RotateCcw,
} from 'lucide-react';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';
import { tenantHasCapability } from '@/lib/agency/types/vertical';
import type {
  Project, ProjectStatus, ProjectMember, WorkItem, ProjectMilestone, MilestoneStatus, MilestoneBillingStatus,
} from '@/lib/agency/types/project';
import { canTransitionProjectStatus, canTransitionMilestoneStatus, MILESTONE_STATUS_LABEL } from '@/lib/agency/types/project';
import { WorkItemsPanel } from '@/components/agency/projects/WorkItemsPanel';
import { TeamPanel } from '@/components/agency/projects/TeamPanel';
import { ProjectExpensesPanel } from '@/components/agency/expenses/ProjectExpensesPanel';
import { ProjectBillingPanel } from '@/components/agency/invoices/ProjectBillingPanel';
import { ProjectProfitabilityPanel } from '@/components/agency/profitability/ProjectProfitabilityPanel';
import { DatePicker } from '@/components/ui/DatePicker';
import { confirmModal } from '@/components/ui/Dialog';
import { ProjectStatusBadge } from '@/components/agency/projects/ProjectStatusBadge';
// Type-only — erased at build, so the server-only readiness domain never
// reaches the client bundle; only its result shape does.
import type { ProjectReadiness } from '@/lib/agency/domain/project-readiness';

/**
 * Project workspace (Module 3, spec §64–§68 / Step 3.7).
 *
 * Header: client, status, billing model, dates, PM + lifecycle actions
 * (§41 — only legal transitions render, admin-gated).
 * Tabs: Overview / Team / Work / Milestones / Expenses (Module 8 gave the
 * expenses tab its real surface — the spend side of this project) / Billing
 * (Module 9 — the project's invoices and what is waiting to be billed) /
 * Profitability (Module 13 — the §68 snapshot, rendered as received §70) /
 * Activity — with Time RESERVED as an honest future tab (never fake content).
 *
 * Truth labels (§66/§67): the financial summary is PLANNED economics —
 * actuals, billed and collected arrive with Time Tracking and Invoicing.
 */
const STATUS_STYLE: Record<ProjectStatus, string> = {
  DRAFT: 'text-neutral-400',
  ACTIVE: 'text-emerald-400',
  ON_HOLD: 'text-amber-400',
  COMPLETED: 'text-sky-400',
  CANCELLED: 'text-neutral-500',
  ARCHIVED: 'text-neutral-600',
};

const MODEL_LABEL: Record<string, string> = {
  FIXED_FEE: 'Fixed Fee',
  TIME_AND_MATERIALS: 'Time & Materials',
  MILESTONE: 'Milestone',
};

const WORK_ITEM_TABS = ['overview', 'team', 'work-items', 'milestones', 'expenses', 'billing', 'profitability', 'activity'] as const;
type Tab = typeof WORK_ITEM_TABS[number];

// §102 — reserved for later modules. Rendered as disabled tabs with an
// honest label, never as empty content pretending to exist. (Module 9 gave
// Billing its real surface; Module 13 gave Profitability its own.)
const FUTURE_TABS = ['Time'] as const;

interface SafeUser { id: string; username: string; role: string }

interface ProjectDetailResponse {
  success: boolean;
  project: Project;
  members: ProjectMember[];
  /** Module 5 §37 — removed memberships, kept as history. */
  pastMembers: ProjectMember[];
  workItems: WorkItem[];
  milestones: ProjectMilestone[];
  activity: Array<{ action: string; details: string; username: string; timestamp: string | Date }>;
  clientName: string | null;
  userLabels: Record<string, string>;
  /** Module 6 §108/§125 — financial readiness, warn-only (§127). */
  readiness?: ProjectReadiness;
}

function formatDate(d: string | Date | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatMoney(amount: number, currency?: string): string {
  const code = currency && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : undefined;
  try {
    return new Intl.NumberFormat('en-IN', code ? { style: 'currency', currency: code } : undefined).format(amount);
  } catch {
    return `${code ? code + ' ' : ''}${amount.toLocaleString('en-IN')}`;
  }
}

const inputCls = 'px-3 py-1.5 rounded-lg bg-[#0a0a0a] border border-white/[0.06] text-[12.5px] text-white placeholder:text-neutral-600 focus:outline-none focus:border-white/20';

export default function ProjectWorkspacePage() {
  const { tenant, user, loading: sessionLoading } = useDashboardContext();
  const allowed = tenantHasCapability(tenant, 'AGENCY_DASHBOARD');
  // §28 pattern — admins manage the project; USER is read-only.
  const canManage = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN';
  const params = useParams<{ id: string }>();
  const projectId = params?.id;

  const [data, setData] = useState<ProjectDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [notice, setNotice] = useState<{ kind: 'info' | 'warn' | 'error'; text: string } | null>(null);
  const [users, setUsers] = useState<SafeUser[]>([]);

  // Inline add forms (admin only) — the Team tab owns its own drawer
  // (TeamPanel, Module 5 §43).
  const [milestoneForm, setMilestoneForm] = useState({ name: '', sequence: '', amount: '', percentage: '', dueDate: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** ID of the milestone currently being status-updated — disables that row's buttons. */
  const [milestoneUpdating, setMilestoneUpdating] = useState<string | null>(null);
  // Module 4 (§23) — "+ Add Work" / palette "Create Work Item" opens the
  // drawer in the Work panel.
  const [workDrawerOpen, setWorkDrawerOpen] = useState(false);

  const load = useCallback(() => {
    if (sessionLoading || !allowed || !projectId) return;
    setLoading(true);
    fetch(`/api/agency/projects/${projectId}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('not found'))))
      .then((body: ProjectDetailResponse) => {
        setData(body);
        setError(null);
      })
      .catch(() => setError('We couldn\'t load this project. It may not exist or you may not have access.'))
      .finally(() => setLoading(false));
  }, [sessionLoading, allowed, projectId]);

  useEffect(() => {
    if (!sessionLoading && allowed) load();
  }, [load, sessionLoading, allowed]);

  // Module 4 (§23) — the Command Palette's "Create Work Item" lands here:
  // switch to the Work tab and open the creation drawer. The project is
  // inherently preselected — we are ON its page. USERs never see the drawer.
  useEffect(() => {
    const openWorkDrawer = () => {
      if (!canManage) return;
      setTab('work-items');
      setWorkDrawerOpen(true);
    };
    window.addEventListener('open-new-agency-work-item', openWorkDrawer);
    return () => window.removeEventListener('open-new-agency-work-item', openWorkDrawer);
  }, [canManage]);

  // Team/work-item pickers (admin-only API, matching the wizard).
  useEffect(() => {
    if (!canManage || !projectId) return;
    fetch('/api/tenant/users')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => setUsers(body.users || []))
      .catch(() => setUsers([]));
  }, [canManage, projectId]);

  // Deep link — ?tab= opens a specific tab (the portfolio report's project
  // rows land on Profitability directly).
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    if (requested && (WORK_ITEM_TABS as readonly string[]).includes(requested)) {
      setTab(requested as Tab);
    }
  }, []);

  async function post(path: string, body?: unknown, method = 'POST'): Promise<{ ok: boolean; warnings?: string[]; error?: string }> {
    setBusy(true);
    setFormError(null);
    try {
      const res = await fetch(path, {
        method,
        ...(body !== undefined && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: json.error || 'Something went wrong. Try again.' };
      return { ok: true, warnings: json.warnings };
    } catch {
      return { ok: false, error: 'Network error — please try again.' };
    } finally {
      setBusy(false);
    }
  }

  /** §41 — only the legal transitions for the current status render. */
  async function handleLifecycle(action: 'activate' | 'pause' | 'complete' | 'cancel' | 'archive') {
    if (!projectId) return;
    if (action === 'cancel' || action === 'archive') {
      const ok = await confirmModal({
        title: action === 'cancel' ? 'Cancel Project' : 'Archive Project',
        message: action === 'cancel'
          ? 'Are you sure you want to cancel this project? This cannot be undone in Phase 1.'
          : 'Archived projects stay resolvable for their financial history.',
        confirmText: action === 'cancel' ? 'Cancel Project' : 'Archive Project',
        variant: action === 'cancel' ? 'danger' : 'warning',
      });
      if (!ok) return;
    }
    const result = await post(`/api/agency/projects/${projectId}/${action}`);
    if (!result.ok) {
      setNotice({ kind: 'error', text: result.error || 'The status change was rejected.' });
      return;
    }
    // §75 advisory warnings (e.g. activating with no fixed-fee baseline).
    if (result.warnings?.length) {
      setNotice({ kind: 'warn', text: result.warnings.join(' · ') });
    } else {
      const VERB: Record<typeof action, string> = {
        activate: 'activated', pause: 'paused', complete: 'completed', cancel: 'cancelled', archive: 'archived',
      };
      setNotice({ kind: 'info', text: `Project ${VERB[action]} successfully.` });
    }
    load();
  }

  async function addMilestone() {
    if (!projectId) return;
    const hasAmount = milestoneForm.amount.trim() !== '';
    const hasPercentage = milestoneForm.percentage.trim() !== '';
    if (!milestoneForm.name.trim() || !milestoneForm.sequence.trim()) { setFormError('Milestone name and sequence are required.'); return; }
    if (hasAmount === hasPercentage) { setFormError('A milestone needs either an amount or a percentage — never both.'); return; }
    const result = await post(`/api/agency/projects/${projectId}/milestones`, {
      name: milestoneForm.name.trim(),
      sequence: Number(milestoneForm.sequence),
      ...(hasAmount && { amount: Number(milestoneForm.amount) }),
      ...(hasPercentage && { percentage: Number(milestoneForm.percentage) }),
      ...(milestoneForm.dueDate && { dueDate: milestoneForm.dueDate }),
    });
    if (!result.ok) { setFormError(result.error!); return; }
    setMilestoneForm({ name: '', sequence: '', amount: '', percentage: '', dueDate: '' });
    load();
  }

  /** Update a milestone's delivery status via PATCH (§85). Only legal
   *  transitions are offered in the UI; the domain also enforces them. */
  async function updateMilestoneStatus(milestone: ProjectMilestone, newStatus: MilestoneStatus) {
    if (!projectId || !canTransitionMilestoneStatus(milestone.status, newStatus)) return;
    setMilestoneUpdating(milestone.id);
    const result = await post(
      `/api/agency/projects/${projectId}/milestones/${milestone.id}`,
      { status: newStatus },
      'PATCH'
    );
    setMilestoneUpdating(null);
    if (!result.ok) {
      setNotice({ kind: 'error', text: result.error || 'Milestone status could not be updated.' });
      return;
    }
    load();
  }

  if (!sessionLoading && !allowed) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <Briefcase className="w-8 h-8 mx-auto text-neutral-700" aria-hidden />
        <h1 className="mt-4 text-[16px] font-semibold text-white">Agency workspace required</h1>
        <p className="mt-2 text-[13px] text-neutral-500">Projects are an Agency workspace feature.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-[13px] text-neutral-300 underline underline-offset-4">Go to the standard dashboard</Link>
      </div>
    );
  }

  if (sessionLoading || loading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 w-full" aria-busy="true" aria-label="Loading project">
        <div className="h-24 rounded-xl bg-white/[0.03] animate-pulse" />
        <div className="h-32 rounded-xl bg-white/[0.03] animate-pulse" />
        <div className="h-40 rounded-xl bg-white/[0.03] animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 sm:p-6">
        <div role="alert" className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-6 max-w-lg">
          <h1 className="text-[15px] font-semibold text-white">Project not found</h1>
          <p className="mt-2 text-[13px] text-neutral-400">{error || 'This project doesn\'t exist in your workspace.'}</p>
          <Link href="/dashboard/agency/projects" className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-neutral-300 underline underline-offset-4">
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> Back to projects
          </Link>
        </div>
      </div>
    );
  }

  const { project, members, milestones, activity, clientName, userLabels } = data;
  const plannedMargin =
    project.revenueBudget !== undefined && project.revenueBudget > 0 && project.budgetCost !== undefined
      ? ((project.revenueBudget - project.budgetCost) / project.revenueBudget) * 100
      : null;
  const percentageSum = milestones.filter(m => m.status !== 'CANCELLED').reduce((sum, m) => sum + (m.percentage ?? 0), 0);

  return (
    <div className="p-4 sm:p-6 space-y-5 w-full">
      <Link href="/dashboard/agency/projects" className="inline-flex items-center gap-1.5 text-[12.5px] text-neutral-500 hover:text-neutral-300 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> Projects
      </Link>

      {/* Header (§64): client, status, billing model, dates, PM */}
      <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-[18px] font-semibold text-white tracking-tight">{project.name}</h1>
              <ProjectStatusBadge status={project.status} size="md" />
            </div>
            {project.code && <p className="mt-0.5 text-[12.5px] text-neutral-500">{project.code}</p>}
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[12.5px]">
              <div>
                <span className="text-neutral-500">Client: </span>
                <Link href={`/dashboard/agency/clients/${project.clientId}`} className="text-neutral-200 underline underline-offset-2">{clientName || '—'}</Link>
              </div>
              <div><span className="text-neutral-500">Billing model: </span><span className="text-neutral-200">{MODEL_LABEL[project.billingModel] || project.billingModel}</span></div>
              <div><span className="text-neutral-500">Currency: </span><span className="text-neutral-200">{project.currency}</span></div>
              <div><span className="text-neutral-500">Timeline: </span><span className="text-neutral-200">{project.startDate || project.endDate ? `${project.startDate || '…'} → ${project.endDate || '…'}` : '—'}</span></div>
              <div><span className="text-neutral-500">Project manager: </span><span className="text-neutral-200">{project.projectManagerId ? (userLabels[project.projectManagerId] || '—') : '—'}</span></div>
            </div>
          </div>

          {/* Lifecycle (§41) — only legal transitions, admin only */}
          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              {canTransitionProjectStatus(project.status, 'ACTIVE') && (
                <button onClick={() => void handleLifecycle('activate')} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 disabled:opacity-50 transition-colors">
                  <Play className="w-3.5 h-3.5" aria-hidden /> {project.status === 'COMPLETED' ? 'Reopen' : project.status === 'ON_HOLD' ? 'Resume' : 'Activate'}
                </button>
              )}
              {canTransitionProjectStatus(project.status, 'ON_HOLD') && (
                <button onClick={() => void handleLifecycle('pause')} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-white/[0.08] text-[12.5px] text-neutral-300 hover:text-amber-400 hover:border-amber-400/30 transition-colors">
                  <Pause className="w-3.5 h-3.5" aria-hidden /> Pause
                </button>
              )}
              {canTransitionProjectStatus(project.status, 'COMPLETED') && (
                <button onClick={() => void handleLifecycle('complete')} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-white/[0.08] text-[12.5px] text-neutral-300 hover:text-sky-400 hover:border-sky-400/30 transition-colors">
                  <Check className="w-3.5 h-3.5" aria-hidden /> Complete
                </button>
              )}
              {canTransitionProjectStatus(project.status, 'CANCELLED') && (
                <button onClick={() => void handleLifecycle('cancel')} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-white/[0.08] text-[12.5px] text-neutral-300 hover:text-red-400 hover:border-red-400/30 transition-colors">
                  <X className="w-3.5 h-3.5" aria-hidden /> Cancel
                </button>
              )}
              {canTransitionProjectStatus(project.status, 'ARCHIVED') && (
                <button onClick={() => void handleLifecycle('archive')} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-white/[0.08] text-[12.5px] text-neutral-300 hover:text-neutral-200 transition-colors">
                  <Archive className="w-3.5 h-3.5" aria-hidden /> Archive
                </button>
              )}
            </div>
          )}
        </div>

        {/* Financial summary (§65/§66) — PLANNED economics only */}
        <div className="mt-4 pt-4 border-t border-white/[0.05]">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Planned economics (§66)</span>
            <span className="text-[10.5px] text-neutral-600">Actuals arrive with Time Tracking · Billed/Collected with Invoicing</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              ['Contract value', project.contractValue !== undefined ? formatMoney(project.contractValue, project.currency) : 'Not set'],
              ['Revenue budget', project.revenueBudget !== undefined ? formatMoney(project.revenueBudget, project.currency) : 'Not set'],
              ['Budget cost', project.budgetCost !== undefined ? formatMoney(project.budgetCost, project.currency) : 'Not set'],
              ['Planned margin', plannedMargin !== null ? `${plannedMargin.toFixed(1)}%` : '—'],
              ['Target margin', project.targetMargin !== undefined ? `${project.targetMargin}%` : '—'],
              ['Planned hours', project.plannedHours !== undefined ? String(project.plannedHours) : '—'],
              // §57 — implied cost/hour needs BOTH baselines; without them it
              // is honestly unset, never a fake zero.
              ['Implied cost/hour', project.budgetCost !== undefined && project.plannedHours
                ? formatMoney(project.budgetCost / project.plannedHours, project.currency)
                : '—'],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 truncate">{label}</div>
                <div className="mt-1 text-[14px] font-semibold text-neutral-200 tabular-nums">{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Notice — lifecycle result / advisory warnings (§75) */}
      {notice && (
        <div
          role="status"
          className={`flex items-start justify-between gap-3 rounded-xl border p-4 ${
            notice.kind === 'error' ? 'border-red-500/25 bg-red-500/[0.06]'
            : notice.kind === 'warn' ? 'border-amber-500/25 bg-amber-500/[0.06]'
            : 'border-white/[0.08] bg-white/[0.02]'
          }`}
        >
          <p className={`text-[13px] ${notice.kind === 'error' ? 'text-red-300' : notice.kind === 'warn' ? 'text-amber-200' : 'text-neutral-300'}`}>{notice.text}</p>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="shrink-0 text-[12px] text-neutral-500 hover:text-white transition-colors">Dismiss</button>
        </div>
      )}

      {/* Tabs (§102) — live ones + reserved future ones. §114: the
          Profitability tab is admin/finance only (labor cost = salary
          economics, §63); the API route enforces the same boundary. */}
      <div className="flex items-center gap-1 flex-wrap border-b border-white/[0.06]" role="tablist" aria-label="Project workspace sections">
        {([
          ['overview', 'Overview'], ['team', 'Team'], ['work-items', 'Work'],
          ['milestones', 'Milestones'], ['expenses', 'Expenses'], ['billing', 'Billing'],
          ...(canManage ? [['profitability', 'Profitability'] as const] : []),
          ['activity', 'Activity'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
              tab === key ? 'border-white text-white' : 'border-transparent text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {label}
          </button>
        ))}
        {FUTURE_TABS.map(label => (
          <span
            key={label}
            title="Reserved — arriving with its module in Phase 1"
            className="px-3 py-2 text-[13px] font-medium text-neutral-600 cursor-not-allowed select-none border-b-2 border-transparent"
          >
            {label} <span className="text-[10px] uppercase tracking-wider">· Phase 1</span>
          </span>
        ))}
      </div>

      {/* ---------- Overview ---------- */}
      {tab === 'overview' && (
        <section className="space-y-4" aria-label="Project overview">
          <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-4 space-y-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">About</div>
            <p className="text-[13px] text-neutral-300">{project.description || 'No description yet.'}</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-[12.5px] pt-1">
              {project.projectType && <span className="text-neutral-500">Type: <span className="text-neutral-200">{project.projectType}</span></span>}
              <span className="text-neutral-500">Created: <span className="text-neutral-200">{formatDate(project.createdAt)}</span></span>
              {project.tags && project.tags.length > 0 && (
                <span className="text-neutral-500">Tags: <span className="text-neutral-200">{project.tags.join(', ')}</span></span>
              )}
            </div>
          </div>
          {project.billingModel === 'MILESTONE' && (
            <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-4 text-[12.5px] text-neutral-400">
              {milestones.filter(m => m.status !== 'CANCELLED').length === 0
                ? 'A milestone project needs at least one milestone before it can activate (§75).'
                : `Milestone allocation: ${percentageSum}% of the contract across ${milestones.filter(m => m.status !== 'CANCELLED').length} milestone(s).`}
            </div>
          )}
          {/* Module 6 §109/§125 — financial readiness panel. Readiness ≠
              lifecycle: these are warnings about incomplete financial
              configuration, never blockers (§127). */}
          {data.readiness && (() => {
            const r = data.readiness;
            const readyCount = r.checks.filter(c => c.ready).length;
            return (
              <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Financial readiness</div>
                  <div className="flex items-center gap-1.5">
                    {r.rateReady && (
                      <span className="text-[10.5px] font-semibold text-emerald-400 border border-emerald-500/25 bg-emerald-500/[0.06] px-2 py-0.5 rounded-full">RATE READY</span>
                    )}
                    {r.billingReady === true && (
                      <span className="text-[10.5px] font-semibold text-sky-400 border border-sky-500/25 bg-sky-500/[0.06] px-2 py-0.5 rounded-full">BILLING READY</span>
                    )}
                    {r.readyForTracking && (
                      <span className="text-[10.5px] font-semibold text-violet-400 border border-violet-500/25 bg-violet-500/[0.06] px-2 py-0.5 rounded-full">READY FOR TRACKING</span>
                    )}
                    <span className={`text-[11px] ${readyCount === r.checks.length ? 'text-neutral-500' : 'text-amber-400'}`}>
                      {readyCount}/{r.checks.length} checks
                    </span>
                  </div>
                </div>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                  {r.checks.map(c => (
                    <li key={c.key} className="flex items-start gap-2 text-[12.5px]">
                      {c.ready
                        ? <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" aria-hidden />
                        : <TriangleAlert className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" aria-hidden />}
                      <span className={c.ready ? 'text-neutral-300' : 'text-neutral-200'}>
                        <span className="text-neutral-500">{c.label}: </span>{c.detail}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-neutral-600">
                  Configured cost rates {r.configuredCostRates.configured}/{r.configuredCostRates.total} team members
                  {r.configuredBillingRates && <> · configured billing rates {r.configuredBillingRates.configured}/{r.configuredBillingRates.total} member roles</>}
                  . Warnings never block work — they mark where future time entries would resolve to &ldquo;not configured&rdquo; instead of money (§96/§127).
                </p>
              </div>
            );
          })()}
        </section>
      )}

      {/* ---------- Team (Module 5, §42–§46) ---------- */}
      {tab === 'team' && (
        <TeamPanel
          projectId={projectId!}
          canManage={canManage}
          users={users}
          project={project}
          members={members}
          pastMembers={data.pastMembers || []}
          userLabels={userLabels}
          onChanged={load}
          onNotice={setNotice}
        />
      )}

      {/* ---------- Work (Module 4, §19–§25) ---------- */}
      {tab === 'work-items' && (
        <>
          {canManage && (
            <div className="flex justify-end">
              <button onClick={() => setWorkDrawerOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 transition-colors">
                <Plus className="w-3.5 h-3.5" aria-hidden /> Add Work
              </button>
            </div>
          )}
          <WorkItemsPanel
            projectId={projectId!}
            canManage={canManage}
            users={users}
            drawerOpen={workDrawerOpen}
            onDrawerClose={() => setWorkDrawerOpen(false)}
            onNotice={setNotice}
          />
        </>
      )}

      {/* ---------- Milestones (§45–§47) ---------- */}
      {tab === 'milestones' && (
        <section className="space-y-3" aria-label="Milestones">
          <div className="rounded-xl border border-white/[0.06] overflow-hidden overflow-x-auto">
            {milestones.length === 0 ? (
              <p className="p-6 text-center text-[13px] text-neutral-500">
                No milestones yet.{project.billingModel === 'MILESTONE' && ' At least one is required before this project can activate (§75).'}
              </p>
            ) : (
              <table className="w-full text-[13px]" aria-label="Milestones">
                <thead>
                  <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                    <th scope="col" className="px-4 py-2.5 font-medium w-14">#</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Milestone</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Commercial</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Due</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Billing</th>
                    {canManage && <th scope="col" className="px-4 py-2.5 font-medium text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {milestones.map(m => {
                    const isUpdating = milestoneUpdating === m.id;
                    const billingStatus: MilestoneBillingStatus = m.billingStatus ?? 'UNBILLED';

                    // Status badge colours
                    const statusStyle: Record<MilestoneStatus, string> = {
                      PLANNED:     'text-neutral-400 border-neutral-500/30 bg-neutral-500/[0.06]',
                      IN_PROGRESS: 'text-amber-300  border-amber-500/30  bg-amber-500/[0.06]',
                      COMPLETED:   'text-emerald-400 border-emerald-500/30 bg-emerald-500/[0.06]',
                      CANCELLED:   'text-neutral-600 border-neutral-700/30 bg-neutral-700/[0.04]',
                    };

                    // Billing badge colours
                    const billingStyle: Record<MilestoneBillingStatus, string> = {
                      UNBILLED: 'text-neutral-500',
                      RESERVED: 'text-amber-400',
                      INVOICED: 'text-emerald-400',
                    };

                    return (
                      <tr key={m.id} className="border-b border-white/[0.04] last:border-0 group">
                        <td className="px-4 py-3 text-neutral-500 tabular-nums">{m.sequence}</td>
                        <td className="px-4 py-3">
                          <span className="text-neutral-200 font-medium">{m.name}</span>
                          {m.description && (
                            <p className="text-[11.5px] text-neutral-600 mt-0.5 line-clamp-1">{m.description}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-neutral-300 tabular-nums whitespace-nowrap">
                          {m.amount !== undefined
                            ? formatMoney(m.amount, project.currency)
                            : m.percentage !== undefined
                              ? `${m.percentage}%`
                              : <span className="text-neutral-600">—</span>}
                        </td>
                        <td className="px-4 py-3 text-neutral-500 text-[12px] whitespace-nowrap">
                          {m.dueDate || <span className="text-neutral-700">—</span>}
                        </td>

                        {/* Delivery status badge */}
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-medium border ${statusStyle[m.status]}`}>
                            {MILESTONE_STATUS_LABEL[m.status]}
                          </span>
                        </td>

                        {/* Billing lifecycle badge — only shown once a milestone is COMPLETED */}
                        <td className="px-4 py-3">
                          {m.status === 'COMPLETED' && (
                            <span className={`text-[11px] font-medium tracking-wide ${billingStyle[billingStatus]}`}>
                              {billingStatus}
                            </span>
                          )}
                        </td>

                        {/* Admin action buttons — context-sensitive per status */}
                        {canManage && (
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {/* PLANNED → IN_PROGRESS */}
                              {m.status === 'PLANNED' && (
                                <button
                                  onClick={() => void updateMilestoneStatus(m, 'IN_PROGRESS')}
                                  disabled={isUpdating}
                                  title="Start this milestone"
                                  aria-label={`Start milestone: ${m.name}`}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-amber-500/25 bg-amber-500/[0.06] text-amber-300 hover:bg-amber-500/[0.12] disabled:opacity-40 transition-colors whitespace-nowrap"
                                >
                                  <Play className="w-3 h-3" aria-hidden /> Start
                                </button>
                              )}

                              {/* IN_PROGRESS → COMPLETED */}
                              {m.status === 'IN_PROGRESS' && (
                                <button
                                  onClick={() => void updateMilestoneStatus(m, 'COMPLETED')}
                                  disabled={isUpdating}
                                  title="Mark as completed"
                                  aria-label={`Complete milestone: ${m.name}`}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-400 hover:bg-emerald-500/[0.12] disabled:opacity-40 transition-colors whitespace-nowrap"
                                >
                                  <Check className="w-3 h-3" aria-hidden /> Complete
                                </button>
                              )}

                              {/* IN_PROGRESS → PLANNED (rollback) */}
                              {m.status === 'IN_PROGRESS' && (
                                <button
                                  onClick={() => void updateMilestoneStatus(m, 'PLANNED')}
                                  disabled={isUpdating}
                                  title="Revert to Planned"
                                  aria-label={`Revert milestone to Planned: ${m.name}`}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-white/[0.06] text-neutral-400 hover:bg-white/[0.04] disabled:opacity-40 transition-colors whitespace-nowrap"
                                >
                                  <RotateCcw className="w-3 h-3" aria-hidden /> Revert
                                </button>
                              )}

                              {/* COMPLETED → IN_PROGRESS (re-open) */}
                              {m.status === 'COMPLETED' && (
                                <button
                                  onClick={() => void updateMilestoneStatus(m, 'IN_PROGRESS')}
                                  disabled={isUpdating}
                                  title="Re-open as In Progress"
                                  aria-label={`Re-open milestone: ${m.name}`}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-white/[0.06] text-neutral-400 hover:bg-white/[0.04] disabled:opacity-40 transition-colors whitespace-nowrap"
                                >
                                  <RotateCcw className="w-3 h-3" aria-hidden /> Re-open
                                </button>
                              )}

                              {/* COMPLETED + UNBILLED → Invoice deep-link */}
                              {m.status === 'COMPLETED' && billingStatus === 'UNBILLED' && (
                                <a
                                  href={`/dashboard/agency/invoices?new=1&client=${project.clientId}&project=${projectId}`}
                                  title="Create an invoice for this milestone"
                                  aria-label={`Create invoice for milestone: ${m.name}`}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-sky-500/25 bg-sky-500/[0.06] text-sky-400 hover:bg-sky-500/[0.12] transition-colors whitespace-nowrap"
                                >
                                  <Receipt className="w-3 h-3" aria-hidden /> Invoice
                                </a>
                              )}

                              {/* PLANNED / IN_PROGRESS → CANCELLED */}
                              {(m.status === 'PLANNED' || m.status === 'IN_PROGRESS') && (
                                <button
                                  onClick={() => void updateMilestoneStatus(m, 'CANCELLED')}
                                  disabled={isUpdating}
                                  title="Cancel this milestone"
                                  aria-label={`Cancel milestone: ${m.name}`}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-red-500/20 text-red-400/70 hover:bg-red-500/[0.06] disabled:opacity-40 transition-colors whitespace-nowrap"
                                >
                                  <X className="w-3 h-3" aria-hidden /> Cancel
                                </button>
                              )}

                              {/* Loading spinner overlay */}
                              {isUpdating && (
                                <span className="text-[10.5px] text-neutral-500 animate-pulse">updating…</span>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {milestones.length > 0 && (
              <div className="px-4 py-2 border-t border-white/[0.06] text-[11.5px] text-neutral-500">
                Percentage allocation: {percentageSum}%{percentageSum > 0 && percentageSum < 100 && ' (not yet fully allocated)'}
              </div>
            )}
          </div>
          {canManage && (
            <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-4 space-y-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Add milestone</div>
              <div className="flex flex-wrap items-center gap-2">
                <input value={milestoneForm.name} onChange={e => setMilestoneForm(f => ({ ...f, name: e.target.value }))} placeholder="Milestone name" maxLength={120} aria-label="Milestone name" className={`${inputCls} flex-1 min-w-[180px]`} />
                <input type="number" min={1} value={milestoneForm.sequence} onChange={e => setMilestoneForm(f => ({ ...f, sequence: e.target.value }))} placeholder="Seq" aria-label="Sequence" className={`${inputCls} w-20`} />
                <input type="number" min={0} step="any" value={milestoneForm.amount} onChange={e => setMilestoneForm(f => ({ ...f, amount: e.target.value }))} placeholder="Amount" aria-label="Amount" className={`${inputCls} w-32`} />
                <span className="self-center text-[11px] text-neutral-600">or</span>
                <input type="number" min={0} max={100} value={milestoneForm.percentage} onChange={e => setMilestoneForm(f => ({ ...f, percentage: e.target.value }))} placeholder="%" aria-label="Percentage" className={`${inputCls} w-20`} />
                <DatePicker wrapperClassName="w-40 shrink-0" value={milestoneForm.dueDate} onChange={e => setMilestoneForm(f => ({ ...f, dueDate: e.target.value }))} aria-label="Due date" />
                <button onClick={() => void addMilestone()} disabled={busy} className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 disabled:opacity-50 transition-colors shrink-0">
                  <Plus className="w-3.5 h-3.5" aria-hidden /> Add
                </button>
              </div>
              {formError && (
                <p role="alert" className="text-[11.5px] text-red-400">{formError}</p>
              )}
              <p className="text-[11px] text-neutral-600">Either an amount or a percentage — never both (§46). Percentages across milestones can never exceed 100%.</p>
            </div>
          )}
        </section>
      )}

      {/* ---------- Expenses (Module 8, §53) ---------- */}
      {tab === 'expenses' && (
        <ProjectExpensesPanel projectId={projectId!} />
      )}

      {/* ---------- Billing (Module 9, §69) ---------- */}
      {tab === 'billing' && (
        <ProjectBillingPanel project={project} canManage={canManage} />
      )}

      {/* ---------- Profitability (Module 13, §68/§70) — render only ---------- */}
      {tab === 'profitability' && (
        <ProjectProfitabilityPanel projectId={projectId!} />
      )}

      {/* ---------- Activity (§86–§88) ---------- */}
      {tab === 'activity' && (
        <section aria-label="Project activity">
          <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-4">
            {activity.length === 0 ? (
              <p className="text-[13px] text-neutral-500">No activity recorded yet.</p>
            ) : (
              <ol className="relative space-y-4 pl-4 border-l border-white/[0.08]">
                {activity.map((a, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-neutral-600" aria-hidden />
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[12.5px] font-medium text-neutral-200">{a.action}</span>
                      <span className="text-[11.5px] text-neutral-500">by {a.username}</span>
                      <span className="text-[11.5px] text-neutral-600">· {formatDate(a.timestamp)}</span>
                    </div>
                    {a.details && <p className="mt-0.5 text-[12px] text-neutral-500">{a.details}</p>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      )}

      {/* Inline form validation error */}
      {formError && tab !== 'overview' && tab !== 'activity' && tab !== 'expenses' && (
        <p role="alert" className="text-[12.5px] text-red-400">{formError}</p>
      )}
    </div>
  );
}
