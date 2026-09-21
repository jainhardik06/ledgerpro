import { describe, it, expect } from 'vitest';
import React from 'react';
import { Req, Opt } from '@/components/ui/Req';

describe('Req & Opt component indicators', () => {
  it('renders red text-rose-400 by default when satisfied is false or omitted', () => {
    const defaultEl = Req({});
    expect(defaultEl.props.className).toContain('text-rose-400');
    expect(defaultEl.props.title).toBe('Required field');

    const explicitFalseEl = Req({ satisfied: false });
    expect(explicitFalseEl.props.className).toContain('text-rose-400');
    expect(explicitFalseEl.props.title).toBe('Required field');
  });

  it('renders emerald text-emerald-400 when satisfied is true', () => {
    const satisfiedEl = Req({ satisfied: true });
    expect(satisfiedEl.props.className).toContain('text-emerald-400');
    expect(satisfiedEl.props.title).toBe('Field completed');
  });

  it('renders Opt badge with optional label', () => {
    const optEl = Opt({});
    expect(optEl.props.children).toBe('(optional)');
    expect(optEl.props.className).toContain('text-neutral-500');
  });
});
