/**
 * Module 4 (§8–§18) — Unit: work-item model, state machine and validation.
 *
 * Pure logic only — the repository and API edges are covered by the
 * integration suite. Focus:
 *   - §11 state machine: forward one step, DONE reopens to IN_PROGRESS,
 *     any non-archived state archives, ARCHIVED terminal
 *   - §9 minutes: deterministic internal storage; legacy decimal-hours
 *     input converts losslessly at the validator boundary
 *   - §18 validation rules: bounded name, estimatedMinutes >= 0,
 *     sortOrder >= 0, both-estimate-fields rejected
 */
import { describe, expect, it } from 'vitest';
import {
  canTransitionWorkItemStatus, WORK_ITEM_STATUSES,
} from '@/lib/agency/types/project';
import { validateWorkItem } from '@/lib/agency/validators/project';

describe('Module 4 §11 — work-item state machine', () => {
  it('allows the forward progression NOT_STARTED → IN_PROGRESS → DONE', () => {
    expect(canTransitionWorkItemStatus('NOT_STARTED', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionWorkItemStatus('IN_PROGRESS', 'DONE')).toBe(true);
  });

  it('forbids skipping steps (NOT_STARTED → DONE)', () => {
    expect(canTransitionWorkItemStatus('NOT_STARTED', 'DONE')).toBe(false);
  });

  it('allows reopening DONE → IN_PROGRESS (client changes)', () => {
    expect(canTransitionWorkItemStatus('DONE', 'IN_PROGRESS')).toBe(true);
  });

  it('allows archiving from any non-archived state', () => {
    expect(canTransitionWorkItemStatus('NOT_STARTED', 'ARCHIVED')).toBe(true);
    expect(canTransitionWorkItemStatus('IN_PROGRESS', 'ARCHIVED')).toBe(true);
    expect(canTransitionWorkItemStatus('DONE', 'ARCHIVED')).toBe(true);
  });

  it('ARCHIVED is terminal', () => {
    expect(canTransitionWorkItemStatus('ARCHIVED', 'IN_PROGRESS')).toBe(false);
    expect(canTransitionWorkItemStatus('ARCHIVED', 'DONE')).toBe(false);
    expect(canTransitionWorkItemStatus('ARCHIVED', 'NOT_STARTED')).toBe(false);
    expect(canTransitionWorkItemStatus('ARCHIVED', 'ARCHIVED')).toBe(false);
  });

  it('backwards IN_PROGRESS → NOT_STARTED is not a Phase 1 transition', () => {
    expect(canTransitionWorkItemStatus('IN_PROGRESS', 'NOT_STARTED')).toBe(false);
  });

  it('exposes exactly the four §10 statuses — no arbitrary user statuses', () => {
    expect(WORK_ITEM_STATUSES).toEqual(['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'ARCHIVED']);
  });
});

describe('Module 4 §9/§18 — estimatedMinutes validation', () => {
  it('stores minutes directly', () => {
    const result = validateWorkItem({ name: 'QA', estimatedMinutes: 90 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.estimatedMinutes).toBe(90);
  });

  it('converts legacy decimal hours losslessly — 1.5h is exactly 90m', () => {
    const result = validateWorkItem({ name: 'QA', estimatedHours: 1.5 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.estimatedMinutes).toBe(90);
  });

  it('converts 8h to 480m and 0.25h to 15m', () => {
    const a = validateWorkItem({ name: 'QA', estimatedHours: 8 });
    const b = validateWorkItem({ name: 'QA', estimatedHours: 0.25 });
    expect(a.ok && a.value.estimatedMinutes).toBe(480);
    expect(b.ok && b.value.estimatedMinutes).toBe(15);
  });

  it('never stores the legacy field', () => {
    const result = validateWorkItem({ name: 'QA', estimatedHours: 2 });
    expect(result.ok).toBe(true);
    if (result.ok) expect('estimatedHours' in result.value).toBe(false);
  });

  it('rejects both estimate fields at once (ambiguous)', () => {
    expect(validateWorkItem({ name: 'QA', estimatedMinutes: 90, estimatedHours: 1.5 }).ok).toBe(false);
  });

  it('rejects negative minutes and non-integer minutes', () => {
    expect(validateWorkItem({ name: 'QA', estimatedMinutes: -1 }).ok).toBe(false);
    expect(validateWorkItem({ name: 'QA', estimatedMinutes: 90.5 }).ok).toBe(false);
  });

  it('zero minutes is legal (explicitly unplanned work)', () => {
    expect(validateWorkItem({ name: 'QA', estimatedMinutes: 0 }).ok).toBe(true);
  });
});

describe('Module 4 §18 — name and sortOrder validation', () => {
  it('name is required and bounded', () => {
    expect(validateWorkItem({}).ok).toBe(false);
    expect(validateWorkItem({ name: '' }).ok).toBe(false);
    expect(validateWorkItem({ name: 'x'.repeat(121) }).ok).toBe(false);
    expect(validateWorkItem({ name: 'Design homepage' }).ok).toBe(true);
  });

  it('sortOrder must be a non-negative integer', () => {
    expect(validateWorkItem({ name: 'A', sortOrder: -1 }).ok).toBe(false);
    expect(validateWorkItem({ name: 'A', sortOrder: 1.5 }).ok).toBe(false);
    expect(validateWorkItem({ name: 'A', sortOrder: 3 }).ok).toBe(true);
  });

  it('carries assignee and status through when provided', () => {
    const result = validateWorkItem({ name: 'A', assignedTo: 'u-1', status: 'IN_PROGRESS' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.assignedTo).toBe('u-1');
      expect(result.value.status).toBe('IN_PROGRESS');
    }
  });

  it('an explicit empty assignee CLEARS the assignment (§16 unassign via PATCH)', () => {
    // Regression (Module 4 final audit): the generic string helper used to
    // strip '' to "absent", silently dropping the unassignment.
    const result = validateWorkItem({ name: 'A', assignedTo: '' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.assignedTo).toBe('');
  });

  it('assignee is bounded — an over-long id is rejected', () => {
    expect(validateWorkItem({ name: 'A', assignedTo: 'u'.repeat(101) }).ok).toBe(false);
  });
});
