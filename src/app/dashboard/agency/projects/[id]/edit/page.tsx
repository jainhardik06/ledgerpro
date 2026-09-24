"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Briefcase, Check, TriangleAlert, DollarSign, Clock, Users,
  ListTodo, Layers, Sparkles, ExternalLink, Plus, Save, X, Play, Info,
} from 'lucide-react';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';
import { tenantHasCapability } from '@/lib/agency/types/vertical';
import type {
  Project, ProjectStatus, ProjectMember, WorkItem, ProjectMilestone,
} from '@/lib/agency/types/project';
import { canTransitionProjectStatus } from '@/lib/agency/types/project';
import { BILLING_MODELS, type BillingModel } from '@/lib/agency/types/client';
import { DEFAULT_PROJECT_TYPES } from '@/lib/agency/types/agency-settings';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { Req, Opt } from '@/components/ui/Req';
import { ProjectStatusBadge } from '@/components/agency/projects/ProjectStatusBadge';
import type { ProjectReadiness } from '@/lib/agency/domain/project-readiness';

interface SafeUser { id: string; username: string; role: string }

interface ProjectDetailResponse {
  success: boolean;
  project: Project;
  members: ProjectMember[];
  pastMembers: ProjectMember[];
  workItems: WorkItem[];
  milestones: ProjectMilestone[];
  activity: Array<{ action: string; details: string; username: string; timestamp: string | Date }>;
  clientName: string | null;
  userLabels: Record<string, string>;
  readiness?: ProjectReadiness;
}

interface FormState {
  name: string;
  code: string;
  description: string;
  projectType: string;
  tags: string;
  billingModel: BillingModel;
  currency: string;
  startDate: string;
  endDate: string;
  contractValue: string;
  revenueBudget: string;
  budgetCost: string;
  targetMargin: string;
  plannedHours: string;
  projectManagerId: string;
}

const inputCls = 'w-full px-3 py-2 rounded-lg bg-[#0a0a0a] border border-white/[0.08] text-[13px] text-white placeholder:text-neutral-600 focus:outline-none focus:border-white/25 transition-colors';
const labelCls = 'block text-[11px] font-medium uppercase tracking-wider text-neutral-400 mb-1.5';

function num(v: string | undefined): number | undefined {
  if (v === undefined || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function formatMoney(amount: number, currency?: string): string {
  const code = currency && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : undefined;
  try {
    return new Intl.NumberFormat('en-IN', code ? { style: 'currency', currency: code } : undefined).format(amount);
  } catch {
    return `${code ? code + ' ' : ''}${amount.toLocaleString('en-IN')}`;
  }
}

export default function EditProjectPage() {
  const { tenant, user, loading: sessionLoading } = useDashboardContext();
  const allowed = tenantHasCapability(tenant, 'AGENCY_DASHBOARD');
  const canManage = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN';
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: 'info' | 'warn' | 'error'; text: string } | null>(null);

  const [data, setData] = useState<ProjectDetailResponse | null>(null);
  const [users, setUsers] = useState<SafeUser[]>([]);

  // Inline Quick Add Member form state
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberUserId, setNewMemberUserId] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('Developer');
  const [newMemberAllocation, setNewMemberAllocation] = useState('100');
  const [addingMember, setAddingMember] = useState(false);

  // Inline Quick Add Work Item state
  const [showAddWork, setShowAddWork] = useState(false);
  const [newWorkName, setNewWorkName] = useState('');
  const [newWorkAssignedTo, setNewWorkAssignedTo] = useState('');
  const [addingWork, setAddingWork] = useState(false);

  // Activation busy state
  const [activating, setActivating] = useState(false);

  // Form State
  const [form, setForm] = useState<FormState>({
    name: '',
    code: '',
    description: '',
    projectType: '',
    tags: '',
    billingModel: 'FIXED_FEE',
    currency: 'INR',
    startDate: '',
    endDate: '',
    contractValue: '',
    revenueBudget: '',
    budgetCost: '',
    targetMargin: '',
    plannedHours: '',
    projectManagerId: '',
  });

  const load = useCallback(() => {
    if (sessionLoading || !allowed || !projectId) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/agency/projects/${projectId}`).then(res => (res.ok ? res.json() : Promise.reject(new Error('not found')))),
      fetch('/api/tenant/users').then(res => (res.ok ? res.json() : { users: [] })),
    ])
      .then(([projectData, usersData]: [ProjectDetailResponse, { users: SafeUser[] }]) => {
        setData(projectData);
        setUsers(usersData.users || []);
        const p = projectData.project;
        setForm({
          name: p.name || '',
          code: p.code || '',
          description: p.description || '',
          projectType: p.projectType || '',
          tags: p.tags ? p.tags.join(', ') : '',
          billingModel: p.billingModel || 'FIXED_FEE',
          currency: p.currency || 'INR',
          startDate: p.startDate ? p.startDate.slice(0, 10) : '',
          endDate: p.endDate ? p.endDate.slice(0, 10) : '',
          contractValue: p.contractValue !== undefined ? String(p.contractValue) : '',
          revenueBudget: p.revenueBudget !== undefined ? String(p.revenueBudget) : '',
          budgetCost: p.budgetCost !== undefined ? String(p.budgetCost) : '',
          targetMargin: p.targetMargin !== undefined ? String(p.targetMargin) : '',
          plannedHours: p.plannedHours !== undefined ? String(p.plannedHours) : '',
          projectManagerId: p.projectManagerId || '',
        });
        setError(null);
      })
      .catch(() => setError('Failed to load project details for editing.'))
      .finally(() => setLoading(false));
  }, [sessionLoading, allowed, projectId]);

  useEffect(() => {
    if (!sessionLoading && allowed) load();
  }, [load, sessionLoading, allowed]);

  // Derived financial computations for live preview
  const parsedRev = num(form.revenueBudget);
  const parsedCost = num(form.budgetCost);
  const parsedHours = num(form.plannedHours);
  const parsedMargin = num(form.targetMargin);

  const plannedMarginPct = useMemo(() => {
    if (parsedRev !== undefined && parsedRev > 0 && parsedCost !== undefined) {
      return ((parsedRev - parsedCost) / parsedRev) * 100;
    }
    return null;
  }, [parsedRev, parsedCost]);

  const impliedCostPerHour = useMemo(() => {
    if (parsedCost !== undefined && parsedHours !== undefined && parsedHours > 0) {
      return parsedCost / parsedHours;
    }
    return null;
  }, [parsedCost, parsedHours]);

  // Dynamic Readiness Evaluation (syncs with live edits + server data)
  const dynamicReadiness = useMemo(() => {
    if (!data) return null;
    const { project, members, workItems, readiness } = data;
    const activeMembers = members.filter(m => m.active !== false);
    const openWorkItems = workItems.filter(w => w.status !== 'ARCHIVED');

    const clientReady = !!project.clientId;
    const modelReady = BILLING_MODELS.includes(form.billingModel);
    const revReady = parsedRev !== undefined && parsedRev > 0;
    const costReady = parsedCost !== undefined && parsedCost > 0;
    const hoursReady = parsedHours !== undefined && parsedHours > 0;
    const teamReady = activeMembers.length > 0;
    const costRatesReady = readiness?.rateReady ?? false;
    const isTm = form.billingModel === 'TIME_AND_MATERIALS';
    const billingRatesReady = !isTm || (readiness?.billingReady === true);
    const activeReady = project.status === 'ACTIVE';
    const workItemsReady = openWorkItems.length > 0;

    const checks = [
      {
        key: 'client',
        label: 'Client',
        ready: clientReady,
        detail: clientReady ? `Linked to ${data.clientName || 'Client'}` : 'No client linked',
        actionHref: data.project.clientId ? `/dashboard/agency/clients/${data.project.clientId}` : undefined,
        actionLabel: 'View Client',
      },
      {
        key: 'billingModel',
        label: 'Billing Model',
        ready: modelReady,
        detail: form.billingModel,
        anchor: '#commercial',
        actionLabel: 'Configure Model',
      },
      {
        key: 'revenueBudget',
        label: 'Revenue Budget',
        ready: revReady,
        detail: revReady ? `${form.currency} ${parsedRev!.toLocaleString('en-IN')}` : 'Not set',
        anchor: '#revenueBudget',
        actionLabel: revReady ? 'Edit' : 'Set Budget',
      },
      {
        key: 'costBudget',
        label: 'Cost Budget',
        ready: costReady,
        detail: costReady ? `${form.currency} ${parsedCost!.toLocaleString('en-IN')}` : 'Not set',
        anchor: '#budgetCost',
        actionLabel: costReady ? 'Edit' : 'Set Budget',
      },
      {
        key: 'plannedHours',
        label: 'Planned Hours',
        ready: hoursReady,
        detail: hoursReady ? `${parsedHours} hrs` : 'Not set',
        anchor: '#plannedHours',
        actionLabel: hoursReady ? 'Edit' : 'Set Hours',
      },
      {
        key: 'team',
        label: 'Team',
        ready: teamReady,
        detail: teamReady ? `${activeMembers.length} active member(s)` : 'No active team members',
        anchor: '#team-section',
        actionLabel: teamReady ? 'Manage Team' : 'Add Member',
      },
      {
        key: 'costRates',
        label: 'Cost Rates',
        ready: costRatesReady,
        detail: readiness?.checks.find(c => c.key === 'costRates')?.detail || (teamReady ? 'Pending rate card resolution' : 'No team to price'),
        actionHref: '/dashboard/agency/rate-cards',
        actionLabel: 'Rate Cards',
      },
      {
        key: 'billingRates',
        label: 'Billing Rates',
        ready: billingRatesReady,
        detail: !isTm
          ? `${form.billingModel} — billed as a whole, not by role`
          : (readiness?.checks.find(c => c.key === 'billingRates')?.detail || 'Pending billing rate resolution'),
        actionHref: isTm ? '/dashboard/agency/rate-cards' : undefined,
        actionLabel: isTm ? 'Rate Cards' : undefined,
      },
      {
        key: 'projectActive',
        label: 'Project Active',
        ready: activeReady,
        detail: activeReady ? 'Project is live for delivery' : `Status ${project.status} — targets ACTIVE projects (§126)`,
        anchor: '#lifecycle-section',
        actionLabel: activeReady ? undefined : 'Activate Project',
      },
      {
        key: 'workItems',
        label: 'Work Items',
        ready: workItemsReady,
        detail: workItemsReady ? `${openWorkItems.length} open item(s) to log against` : 'No open work items (§126)',
        anchor: '#work-section',
        actionLabel: workItemsReady ? 'View Work' : 'Add Work Item',
      },
    ];

    const readyCount = checks.filter(c => c.ready).length;
    return {
      checks,
      readyCount,
      totalCount: checks.length,
      allReady: readyCount === checks.length,
    };
  }, [data, form.billingModel, form.currency, parsedRev, parsedCost, parsedHours]);

  // Handle Project Form Submission
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return;

    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Project name is required';
    if (!form.billingModel) errors.billingModel = 'Billing model is required';
    if (!/^[A-Z]{3}$/.test(form.currency.trim().toUpperCase())) {
      errors.currency = 'Currency must be a 3-letter ISO code (e.g. INR, USD)';
    }
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      errors.endDate = 'End date cannot be earlier than start date';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setNotice({ kind: 'error', text: 'Please resolve the highlighted validation errors.' });
      return;
    }

    setFieldErrors({});
    setSaving(true);
    setNotice(null);

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      description: form.description.trim(),
      projectType: form.projectType.trim() || undefined,
      billingModel: form.billingModel,
      currency: form.currency.trim().toUpperCase(),
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      contractValue: num(form.contractValue),
      revenueBudget: num(form.revenueBudget),
      budgetCost: num(form.budgetCost),
      targetMargin: num(form.targetMargin),
      plannedHours: num(form.plannedHours),
      projectManagerId: form.projectManagerId || undefined,
      tags: form.tags
        ? form.tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 10)
        : [],
    };

    if (form.code.trim()) {
      payload.code = form.code.trim();
    }

    try {
      const res = await fetch(`/api/agency/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok) {
        setNotice({ kind: 'error', text: result.error || 'Failed to update project configurations.' });
        return;
      }

      if (result.warnings?.length) {
        setNotice({ kind: 'warn', text: `Saved with advisory warnings: ${result.warnings.join(' · ')}` });
      } else {
        setNotice({ kind: 'info', text: 'Project configurations saved successfully!' });
      }

      setTimeout(() => {
        router.push(`/dashboard/agency/projects/${projectId}`);
      }, 700);
    } catch {
      setNotice({ kind: 'error', text: 'Network error occurred while saving project.' });
    } finally {
      setSaving(false);
    }
  }

  // Quick Add Member directly from edit screen
  async function handleQuickAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !newMemberUserId) return;
    setAddingMember(true);
    try {
      const res = await fetch(`/api/agency/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: newMemberUserId,
          role: newMemberRole.trim() || 'Team Member',
          allocationPercent: Number(newMemberAllocation) || 100,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice({ kind: 'error', text: json.error || 'Could not add team member.' });
      } else {
        setNotice({ kind: 'info', text: 'Team member added successfully!' });
        setShowAddMember(false);
        setNewMemberUserId('');
        load();
      }
    } catch {
      setNotice({ kind: 'error', text: 'Network error adding member.' });
    } finally {
      setAddingMember(false);
    }
  }

  // Quick Add Work Item directly from edit screen
  async function handleQuickAddWork(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !newWorkName.trim()) return;
    setAddingWork(true);
    try {
      const res = await fetch(`/api/agency/projects/${projectId}/work-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newWorkName.trim(),
          assignedTo: newWorkAssignedTo || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice({ kind: 'error', text: json.error || 'Could not create work item.' });
      } else {
        setNotice({ kind: 'info', text: 'Work item created successfully!' });
        setShowAddWork(false);
        setNewWorkName('');
        setNewWorkAssignedTo('');
        load();
      }
    } catch {
      setNotice({ kind: 'error', text: 'Network error creating work item.' });
    } finally {
      setAddingWork(false);
    }
  }

  // Direct Project Activation
  async function handleActivate() {
    if (!projectId) return;
    setActivating(true);
    try {
      const res = await fetch(`/api/agency/projects/${projectId}/activate`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice({ kind: 'error', text: json.error || 'Project activation was rejected.' });
      } else {
        setNotice({
          kind: 'info',
          text: json.warnings?.length
            ? `Project activated with advisories: ${json.warnings.join(' · ')}`
            : 'Project activated successfully! Time tracking targets can now be logged.',
        });
        load();
      }
    } catch {
      setNotice({ kind: 'error', text: 'Network error activating project.' });
    } finally {
      setActivating(false);
    }
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
      <div className="p-4 sm:p-6 space-y-4 max-w-5xl mx-auto w-full" aria-busy="true">
        <div className="h-10 w-48 rounded-lg bg-white/[0.03] animate-pulse" />
        <div className="h-32 rounded-xl bg-white/[0.03] animate-pulse" />
        <div className="h-64 rounded-xl bg-white/[0.03] animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 sm:p-6 max-w-xl mx-auto">
        <div role="alert" className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-6 text-center">
          <TriangleAlert className="w-8 h-8 mx-auto text-amber-400" />
          <h1 className="mt-3 text-[16px] font-semibold text-white">Project Not Found</h1>
          <p className="mt-2 text-[13px] text-neutral-400">{error || 'Could not find the specified project.'}</p>
          <Link href="/dashboard/agency/projects" className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded bg-white text-black text-[13px] font-medium hover:bg-neutral-200 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  const { project, members, workItems, clientName } = data;
  const activeMembers = members.filter(m => m.active !== false);
  const openWorkItems = workItems.filter(w => w.status !== 'ARCHIVED');
  const existingMemberIds = new Set(activeMembers.map(m => m.userId));
  const availableUsersForTeam = users.filter(u => !existingMemberIds.has(u.id));

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto w-full">
      {/* Top Breadcrumb & Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-[12.5px] text-neutral-400">
          <Link href="/dashboard/agency/projects" className="hover:text-white transition-colors">Projects</Link>
          <span className="text-neutral-600">/</span>
          <Link href={`/dashboard/agency/projects/${project.id}`} className="hover:text-white transition-colors">{project.name}</Link>
          <span className="text-neutral-600">/</span>
          <span className="text-neutral-200 font-medium">Edit Configurations</span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/agency/projects/${project.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-white/[0.08] text-[12.5px] text-neutral-400 hover:text-white hover:border-white/20 transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Cancel
          </Link>
          {canManage && (
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 disabled:opacity-50 transition-colors shadow-sm"
            >
              <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div
          role="status"
          className={`flex items-start justify-between gap-3 rounded-xl border p-4 ${
            notice.kind === 'error' ? 'border-red-500/25 bg-red-500/[0.06] text-red-200'
            : notice.kind === 'warn' ? 'border-amber-500/25 bg-amber-500/[0.06] text-amber-200'
            : 'border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-200'
          }`}
        >
          <p className="text-[13px]">{notice.text}</p>
          <button onClick={() => setNotice(null)} className="shrink-0 text-[12px] opacity-70 hover:opacity-100 transition-opacity">Dismiss</button>
        </div>
      )}

      {/* Main Grid: Form Left, Financial Readiness Companion Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Form Container (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 1. Project Basics Card */}
            <div id="basics" className="rounded-xl border border-white/[0.06] bg-[#050505] p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-white/[0.05] pb-3">
                <div className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-neutral-400" />
                  <h2 className="text-[14px] font-semibold text-white">Project Identity & Basics</h2>
                </div>
                <div className="flex items-center gap-2">
                  <ProjectStatusBadge status={project.status} size="sm" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label htmlFor="projectName" className={labelCls}>
                    Project Name <Req />
                  </label>
                  <input
                    id="projectName"
                    type="text"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Website Redesign 2026"
                    className={inputCls}
                    required
                  />
                  {fieldErrors.name && <p className="mt-1 text-[11px] text-red-400">{fieldErrors.name}</p>}
                </div>

                <div>
                  <label htmlFor="projectCode" className={labelCls}>
                    Project Code <Opt />
                  </label>
                  <input
                    id="projectCode"
                    type="text"
                    value={form.code}
                    disabled={!!project.code}
                    onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                    placeholder="Auto-generated e.g. PRJ-0001"
                    className={`${inputCls} ${project.code ? 'opacity-60 cursor-not-allowed bg-white/[0.02]' : ''}`}
                  />
                  {project.code && <p className="mt-1 text-[11px] text-neutral-500">Project code is immutable once assigned (§38).</p>}
                </div>

                <div>
                  <label htmlFor="projectManager" className={labelCls}>
                    Project Manager <Opt />
                  </label>
                  <Select
                    id="projectManager"
                    value={form.projectManagerId}
                    onChange={e => setForm(f => ({ ...f, projectManagerId: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="">No manager assigned</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.username} ({u.role})</option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label htmlFor="projectType" className={labelCls}>
                    Project Type <Opt />
                  </label>
                  <Select
                    id="projectType"
                    value={form.projectType}
                    onChange={e => setForm(f => ({ ...f, projectType: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="">Select a category...</option>
                    {DEFAULT_PROJECT_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                    {form.projectType && !DEFAULT_PROJECT_TYPES.includes(form.projectType) && (
                      <option value={form.projectType}>{form.projectType}</option>
                    )}
                  </Select>
                </div>

                <div>
                  <label htmlFor="projectTags" className={labelCls}>
                    Tags <Opt />
                  </label>
                  <input
                    id="projectTags"
                    type="text"
                    value={form.tags}
                    onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                    placeholder="Comma-separated e.g. redesign, q3, brand"
                    className={inputCls}
                  />
                  <p className="mt-1 text-[11px] text-neutral-500">Up to 10 tags for portfolio grouping.</p>
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="projectDescription" className={labelCls}>
                    Description & Objectives <Opt />
                  </label>
                  <textarea
                    id="projectDescription"
                    rows={3}
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="State project scope, deliverables, and commercial objectives..."
                    className={inputCls}
                  />
                </div>
              </div>
            </div>

            {/* 2. Commercial Model & Timeline Card */}
            <div id="commercial" className="rounded-xl border border-white/[0.06] bg-[#050505] p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-white/[0.05] pb-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-neutral-400" />
                  <h2 className="text-[14px] font-semibold text-white">Commercial Setup & Timeline</h2>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>
                    Linked Client
                  </label>
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.06] text-[13px] text-neutral-300">
                    <span className="font-medium text-white">{clientName || 'Direct Client'}</span>
                    {project.clientId && (
                      <Link
                        href={`/dashboard/agency/clients/${project.clientId}`}
                        className="text-[11px] text-neutral-400 hover:text-white inline-flex items-center gap-1"
                        target="_blank"
                      >
                        Client file <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-500">A project stays anchored to its client (§80).</p>
                </div>

                <div>
                  <label htmlFor="billingModel" className={labelCls}>
                    Billing Model <Req />
                  </label>
                  <Select
                    id="billingModel"
                    value={form.billingModel}
                    onChange={e => setForm(f => ({ ...f, billingModel: e.target.value as BillingModel }))}
                    className={inputCls}
                  >
                    <option value="FIXED_FEE">Fixed Fee (Billed as a whole)</option>
                    <option value="TIME_AND_MATERIALS">Time & Materials (Billed by role rates)</option>
                    <option value="MILESTONE">Milestone (Billed against completed stages)</option>
                  </Select>
                </div>

                <div>
                  <label htmlFor="currency" className={labelCls}>
                    Currency (ISO 3-Letter) <Req />
                  </label>
                  <input
                    id="currency"
                    type="text"
                    maxLength={3}
                    value={form.currency}
                    disabled={project.status !== 'DRAFT'}
                    onChange={e => setForm(f => ({ ...f, currency: e.target.value.toUpperCase() }))}
                    className={`${inputCls} ${project.status !== 'DRAFT' ? 'opacity-60 cursor-not-allowed bg-white/[0.02]' : ''}`}
                    placeholder="INR"
                  />
                  {project.status !== 'DRAFT' ? (
                    <p className="mt-1 text-[11px] text-neutral-500">Currency cannot change after project activation (§89).</p>
                  ) : (
                    <p className="mt-1 text-[11px] text-neutral-500">3-letter code (e.g. INR, USD, EUR, GBP).</p>
                  )}
                </div>

                <div>
                  <label className={labelCls}>
                    Start Date <Opt />
                  </label>
                  <DatePicker
                    value={form.startDate}
                    onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                    placeholder="YYYY-MM-DD"
                  />
                </div>

                <div>
                  <label className={labelCls}>
                    Target End Date <Opt />
                  </label>
                  <DatePicker
                    value={form.endDate}
                    onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                    placeholder="YYYY-MM-DD"
                  />
                  {fieldErrors.endDate && <p className="mt-1 text-[11px] text-red-400">{fieldErrors.endDate}</p>}
                </div>
              </div>
            </div>

            {/* 3. Financial Baselines & Budgets Card (KEY TO 3/10 -> CHECKS) */}
            <div id="financial" className="rounded-xl border border-white/[0.06] bg-[#050505] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between border-b border-white/[0.05] pb-3 gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-[14px] font-semibold text-white">Financial Baselines & Budgets</h2>
                </div>
                <span className="text-[11px] text-neutral-500">Configures Revenue, Cost, and Hours readiness checks</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="revenueBudget" className={labelCls}>
                    Revenue Budget ({form.currency}) <Opt />
                  </label>
                  <div className="relative">
                    <input
                      id="revenueBudget"
                      type="number"
                      min="0"
                      step="any"
                      value={form.revenueBudget}
                      onChange={e => setForm(f => ({ ...f, revenueBudget: e.target.value }))}
                      placeholder="e.g. 500000"
                      className={inputCls}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Baseline planned billing target. Satisfies Financial Readiness check #3.
                  </p>
                </div>

                <div>
                  <label htmlFor="budgetCost" className={labelCls}>
                    Cost Budget ({form.currency}) <Opt />
                  </label>
                  <div className="relative">
                    <input
                      id="budgetCost"
                      type="number"
                      min="0"
                      step="any"
                      value={form.budgetCost}
                      onChange={e => setForm(f => ({ ...f, budgetCost: e.target.value }))}
                      placeholder="e.g. 300000"
                      className={inputCls}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Max planned labor and direct spend. Satisfies Financial Readiness check #4.
                  </p>
                </div>

                <div>
                  <label htmlFor="plannedHours" className={labelCls}>
                    Planned Delivery Hours <Opt />
                  </label>
                  <div className="relative">
                    <input
                      id="plannedHours"
                      type="number"
                      min="0"
                      step="any"
                      value={form.plannedHours}
                      onChange={e => setForm(f => ({ ...f, plannedHours: e.target.value }))}
                      placeholder="e.g. 240"
                      className={inputCls}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Total budgeted team hours. Satisfies Financial Readiness check #5.
                  </p>
                </div>

                <div>
                  <label htmlFor="contractValue" className={labelCls}>
                    Contract Value ({form.currency}) <Opt />
                  </label>
                  <input
                    id="contractValue"
                    type="number"
                    min="0"
                    step="any"
                    value={form.contractValue}
                    onChange={e => setForm(f => ({ ...f, contractValue: e.target.value }))}
                    placeholder="e.g. 550000"
                    className={inputCls}
                  />
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Signed commercial value for fixed-fee and milestone projects.
                  </p>
                </div>

                <div>
                  <label htmlFor="targetMargin" className={labelCls}>
                    Target Margin % <Opt />
                  </label>
                  <input
                    id="targetMargin"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={form.targetMargin}
                    onChange={e => setForm(f => ({ ...f, targetMargin: e.target.value }))}
                    placeholder="e.g. 40"
                    className={inputCls}
                  />
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Goal profitability margin percentage.
                  </p>
                </div>
              </div>

              {/* Live Planned Economics Calculator */}
              <div className="rounded-lg bg-white/[0.02] border border-white/[0.05] p-3.5 mt-2">
                <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-2">
                  Live Planned Economics Preview
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12.5px]">
                  <div>
                    <span className="text-neutral-500 block text-[11px]">Planned Profit</span>
                    <span className="font-semibold text-neutral-200 tabular-nums">
                      {parsedRev !== undefined && parsedCost !== undefined
                        ? formatMoney(parsedRev - parsedCost, form.currency)
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block text-[11px]">Planned Margin</span>
                    <span className={`font-semibold tabular-nums ${plannedMarginPct !== null && plannedMarginPct < (parsedMargin || 0) ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {plannedMarginPct !== null ? `${plannedMarginPct.toFixed(1)}%` : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block text-[11px]">Target Margin</span>
                    <span className="font-semibold text-neutral-200 tabular-nums">
                      {parsedMargin !== undefined ? `${parsedMargin}%` : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block text-[11px]">Implied Cost / Hour</span>
                    <span className="font-semibold text-neutral-200 tabular-nums">
                      {impliedCostPerHour !== null ? formatMoney(impliedCostPerHour, form.currency) : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Actions Bar */}
            <div className="flex items-center justify-between pt-2">
              <Link
                href={`/dashboard/agency/projects/${project.id}`}
                className="inline-flex items-center gap-1.5 text-[12.5px] text-neutral-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Project Details
              </Link>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-white text-black text-[13px] font-semibold hover:bg-neutral-200 disabled:opacity-50 transition-colors shadow-md"
                >
                  <Save className="w-4 h-4" /> {saving ? 'Saving Changes...' : 'Save Configurations'}
                </button>
              </div>
            </div>
          </form>

          {/* 4. Team & Work Items Quick Management Section */}
          <div id="team-work" className="space-y-6 pt-4 border-t border-white/[0.08]">
            {/* Team Members Card */}
            <div id="team-section" className="rounded-xl border border-white/[0.06] bg-[#050505] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.05] pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-neutral-400" />
                    <h3 className="text-[14px] font-semibold text-white">Active Team Members</h3>
                  </div>
                  <p className="text-[12px] text-neutral-500 mt-0.5">
                    {activeMembers.length} active member(s). Satisfies Financial Readiness check #6 (Team).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/dashboard/agency/projects/${project.id}?tab=team`}
                    className="text-[12px] text-neutral-400 hover:text-white underline underline-offset-2 flex items-center gap-1"
                  >
                    Full Team Tab <ExternalLink className="w-3 h-3" />
                  </Link>
                  {canManage && !showAddMember && (
                    <button
                      type="button"
                      onClick={() => setShowAddMember(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/[0.08] hover:bg-white/[0.12] text-white text-[12px] font-medium transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Member
                    </button>
                  )}
                </div>
              </div>

              {/* Inline Add Member Form */}
              {showAddMember && (
                <form onSubmit={handleQuickAddMember} className="rounded-lg bg-white/[0.03] border border-white/[0.08] p-3.5 space-y-3">
                  <div className="text-[12px] font-medium text-white flex items-center justify-between">
                    <span>Quick Add Team Member</span>
                    <button type="button" onClick={() => setShowAddMember(false)} className="text-neutral-500 hover:text-white">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className={labelCls}>Select User <Req /></label>
                      <Select
                        value={newMemberUserId}
                        onChange={e => setNewMemberUserId(e.target.value)}
                        className={inputCls}
                        required
                      >
                        <option value="">Choose user...</option>
                        {availableUsersForTeam.map(u => (
                          <option key={u.id} value={u.id}>{u.username} ({u.role})</option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <label className={labelCls}>Project Role <Req /></label>
                      <input
                        type="text"
                        value={newMemberRole}
                        onChange={e => setNewMemberRole(e.target.value)}
                        placeholder="Developer, Designer, QA"
                        className={inputCls}
                        required
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Allocation % <Opt /></label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={newMemberAllocation}
                        onChange={e => setNewMemberAllocation(e.target.value)}
                        placeholder="100"
                        className={inputCls}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddMember(false)}
                      className="px-3 py-1.5 rounded border border-white/[0.08] text-[12px] text-neutral-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={addingMember || !newMemberUserId}
                      className="px-3 py-1.5 rounded bg-white text-black text-[12px] font-semibold hover:bg-neutral-200 disabled:opacity-50"
                    >
                      {addingMember ? 'Adding...' : 'Confirm Member'}
                    </button>
                  </div>
                </form>
              )}

              {/* Members List */}
              {activeMembers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/[0.08] p-5 text-center text-[12.5px] text-neutral-500">
                  No active team members on this project yet. Add at least one member to satisfy the Team check.
                </div>
              ) : (
                <div className="divide-y divide-white/[0.04]">
                  {activeMembers.map(m => (
                    <div key={m.id} className="py-2.5 flex items-center justify-between text-[12.5px]">
                      <div>
                        <span className="font-medium text-white">{data.userLabels[m.userId] || m.userId}</span>
                        <span className="text-neutral-500 ml-2">({m.role || 'Member'})</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-neutral-400 tabular-nums">{m.allocationPercent ?? 100}% allocation</span>
                        <Link
                          href="/dashboard/agency/rate-cards"
                          className="text-[11px] text-sky-400 hover:underline"
                          title="Cost rates resolve via rate card assignments"
                        >
                          Cost card &rarr;
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Work Items Card */}
            <div id="work-section" className="rounded-xl border border-white/[0.06] bg-[#050505] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.05] pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <ListTodo className="w-4 h-4 text-neutral-400" />
                    <h3 className="text-[14px] font-semibold text-white">Open Work Items</h3>
                  </div>
                  <p className="text-[12px] text-neutral-500 mt-0.5">
                    {openWorkItems.length} open work item(s). Satisfies Financial Readiness check #10 (Work Items).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/dashboard/agency/projects/${project.id}?tab=work-items`}
                    className="text-[12px] text-neutral-400 hover:text-white underline underline-offset-2 flex items-center gap-1"
                  >
                    Full Work Tab <ExternalLink className="w-3 h-3" />
                  </Link>
                  {canManage && !showAddWork && (
                    <button
                      type="button"
                      onClick={() => setShowAddWork(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/[0.08] hover:bg-white/[0.12] text-white text-[12px] font-medium transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Work Item
                    </button>
                  )}
                </div>
              </div>

              {/* Inline Add Work Item Form */}
              {showAddWork && (
                <form onSubmit={handleQuickAddWork} className="rounded-lg bg-white/[0.03] border border-white/[0.08] p-3.5 space-y-3">
                  <div className="text-[12px] font-medium text-white flex items-center justify-between">
                    <span>Quick Add Work Item</span>
                    <button type="button" onClick={() => setShowAddWork(false)} className="text-neutral-500 hover:text-white">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Item Name <Req /></label>
                      <input
                        type="text"
                        value={newWorkName}
                        onChange={e => setNewWorkName(e.target.value)}
                        placeholder="e.g. Design Wireframes, Backend Setup"
                        className={inputCls}
                        required
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Assignee <Opt /></label>
                      <Select
                        value={newWorkAssignedTo}
                        onChange={e => setNewWorkAssignedTo(e.target.value)}
                        className={inputCls}
                      >
                        <option value="">Unassigned</option>
                        {activeMembers.map(m => (
                          <option key={m.userId} value={m.userId}>{data.userLabels[m.userId] || m.userId}</option>
                        ))}
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddWork(false)}
                      className="px-3 py-1.5 rounded border border-white/[0.08] text-[12px] text-neutral-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={addingWork || !newWorkName.trim()}
                      className="px-3 py-1.5 rounded bg-white text-black text-[12px] font-semibold hover:bg-neutral-200 disabled:opacity-50"
                    >
                      {addingWork ? 'Creating...' : 'Create Item'}
                    </button>
                  </div>
                </form>
              )}

              {/* Work Items List */}
              {openWorkItems.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/[0.08] p-5 text-center text-[12.5px] text-neutral-500">
                  No open work items to log time against. Create at least one work item to satisfy the Work Items check.
                </div>
              ) : (
                <div className="divide-y divide-white/[0.04]">
                  {openWorkItems.slice(0, 5).map(w => (
                    <div key={w.id} className="py-2.5 flex items-center justify-between text-[12.5px]">
                      <div>
                        <span className="font-medium text-white">{w.name}</span>
                        <span className="text-neutral-500 ml-2">({w.status})</span>
                      </div>
                      <div className="text-neutral-400">
                        {w.assignedTo ? (data.userLabels[w.assignedTo] || 'Assigned') : 'Unassigned'}
                      </div>
                    </div>
                  ))}
                  {openWorkItems.length > 5 && (
                    <div className="pt-2 text-[11px] text-neutral-500 text-center">
                      + {openWorkItems.length - 5} more items in the Work tab
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Lifecycle / Activation Card */}
            <div id="lifecycle-section" className="rounded-xl border border-white/[0.06] bg-[#050505] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Play className="w-4 h-4 text-neutral-400" />
                  <h3 className="text-[14px] font-semibold text-white">Project Lifecycle (Check #9)</h3>
                </div>
                <ProjectStatusBadge status={project.status} size="sm" />
              </div>
              <p className="text-[12.5px] text-neutral-400">
                Time tracking targets ACTIVE projects (§126). Current status is <strong className="text-white">{project.status}</strong>.
              </p>
              {canManage && canTransitionProjectStatus(project.status, 'ACTIVE') && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleActivate}
                    disabled={activating}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 text-black text-[12.5px] font-semibold hover:bg-emerald-400 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    <Play className="w-3.5 h-3.5" /> {activating ? 'Activating...' : 'Activate Project Now'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Financial Readiness Companion Sidebar (4 cols, Sticky) */}
        <div className="lg:col-span-4 lg:sticky lg:top-6 space-y-4">
          <div className="rounded-xl border border-white/[0.08] bg-[#050505] p-5 space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-white/[0.05] pb-3">
              <div>
                <h3 className="text-[13px] font-semibold text-white tracking-tight uppercase">Financial Readiness</h3>
                <p className="text-[11px] text-neutral-500">Live 10-point check verification</p>
              </div>
              {dynamicReadiness && (
                <div className="text-right">
                  <span className={`text-[15px] font-bold tabular-nums ${dynamicReadiness.allReady ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {dynamicReadiness.readyCount} / {dynamicReadiness.totalCount}
                  </span>
                  <span className="block text-[10px] uppercase tracking-wider text-neutral-500">Checks ready</span>
                </div>
              )}
            </div>

            {/* Progress Bar */}
            {dynamicReadiness && (
              <div className="w-full bg-white/[0.06] rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${dynamicReadiness.allReady ? 'bg-emerald-400' : 'bg-amber-400'}`}
                  style={{ width: `${(dynamicReadiness.readyCount / dynamicReadiness.totalCount) * 100}%` }}
                />
              </div>
            )}

            {/* 10-Check List with Actions */}
            {dynamicReadiness && (
              <ul className="space-y-2.5 text-[12px]">
                {dynamicReadiness.checks.map(c => (
                  <li key={c.key} className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-2.5 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-medium">
                        {c.ready ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <TriangleAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        )}
                        <span className={c.ready ? 'text-white' : 'text-amber-300'}>{c.label}</span>
                      </div>

                      {/* Action Link / Anchor */}
                      {c.anchor ? (
                        <a
                          href={c.anchor}
                          className="text-[11px] text-neutral-400 hover:text-white underline underline-offset-2 shrink-0"
                        >
                          {c.actionLabel || 'Configure'}
                        </a>
                      ) : c.actionHref ? (
                        <Link
                          href={c.actionHref}
                          className="text-[11px] text-neutral-400 hover:text-white underline underline-offset-2 shrink-0 inline-flex items-center gap-0.5"
                          target={c.actionHref.startsWith('http') ? '_blank' : undefined}
                        >
                          {c.actionLabel || 'Manage'} <ExternalLink className="w-2.5 h-2.5" />
                        </Link>
                      ) : null}
                    </div>
                    <p className={`text-[11px] pl-5 ${c.ready ? 'text-neutral-400' : 'text-neutral-400'}`}>
                      {c.detail}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            <div className="pt-2 border-t border-white/[0.05] text-[11px] text-neutral-500 leading-relaxed">
              <Info className="w-3.5 h-3.5 inline mr-1 text-neutral-400" />
              Warnings never block creation or edits. They signal where future time entries would resolve to &ldquo;not configured&rdquo; instead of financial data (§96/§127).
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
