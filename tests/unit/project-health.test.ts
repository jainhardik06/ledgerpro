/**
 * Module 1.26 — Unit: health state (deterministic engine, Module 1.8).
 *
 * Pins the full rule table with exact boundaries:
 *   COMPLETED   > OVER_BUDGET > AT_RISK > WATCH > HEALTHY (residual)
 * and the null-baseline rule: missing data (margin null, burn null) never
 * forces a risk state — zero ≠ unavailable ≠ risk.
 */
import { describe, expect, it } from 'vitest';
import {
  computeProjectHealth,
  sortProjectsByHealth,
  HEALTH_DISPLAY_ORDER,
  DEFAULT_HEALTH_THRESHOLDS,
} from '@/lib/agency/domain/project-health';

describe('Module 1.26 unit — health rule table (exact boundaries)', () => {
  it('COMPLETED outranks every numeric rule, even over budget', () => {
    expect(computeProjectHealth({ budgetBurn: 1.5, margin: 0.0, completed: true })).toBe('COMPLETED');
  });

  it('OVER_BUDGET: burn > 100% of budget', () => {
    expect(computeProjectHealth({ budgetBurn: 1.01, margin: 0.5, completed: false })).toBe('OVER_BUDGET');
    expect(computeProjectHealth({ budgetBurn: 2.0, margin: 0.6, completed: false })).toBe('OVER_BUDGET');
  });

  it('AT_RISK: burn > 90% (with healthy margin)', () => {
    expect(computeProjectHealth({ budgetBurn: 0.91, margin: 0.5, completed: false })).toBe('AT_RISK');
  });

  it('AT_RISK: margin at/below the risk floor (15%), even with low burn', () => {
    expect(computeProjectHealth({ budgetBurn: 0.2, margin: 0.15, completed: false })).toBe('AT_RISK');
    expect(computeProjectHealth({ budgetBurn: 0.2, margin: 0.0, completed: false })).toBe('AT_RISK');
  });

  it('WATCH: burn in [75%, 90%] with acceptable margin', () => {
    expect(computeProjectHealth({ budgetBurn: 0.75, margin: 0.5, completed: false })).toBe('WATCH'); // boundary inclusive
    expect(computeProjectHealth({ budgetBurn: 0.90, margin: 0.5, completed: false })).toBe('WATCH'); // 0.90 is NOT > 0.90
  });

  it('WATCH: margin approaching the target floor (below 25%) with low burn', () => {
    expect(computeProjectHealth({ budgetBurn: 0.2, margin: 0.20, completed: false })).toBe('WATCH');
    expect(computeProjectHealth({ budgetBurn: 0.2, margin: 0.249, completed: false })).toBe('WATCH');
  });

  it('HEALTHY: burn < 75% AND margin >= target (40%)', () => {
    expect(computeProjectHealth({ budgetBurn: 0.74, margin: 0.40, completed: false })).toBe('HEALTHY');
    expect(computeProjectHealth({ budgetBurn: 0.10, margin: 0.60, completed: false })).toBe('HEALTHY');
  });

  it('margin between the watch floor and target (25%–40%) falls to the residual default', () => {
    // Not AT_RISK (margin > 15%), not WATCH (margin >= 25%), not the explicit
    // healthy branch (margin < 40%) — the documented residual default.
    expect(computeProjectHealth({ budgetBurn: 0.5, margin: 0.30, completed: false })).toBe('HEALTHY');
  });
});

describe('Module 1.26 unit — null baselines never fabricate risk', () => {
  it('margin null (Revenue = 0) + moderate burn → not forced into a risk state', () => {
    expect(computeProjectHealth({ budgetBurn: 0.5, margin: null, completed: false })).toBe('HEALTHY');
  });

  it('burn null (no budget baseline) + healthy margin → HEALTHY', () => {
    expect(computeProjectHealth({ budgetBurn: null, margin: 0.5, completed: false })).toBe('HEALTHY');
  });

  it('both null → HEALTHY (missing data is not a verdict)', () => {
    expect(computeProjectHealth({ budgetBurn: null, margin: null, completed: false })).toBe('HEALTHY');
  });

  it('nulls still respect explicit danger: burn > 100% → OVER_BUDGET even with margin null', () => {
    expect(computeProjectHealth({ budgetBurn: 1.2, margin: null, completed: false })).toBe('OVER_BUDGET');
  });
});

describe('Module 1.26 unit — deterministic and configurable', () => {
  it('same inputs always yield the same status', () => {
    const input = { budgetBurn: 0.8, margin: 0.3, completed: false };
    expect(computeProjectHealth(input)).toBe(computeProjectHealth(input));
  });

  it('thresholds are configurable — a stricter burn target changes the verdict', () => {
    const input = { budgetBurn: 0.6, margin: 0.5, completed: false };
    expect(computeProjectHealth(input)).toBe('HEALTHY'); // default thresholds
    expect(computeProjectHealth(input, { ...DEFAULT_HEALTH_THRESHOLDS, healthyBurnMax: 0.5 }))
      .toBe('WATCH'); // tenant-tuned thresholds, same engine
  });
});

describe('Module 1.26 unit — problems-first sorting (Module 1.7)', () => {
  it('display order: OVER_BUDGET → AT_RISK → WATCH → HEALTHY → COMPLETED', () => {
    expect(HEALTH_DISPLAY_ORDER.OVER_BUDGET).toBeLessThan(HEALTH_DISPLAY_ORDER.AT_RISK);
    expect(HEALTH_DISPLAY_ORDER.AT_RISK).toBeLessThan(HEALTH_DISPLAY_ORDER.WATCH);
    expect(HEALTH_DISPLAY_ORDER.WATCH).toBeLessThan(HEALTH_DISPLAY_ORDER.HEALTHY);
    expect(HEALTH_DISPLAY_ORDER.HEALTHY).toBeLessThan(HEALTH_DISPLAY_ORDER.COMPLETED);
  });

  it('sortProjectsByHealth puts problems before successes', () => {
    const rows = [
      { id: 'healthy', status: 'HEALTHY' as const },
      { id: 'completed', status: 'COMPLETED' as const },
      { id: 'over', status: 'OVER_BUDGET' as const },
      { id: 'watch', status: 'WATCH' as const },
      { id: 'risk', status: 'AT_RISK' as const },
    ];
    expect(sortProjectsByHealth(rows).map(r => r.id)).toEqual([
      'over', 'risk', 'watch', 'healthy', 'completed',
    ]);
  });

  it('sorting does not mutate the input array', () => {
    const rows = [
      { id: 'a', status: 'HEALTHY' as const },
      { id: 'b', status: 'AT_RISK' as const },
    ];
    sortProjectsByHealth(rows);
    expect(rows.map(r => r.id)).toEqual(['a', 'b']);
  });
});
