/**
 * Module 3 (Steps 3.1–3.9) — unit: project domain types + integrity layer.
 *
 * Covers:
 *   §41  status transition matrix (incl. the COMPLETED→ACTIVE reopen rule)
 *   §46  milestone amount XOR percentage
 *   §54/§66 planned margin calculation (the §54 budget-vs-target math)
 *   §49/§72 project smart defaults from the client's commercialDefaults
 *   §80  Project → Client same tenant (missing and cross-tenant look IDENTICAL, §113)
 *   §81  Project → Manager / Members same tenant
 */
import { describe, it, expect } from 'vitest';
import {
  canTransitionProjectStatus, PROJECT_STATUSES, DEFAULT_PROJECT_STATUS,
  canTransitionMilestoneStatus, MILESTONE_STATUSES,
  milestoneHasSingleCommercialDefinition,
} from '@/lib/agency/types/project';
import {
  checkProjectClientIntegrity, checkProjectUserIntegrity, verifyProjectIntegrity,
} from '@/lib/agency/domain/project-integrity';
import {
  validateProjectCreate, validateProjectUpdate, validateProjectMember,
  validateWorkItem, validateProjectMilestone, validateMilestoneUpdate,
} from '@/lib/agency/validators/project';
import { applyClientCommercialDefaults } from '@/lib/agency/defaults/project-defaults';

describe('Module 3 unit — project status lifecycle (§41)', () => {
  it('defaults new projects to DRAFT (§74)', () => {
    expect(DEFAULT_PROJECT_STATUS).toBe('DRAFT');
  });

  it('allows DRAFT → ACTIVE and DRAFT → CANCELLED only', () => {
    expect(canTransitionProjectStatus('DRAFT', 'ACTIVE')).toBe(true);
    expect(canTransitionProjectStatus('DRAFT', 'CANCELLED')).toBe(true);
    expect(canTransitionProjectStatus('DRAFT', 'COMPLETED')).toBe(false);
    expect(canTransitionProjectStatus('DRAFT', 'ON_HOLD')).toBe(false);
    expect(canTransitionProjectStatus('DRAFT', 'ARCHIVED')).toBe(false);
  });

  it('allows ACTIVE ⇄ ON_HOLD and ACTIVE → COMPLETED/CANCELLED', () => {
    expect(canTransitionProjectStatus('ACTIVE', 'ON_HOLD')).toBe(true);
    expect(canTransitionProjectStatus('ON_HOLD', 'ACTIVE')).toBe(true);
    expect(canTransitionProjectStatus('ACTIVE', 'COMPLETED')).toBe(true);
    expect(canTransitionProjectStatus('ON_HOLD', 'COMPLETED')).toBe(true);
    expect(canTransitionProjectStatus('ACTIVE', 'CANCELLED')).toBe(true);
    expect(canTransitionProjectStatus('ON_HOLD', 'CANCELLED')).toBe(true);
  });

  it('allows COMPLETED → ARCHIVED and the explicit reopen COMPLETED → ACTIVE', () => {
    expect(canTransitionProjectStatus('COMPLETED', 'ARCHIVED')).toBe(true);
    // §41 — never automatic; only reachable via the explicit activate action
    expect(canTransitionProjectStatus('COMPLETED', 'ACTIVE')).toBe(true);
  });

  it('makes CANCELLED and ARCHIVED terminal in Phase 1', () => {
    for (const to of PROJECT_STATUSES) {
      expect(canTransitionProjectStatus('CANCELLED', to)).toBe(false);
      expect(canTransitionProjectStatus('ARCHIVED', to)).toBe(false);
    }
  });

  it('never allows a same-state transition', () => {
    for (const s of PROJECT_STATUSES) {
      expect(canTransitionProjectStatus(s, s)).toBe(false);
    }
  });
});

describe('Module 3 unit — milestone commercial definition (§46)', () => {
  it('accepts amount alone or percentage alone', () => {
    expect(milestoneHasSingleCommercialDefinition({ amount: 150000 })).toBe(true);
    expect(milestoneHasSingleCommercialDefinition({ percentage: 30 })).toBe(true);
  });

  it('rejects both set, neither set, and null-valued fields', () => {
    expect(milestoneHasSingleCommercialDefinition({ amount: 100, percentage: 30 })).toBe(false);
    expect(milestoneHasSingleCommercialDefinition({})).toBe(false);
    expect(milestoneHasSingleCommercialDefinition({ amount: null, percentage: null })).toBe(false);
  });
});

describe('Module 3 unit — project → client integrity (§80/§113)', () => {
  const TENANT_A = 'tenant-a';
  const TENANT_B = 'tenant-b';

  it('passes when the client belongs to the same tenant', () => {
    expect(checkProjectClientIntegrity({ tenantId: TENANT_A }, TENANT_A)).toEqual({ ok: true });
  });

  it('fails a missing client', () => {
    expect(checkProjectClientIntegrity(null, TENANT_A).ok).toBe(false);
    expect(checkProjectClientIntegrity(undefined, TENANT_A).ok).toBe(false);
  });

  it('fails a cross-tenant client with the SAME error as a missing one (§113)', () => {
    const missing = checkProjectClientIntegrity(null, TENANT_A);
    const crossTenant = checkProjectClientIntegrity({ tenantId: TENANT_B }, TENANT_A);
    expect(crossTenant.ok).toBe(false);
    expect(crossTenant).toEqual(missing); // identical shape — no existence leak
  });
});

describe('Module 3 unit — project → user integrity (§81)', () => {
  const TENANT_A = 'tenant-a';

  it('passes a same-tenant manager/member', () => {
    expect(checkProjectUserIntegrity({ tenantId: TENANT_A }, TENANT_A, 'project manager')).toEqual({ ok: true });
  });

  it('fails a missing or cross-tenant user', () => {
    expect(checkProjectUserIntegrity(null, TENANT_A).ok).toBe(false);
    expect(checkProjectUserIntegrity({ tenantId: 'other' }, TENANT_A, 'project manager').ok).toBe(false);
  });

  it('names the context in the error (manager vs member)', () => {
    const manager = checkProjectUserIntegrity(null, TENANT_A, 'project manager');
    expect(manager.ok).toBe(false);
    if (!manager.ok) expect(manager.error).toContain('project manager');
  });

  it('gates work item assignees through the same integrity check (Module 4 §12/§15)', () => {
    expect(checkProjectUserIntegrity({ tenantId: TENANT_A }, TENANT_A, 'work item assignee')).toEqual({ ok: true });
    const rejected = checkProjectUserIntegrity(null, TENANT_A, 'work item assignee');
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error).toContain('work item assignee');
    // §113 — a cross-tenant assignee is indistinguishable from a missing one
    const crossTenant = checkProjectUserIntegrity({ tenantId: 'tenant-b' }, TENANT_A, 'work item assignee');
    expect(crossTenant).toEqual(rejected);
  });
});

describe('Module 3 unit — composite pre-write gate (§114)', () => {
  const TENANT_A = 'tenant-a';

  it('returns no errors when every reference is same-tenant', () => {
    const errors = verifyProjectIntegrity({
      tenantId: TENANT_A,
      client: { tenantId: TENANT_A },
      manager: { tenantId: TENANT_A },
      members: [{ tenantId: TENANT_A }, { tenantId: TENANT_A }],
    });
    expect(errors).toEqual([]);
  });

  it('collects EVERY violation, not just the first', () => {
    const errors = verifyProjectIntegrity({
      tenantId: TENANT_A,
      client: { tenantId: 'tenant-b' },
      manager: { tenantId: 'tenant-c' },
      members: [{ tenantId: TENANT_A }, null],
    });
    expect(errors).toHaveLength(3); // client + manager + one member
    expect(errors.join(' ')).toContain('client');
    expect(errors.join(' ')).toContain('project manager');
    expect(errors.join(' ')).toContain('project member');
  });

  it('skips the manager check when no manager is referenced', () => {
    const errors = verifyProjectIntegrity({
      tenantId: TENANT_A,
      client: { tenantId: TENANT_A },
      manager: undefined,
    });
    expect(errors).toEqual([]);
  });

  it('rejects a project whose client is another tenant\'s — the §80 core case', () => {
    const errors = verifyProjectIntegrity({
      tenantId: TENANT_A,
      client: { tenantId: 'tenant-b' },
    });
    expect(errors).toHaveLength(1);
    // §113 — the message must not reveal WHERE the client lives
    expect(errors[0]).not.toContain('tenant-b');
  });
});

describe('Module 3 unit — commercial validation (§100/§73)', () => {
  const base = {
    clientId: 'cl-1', name: 'Website Redesign', billingModel: 'FIXED_FEE', currency: 'INR',
  };

  it('accepts the required commercial core', () => {
    const r = validateProjectCreate(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe('Website Redesign');
      expect(r.value.currency).toBe('INR');
    }
  });

  it('requires client, name, billing model and currency (§37)', () => {
    const r = validateProjectCreate({});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const fields = r.errors.map(e => e.field);
      expect(fields).toEqual(expect.arrayContaining(['clientId', 'name', 'billingModel', 'currency']));
    }
  });

  it('normalizes currency to uppercase and rejects non-ISO codes', () => {
    const r = validateProjectCreate({ ...base, currency: 'inr' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.currency).toBe('INR');
    expect(validateProjectCreate({ ...base, currency: 'rupees' }).ok).toBe(false);
  });

  it('rejects negative money and hours (§73)', () => {
    expect(validateProjectCreate({ ...base, contractValue: -1 }).ok).toBe(false);
    expect(validateProjectCreate({ ...base, revenueBudget: -5000 }).ok).toBe(false);
    expect(validateProjectCreate({ ...base, budgetCost: -0.01 }).ok).toBe(false);
    expect(validateProjectCreate({ ...base, plannedHours: -8 }).ok).toBe(false);
  });

  it('rejects targetMargin outside 0–100 (§73)', () => {
    expect(validateProjectCreate({ ...base, targetMargin: -5 }).ok).toBe(false);
    expect(validateProjectCreate({ ...base, targetMargin: 101 }).ok).toBe(false);
    expect(validateProjectCreate({ ...base, targetMargin: 100 }).ok).toBe(true);
    expect(validateProjectCreate({ ...base, targetMargin: 0 }).ok).toBe(true);
  });

  it('rejects endDate before startDate (§73)', () => {
    expect(validateProjectCreate({ ...base, startDate: '2026-03-01', endDate: '2026-02-01' }).ok).toBe(false);
    expect(validateProjectCreate({ ...base, startDate: '2026-02-01', endDate: '2026-03-01' }).ok).toBe(true);
  });

  it('rejects malformed dates', () => {
    expect(validateProjectCreate({ ...base, startDate: 'March 1' }).ok).toBe(false);
  });

  it('blocks a status smuggle through create — lifecycle actions own status (§41)', () => {
    const r = validateProjectCreate({ ...base, status: 'ACTIVE' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].message).toContain('activate');
  });

  it('WARNS (not rejects) on fixed-fee without contract value (§73/§74)', () => {
    const r = validateProjectCreate({ ...base });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.some(w => w.toLowerCase().includes('contract value'))).toBe(true);
  });

  it('WARNS when the target margin exceeds what the budget allows (§54)', () => {
    const r = validateProjectCreate({ ...base, revenueBudget: 500000, budgetCost: 400000, targetMargin: 50 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.some(w => w.includes('target margin'))).toBe(true);
  });

  it('does not warn when the margin is consistent (§55: 500k/300k = 40%)', () => {
    const r = validateProjectCreate({ ...base, revenueBudget: 500000, budgetCost: 300000, targetMargin: 40 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toHaveLength(0);
  });

  it('WARNS on T&M without planned hours (§75 recommended)', () => {
    const r = validateProjectCreate({ ...base, billingModel: 'TIME_AND_MATERIALS' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.some(w => w.includes('planned hours'))).toBe(true);
  });

  it('accepts a partial update with no core fields (draft configure-later)', () => {
    const r = validateProjectUpdate({ description: 'Discovery phase' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.description).toBe('Discovery phase');
  });

  it('rejects a status smuggle through update too', () => {
    expect(validateProjectUpdate({ status: 'COMPLETED' }).ok).toBe(false);
  });

  it('deduplicates and bounds tags', () => {
    const r = validateProjectCreate({ ...base, tags: ['Website', 'Website', 'Retainer'] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.tags).toEqual(['Website', 'Retainer']);
    expect(validateProjectCreate({ ...base, tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }).ok).toBe(false);
  });
});

describe('Module 3 unit — member, work item, milestone validation', () => {
  it('validates members: userId required, allocation strictly 0 < x <= 100 (Module 5 §35)', () => {
    expect(validateProjectMember({ userId: 'u-1' }).ok).toBe(true);
    expect(validateProjectMember({ role: 'Designer' }).ok).toBe(false);
    expect(validateProjectMember({ userId: 'u-1', allocationPercent: 100 }).ok).toBe(true);
    expect(validateProjectMember({ userId: 'u-1', allocationPercent: 101 }).ok).toBe(false);
    // §35 — 0 is NOT a valid allocation (it means "not on the project").
    expect(validateProjectMember({ userId: 'u-1', allocationPercent: 0 }).ok).toBe(false);
    expect(validateProjectMember({ userId: 'u-1', allocationPercent: -10 }).ok).toBe(false);
  });

  it('a PATCH that strips every field degrades to an honest empty update (Module 5 final audit)', () => {
    // The domain merges the row's userId, so {role: ""} becomes
    // {userId, role: ""} — the validator drops the trimmed-empty role and
    // the domain then 400s "No valid member fields provided" rather than
    // silently writing nothing. Locked in as the intended behavior.
    const r = validateProjectMember({ userId: 'u-1', role: '' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.role).toBeUndefined();
  });

  it('validates work items: name required, estimates non-negative (§61 + Module 4 §18)', () => {
    expect(validateWorkItem({ name: 'Sitemap' }).ok).toBe(true);
    expect(validateWorkItem({}).ok).toBe(false);
    expect(validateWorkItem({ name: 'Sitemap', estimatedHours: -4 }).ok).toBe(false);
    expect(validateWorkItem({ name: 'Sitemap', estimatedMinutes: -4 }).ok).toBe(false);
    expect(validateWorkItem({ name: 'Sitemap', status: 'DONE' }).ok).toBe(true);
    expect(validateWorkItem({ name: 'Sitemap', status: 'BLOCKED' }).ok).toBe(false);
    expect(validateWorkItem({ name: 'Sitemap', status: 'ARCHIVED' }).ok).toBe(true);
  });

  it('validates milestones: sequence required, XOR enforced (§46)', () => {
    expect(validateProjectMilestone({ name: 'Kickoff', sequence: 1, amount: 150000 }).ok).toBe(true);
    expect(validateProjectMilestone({ name: 'Kickoff', sequence: 1, percentage: 30 }).ok).toBe(true);
    expect(validateProjectMilestone({ name: 'Kickoff', sequence: 1, amount: 1, percentage: 30 }).ok).toBe(false);
    expect(validateProjectMilestone({ name: 'Kickoff', sequence: 1 }).ok).toBe(false);
    expect(validateProjectMilestone({ name: 'Kickoff', sequence: 0, percentage: 30 }).ok).toBe(false);
    expect(validateProjectMilestone({ name: 'Kickoff', sequence: 1, percentage: 0 }).ok).toBe(false);
    expect(validateProjectMilestone({ name: 'Kickoff', sequence: 1, percentage: 101 }).ok).toBe(false);
  });
});

describe('Module 3 unit — planned margin calculation (§54/§66, Step 3.9)', () => {
  const base = {
    clientId: 'cl-1', name: 'Website Redesign', billingModel: 'FIXED_FEE', currency: 'INR',
  };

  it('computes the expected margin as (revenue − cost) / revenue × 100 (§55)', () => {
    // 500k − 300k over 500k = exactly 40% — consistent, so NO warning
    const exact = validateProjectCreate({ ...base, revenueBudget: 500000, budgetCost: 300000, targetMargin: 40 });
    expect(exact.ok).toBe(true);
    if (exact.ok) expect(exact.warnings).toHaveLength(0);
  });

  it('warns when the target exceeds the budget by even a fraction (boundary)', () => {
    // 100k − 33.3k over 100k = 66.7% — a 67% target is impossible
    const r = validateProjectCreate({ ...base, revenueBudget: 100000, budgetCost: 33300, targetMargin: 67 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const w = r.warnings.find(w => w.includes('target margin'));
      expect(w).toBeDefined();
      expect(w).toContain('66.7%'); // the math is surfaced, rounded to 1 decimal
    }
  });

  it('does not compute a margin without a positive revenue budget (division guard)', () => {
    // revenue 0 — the §6 no-baseline rule: undefined by division, never NaN
    const r = validateProjectCreate({ ...base, revenueBudget: 0, budgetCost: 50000, targetMargin: 10 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.some(w => w.includes('target margin'))).toBe(false);
  });

  it('does not compute a margin when either baseline is missing', () => {
    const noCost = validateProjectCreate({ ...base, revenueBudget: 500000, targetMargin: 40 });
    expect(noCost.ok).toBe(true);
    if (noCost.ok) expect(noCost.warnings.some(w => w.includes('target margin'))).toBe(false);
    const noRevenue = validateProjectCreate({ ...base, budgetCost: 300000, targetMargin: 40 });
    expect(noRevenue.ok).toBe(true);
    if (noRevenue.ok) expect(noRevenue.warnings.some(w => w.includes('target margin'))).toBe(false);
  });

  it('a 100% cost budget is legal and yields a 0% expected margin', () => {
    const r = validateProjectCreate({ ...base, revenueBudget: 500000, budgetCost: 500000, targetMargin: 0 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.some(w => w.includes('target margin'))).toBe(false);
  });
});

describe('Module 3 unit — project smart defaults (§49/§72, Step 3.9)', () => {
  it('pre-fills empty draft fields from the client commercialDefaults', () => {
    const result = applyClientCommercialDefaults(
      { currency: '', billingModel: '' },
      { commercialDefaults: { currency: 'USD', billingModel: 'MILESTONE' }, billingProfile: { currency: 'INR' } }
    );
    expect(result).toEqual({ currency: 'USD', billingModel: 'MILESTONE' });
  });

  it('never overwrites an explicit user choice (§49 — a default is not a constraint)', () => {
    const result = applyClientCommercialDefaults(
      { currency: 'EUR', billingModel: 'FIXED_FEE' },
      { commercialDefaults: { currency: 'USD', billingModel: 'MILESTONE' } }
    );
    expect(result).toEqual({ currency: 'EUR', billingModel: 'FIXED_FEE' });
  });

  it('falls back to the billing profile currency when no commercial default exists', () => {
    const result = applyClientCommercialDefaults(
      { currency: '', billingModel: '' },
      { billingProfile: { currency: 'INR' } }
    );
    expect(result.currency).toBe('INR');
    expect(result.billingModel).toBe('');
  });

  it('mixes independently: user currency kept, model defaulted', () => {
    const result = applyClientCommercialDefaults(
      { currency: 'GBP', billingModel: '' },
      { commercialDefaults: { currency: 'USD', billingModel: 'TIME_AND_MATERIALS' } }
    );
    expect(result).toEqual({ currency: 'GBP', billingModel: 'TIME_AND_MATERIALS' });
  });

  it('leaves the draft untouched for a client with no defaults at all', () => {
    const result = applyClientCommercialDefaults({ currency: '', billingModel: '' }, {});
    expect(result).toEqual({ currency: '', billingModel: '' });
    // A missing client (cleared selection) changes nothing either
    expect(applyClientCommercialDefaults({ currency: 'INR', billingModel: '' }, null))
      .toEqual({ currency: 'INR', billingModel: '' });
  });
});

describe('Module 3 unit — milestone status lifecycle (§41)', () => {
  it('allows PLANNED → IN_PROGRESS and PLANNED → CANCELLED only', () => {
    expect(canTransitionMilestoneStatus('PLANNED', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionMilestoneStatus('PLANNED', 'CANCELLED')).toBe(true);
    expect(canTransitionMilestoneStatus('PLANNED', 'COMPLETED')).toBe(false);
  });

  it('allows IN_PROGRESS ⇄ PLANNED and IN_PROGRESS → COMPLETED/CANCELLED', () => {
    expect(canTransitionMilestoneStatus('IN_PROGRESS', 'COMPLETED')).toBe(true);
    expect(canTransitionMilestoneStatus('IN_PROGRESS', 'PLANNED')).toBe(true);
    expect(canTransitionMilestoneStatus('IN_PROGRESS', 'CANCELLED')).toBe(true);
  });

  it('allows COMPLETED → IN_PROGRESS (explicit reopen) and forbids other jumps', () => {
    expect(canTransitionMilestoneStatus('COMPLETED', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionMilestoneStatus('COMPLETED', 'PLANNED')).toBe(false);
    expect(canTransitionMilestoneStatus('COMPLETED', 'CANCELLED')).toBe(false);
  });

  it('makes CANCELLED terminal', () => {
    for (const to of MILESTONE_STATUSES) {
      expect(canTransitionMilestoneStatus('CANCELLED', to)).toBe(false);
    }
  });
});

describe('Module 3 unit — validateMilestoneUpdate (PATCH)', () => {
  it('accepts a status-only patch payload without requiring name or sequence', () => {
    const res = validateMilestoneUpdate({ status: 'COMPLETED' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.status).toBe('COMPLETED');
      expect(res.value.name).toBeUndefined();
      expect(res.value.sequence).toBeUndefined();
    }
  });

  it('rejects an invalid milestone status', () => {
    const res = validateMilestoneUpdate({ status: 'INVALID_STATUS' });
    expect(res.ok).toBe(false);
  });

  it('enforces commercial XOR when amount and percentage are both passed', () => {
    const res = validateMilestoneUpdate({ amount: 5000, percentage: 50 });
    expect(res.ok).toBe(false);
  });

  it('accepts commercial amount without percentage', () => {
    const res = validateMilestoneUpdate({ amount: 5000 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.amount).toBe(5000);
    }
  });
});

