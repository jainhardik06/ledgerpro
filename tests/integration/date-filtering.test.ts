/**
 * Module 1.26 — Integration: date filtering (Modules 1.3/1.16).
 *
 * The period is the single filter driver: the server resolves ONE window in
 * the TENANT's configured timezone, and every windowed metric uses the SAME
 * window. These tests pin the resolver's exact boundaries and that the
 * resolved window (from/to/timezone) rides on the dashboard payload.
 */
import { describe, expect, it } from 'vitest';
import {
  resolveReportingPeriod,
  todayInTimezone,
  DEFAULT_TENANT_TIMEZONE,
} from '@/lib/agency/types/dates';
import { getAgencyDashboard } from '@/lib/agency/analytics/dashboard';

const TODAY = '2026-09-09'; // deterministic "today" for window resolution

describe('Module 1.26 integration — reporting period windows', () => {
  it('THIS_MONTH: from month start to today (inclusive)', () => {
    const r = resolveReportingPeriod('THIS_MONTH', TODAY);
    expect(r.from).toBe('2026-09-01');
    expect(r.to).toBe('2026-09-09');
  });

  it('LAST_MONTH: the FULL previous calendar month', () => {
    const r = resolveReportingPeriod('LAST_MONTH', TODAY);
    expect(r.from).toBe('2026-08-01');
    expect(r.to).toBe('2026-08-31');
  });

  it('LAST_MONTH crosses the year boundary correctly', () => {
    const r = resolveReportingPeriod('LAST_MONTH', '2026-01-15');
    expect(r.from).toBe('2025-12-01');
    expect(r.to).toBe('2025-12-31');
  });

  it('THIS_QUARTER: from the quarter start to today', () => {
    const r = resolveReportingPeriod('THIS_QUARTER', TODAY);
    expect(r.from).toBe('2026-07-01'); // Sep is in the Jul–Sep quarter
    expect(r.to).toBe('2026-09-09');
  });

  it('THIS_QUARTER start rotates across the year', () => {
    expect(resolveReportingPeriod('THIS_QUARTER', '2026-02-10').from).toBe('2026-01-01');
    expect(resolveReportingPeriod('THIS_QUARTER', '2026-11-10').from).toBe('2026-10-01');
  });

  it('THIS_YEAR: Jan 1 to today', () => {
    const r = resolveReportingPeriod('THIS_YEAR', TODAY);
    expect(r.from).toBe('2026-01-01');
    expect(r.to).toBe('2026-09-09');
  });

  it('CUSTOM: exact from/to honored', () => {
    const r = resolveReportingPeriod('CUSTOM', TODAY, { from: '2026-09-01', to: '2026-09-30' });
    expect(r.from).toBe('2026-09-01');
    expect(r.to).toBe('2026-09-30');
  });

  it('CUSTOM with a reversed or malformed range is rejected, not silently clamped', () => {
    expect(() => resolveReportingPeriod('CUSTOM', TODAY, { from: '2026-09-30', to: '2026-09-01' })).toThrow();
    expect(() => resolveReportingPeriod('CUSTOM', TODAY, { from: 'not-a-date', to: '2026-09-01' })).toThrow();
    expect(() => resolveReportingPeriod('CUSTOM', TODAY)).toThrow();
  });

  it('every window carries an equal-length previous window ending the day before `from`', () => {
    for (const period of ['THIS_MONTH', 'LAST_MONTH', 'THIS_QUARTER', 'THIS_YEAR'] as const) {
      const r = resolveReportingPeriod(period, TODAY);
      const len = (a: string, b: string) =>
        Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;
      expect(r.previous.to < r.from).toBe(true);
      expect(len(r.previous.from, r.previous.to)).toBe(len(r.from, r.to));
      // previous ends exactly one day before the window starts
      expect(len(r.previous.from, r.from) - 1).toBe(len(r.previous.from, r.previous.to));
    }
  });
});

describe('Module 1.26 integration — dashboard payload carries the period scope (Module 1.16)', () => {
  it('periodScope = the resolved window in the TENANT timezone', () => {
    const d = getAgencyDashboard('THIS_MONTH', 'Asia/Kolkata', TODAY);
    expect(d.periodScope).toEqual({
      from: '2026-09-01',
      to: '2026-09-09',
      timezone: 'Asia/Kolkata',
    });
    expect(d.dateRange.from).toBe('2026-09-01');
  });

  it('the timezone is caller-controlled — a different tz rides through untouched', () => {
    const d = getAgencyDashboard('THIS_MONTH', 'Europe/Berlin', TODAY);
    expect(d.periodScope.timezone).toBe('Europe/Berlin');
  });

  it('default timezone is the tenant default (Asia/Kolkata)', () => {
    expect(DEFAULT_TENANT_TIMEZONE).toBe('Asia/Kolkata');
    expect(todayInTimezone('Asia/Kolkata')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('CUSTOM period flows through getAgencyDashboard', () => {
    const d = getAgencyDashboard('CUSTOM', 'Asia/Kolkata', TODAY, { from: '2026-09-01', to: '2026-09-30' });
    expect(d.periodScope.from).toBe('2026-09-01');
    expect(d.periodScope.to).toBe('2026-09-30');
  });
});
