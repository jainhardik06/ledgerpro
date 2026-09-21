import { describe, it, expect } from 'vitest';
import React from 'react';
import { ProjectStatusBadge } from '@/components/agency/projects/ProjectStatusBadge';

describe('ProjectStatusBadge', () => {
  it('highlights ACTIVE status in green', () => {
    const el = ProjectStatusBadge({ status: 'ACTIVE' });
    expect(el.props['data-status']).toBe('ACTIVE');
    expect(el.props.className).toContain('text-emerald-400');
    expect(el.props.className).toContain('bg-emerald-500/10');
  });

  it('highlights ON_HOLD (paused) status in yellow/amber and displays PAUSED', () => {
    const el = ProjectStatusBadge({ status: 'ON_HOLD' });
    expect(el.props['data-status']).toBe('ON_HOLD');
    expect(el.props.className).toContain('text-amber-300');
    expect(el.props.className).toContain('bg-amber-500/10');
    // Finds label child
    const children = React.Children.toArray(el.props.children);
    const labelSpan = children.find(
      (c: any) => c.type === 'span' && c.props.children === 'PAUSED'
    );
    expect(labelSpan).toBeDefined();
  });

  it('highlights CANCELLED status in reddish / rose', () => {
    const el = ProjectStatusBadge({ status: 'CANCELLED' });
    expect(el.props['data-status']).toBe('CANCELLED');
    expect(el.props.className).toContain('text-rose-400');
    expect(el.props.className).toContain('bg-rose-500/10');
  });

  it('highlights DRAFT status in greyish / neutral', () => {
    const el = ProjectStatusBadge({ status: 'DRAFT' });
    expect(el.props['data-status']).toBe('DRAFT');
    expect(el.props.className).toContain('text-neutral-400');
    expect(el.props.className).toContain('bg-neutral-500/10');
  });

  it('highlights COMPLETED in sky/blue and ARCHIVED in muted grey', () => {
    const completedEl = ProjectStatusBadge({ status: 'COMPLETED' });
    expect(completedEl.props.className).toContain('text-sky-400');

    const archivedEl = ProjectStatusBadge({ status: 'ARCHIVED' });
    expect(archivedEl.props.className).toContain('text-neutral-500');
  });

  it('supports size="md" and hiding dot indicator', () => {
    const el = ProjectStatusBadge({ status: 'ACTIVE', size: 'md', showDot: false });
    expect(el.props.className).toContain('text-[11.5px]');
    const children = React.Children.toArray(el.props.children).filter(Boolean);
    // When showDot is false, only the label span is rendered
    expect(children.length).toBe(1);
  });
});
