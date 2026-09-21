/**
 * Agency Vertical — Analytics: platform summary (post-Phase-1 super-admin surface)
 *
 * Pure composition over getPlatformAgencyRows() output. No database access,
 * no entity lists — the caller joins tenant identity and hands both in.
 * Following the Step 0.9 ownership rule: this is the SINGLE place where the
 * platform-level adoption / activation / volume numbers are computed, so the
 * API route stays a thin gate + assembly.
 *
 * Honesty rules inherited from the vertical:
 *   - money is never converted: platform money totals fold per currency and
 *     go NULL when the platform's agency tenants mix currencies (the §127
 *     rule applied at platform scope); byCurrency stays real either way.
 *   - the activation funnel counts TENANTS, not activity (§80 — "percentage
 *     of agency tenants that…"), and every stage is a real count, never a
 *     fabricated benchmark.
 */
import type { GroupedMoney, PlatformTenantAgencyRow } from '../queries/platform-analytics';
import { foldGroupedMoney } from '../queries/platform-analytics';

/** Minimal tenant identity the summary needs (from getTenants()). */
export interface PlatformTenantIdentity {
  id: string;
  name: string;
  appMode?: 'Standard' | 'Student_Club' | 'Agency';
  status: 'ACTIVE' | 'SUSPENDED';
  plan: 'FREE' | 'STARTER' | 'ENTERPRISE';
}

/** One per-tenant row in the response — analytics + identity joined. */
export interface PlatformTenantAgencyView extends PlatformTenantAgencyRow {
  name: string;
  appMode: 'Standard' | 'Student_Club' | 'Agency';
  status: 'ACTIVE' | 'SUSPENDED';
  plan: 'FREE' | 'STARTER' | 'ENTERPRISE';
}

export interface PlatformAgencySummary {
  /** Adoption: agency-mode tenants vs the active tenant base. */
  adoption: {
    agencyTenants: number;
    activeTenants: number;
    /** agencyTenants / activeTenants × 100; null when there are no active tenants. */
    agencySharePercent: number | null;
  };
  /**
   * §80 activation funnel — counts of AGENCY tenants (not all tenants)
   * reaching each step. Ordered by construction:
   * clients ≥ projects ≥ … is NOT enforced (a tenant can log time before
   * creating a rate card); each stage counts independently and honestly.
   */
  activation: {
    withClients: number;
    withProjects: number;
    withRates: number;
    withTime: number;
    withInvoices: number;
  };
  /** Platform volume — real per-currency sums; totals null on currency mix. */
  volume: {
    activeProjects: number;
    hours30d: number;
    billableHoursAllTime: number;
    invoiced: GroupedMoney;
    collected: GroupedMoney;
    outstanding: GroupedMoney;
  };
  /** Per-tenant rows — agency tenants first, then any tenant with agency
   *  activity (an appMode switch away never hides its history), sorted by
   *  invoiced value then hours, capped for the table view. */
  tenants: PlatformTenantAgencyView[];
}

/** Sum per currency across tenants, then fold with the mixed rule. */
function sumAcrossTenants(rows: PlatformTenantAgencyRow[], pick: (r: PlatformTenantAgencyRow) => GroupedMoney): GroupedMoney {
  const byCurrency: Record<string, number> = {};
  for (const r of rows) {
    for (const [currency, amount] of Object.entries(pick(r).byCurrency)) {
      byCurrency[currency] = (byCurrency[currency] ?? 0) + amount;
    }
  }
  return foldGroupedMoney(byCurrency);
}

/**
 * The one platform summary. `rows` come from getPlatformAgencyRows();
 * `tenants` from getTenants() (identity only). Pure — safe to unit test
 * without any database.
 */
export function summarizePlatformAgency(
  rows: PlatformTenantAgencyRow[],
  tenants: PlatformTenantIdentity[],
  maxTenantRows: number = 25
): PlatformAgencySummary {
  const identities = new Map(tenants.map(t => [t.id, t]));

  // Only ACTIVE tenants count toward adoption (a suspended tenant is not a
  // live adoption). Agency ACTIVITY rows still render for any tenant — the
  // operator must see suspended tenants' outstanding money for support.
  const activeTenants = tenants.filter(t => t.status === 'ACTIVE');
  const agencyActive = activeTenants.filter(t => t.appMode === 'Agency');

  // Activation counts run over ACTIVE agency tenants only (§80 — adoption
  // of live agencies; a suspended tenant's data can't churn the funnel).
  const activityByTenant = new Map(rows.map(r => [r.tenantId, r]));
  const countAgency = (pred: (r: PlatformTenantAgencyRow) => boolean): number =>
    agencyActive.reduce((n, t) => {
      const r = activityByTenant.get(t.id);
      return n + (r && pred(r) ? 1 : 0);
    }, 0);

  const views: PlatformTenantAgencyView[] = rows.map(r => {
    const t = identities.get(r.tenantId);
    return {
      ...r,
      name: t?.name ?? r.tenantId,
      appMode: t?.appMode ?? 'Standard',
      status: t?.status ?? 'ACTIVE',
      plan: t?.plan ?? 'FREE',
    };
  });
  // A fresh agency tenant with NO activity yet owns no store row — but it is
  // exactly the zero-adoption agency the operator needs to see, so it gets an
  // honest all-zero row (real zeros: nothing has happened, nothing is faked).
  for (const t of agencyActive) {
    if (!activityByTenant.has(t.id)) {
      views.push({
        tenantId: t.id,
        clients: 0,
        totalProjects: 0,
        activeProjects: 0,
        hoursLogged: 0,
        billableHours: 0,
        hours30d: 0,
        hasRateSetup: false,
        hasTimeEntries: false,
        hasIssuedInvoices: false,
        invoiced: { total: 0, currency: null, byCurrency: {} },
        collected: { total: 0, currency: null, byCurrency: {} },
        outstanding: { total: 0, currency: null, byCurrency: {} },
        name: t.name,
        appMode: 'Agency',
        status: t.status,
        plan: t.plan,
      });
    }
  }
  // Agency-mode tenants first, then activity-only tenants (appMode switched
  // away but history remains); within groups, most invoiced value first
  // (null money — mixed currencies — sorts by hours instead).
  views.sort((a, b) => {
    const aAgency = a.appMode === 'Agency' ? 0 : 1;
    const bAgency = b.appMode === 'Agency' ? 0 : 1;
    if (aAgency !== bAgency) return aAgency - bAgency;
    const aMoney = a.invoiced.total ?? -1;
    const bMoney = b.invoiced.total ?? -1;
    if (aMoney !== bMoney) return bMoney - aMoney;
    return b.hoursLogged - a.hoursLogged;
  });

  return {
    adoption: {
      agencyTenants: agencyActive.length,
      activeTenants: activeTenants.length,
      agencySharePercent: activeTenants.length > 0
        ? (agencyActive.length / activeTenants.length) * 100
        : null,
    },
    activation: {
      withClients: countAgency(r => r.clients > 0),
      withProjects: countAgency(r => r.totalProjects > 0),
      withRates: countAgency(r => r.hasRateSetup),
      withTime: countAgency(r => r.hasTimeEntries),
      withInvoices: countAgency(r => r.hasIssuedInvoices),
    },
    volume: {
      // Platform active projects = every tenant's ACTIVE projects (an
      // agency tenant's delivery work; non-agency tenants own no projects).
      activeProjects: rows.reduce((s, r) => s + r.activeProjects, 0),
      hours30d: rows.reduce((s, r) => s + r.hours30d, 0),
      billableHoursAllTime: rows.reduce((s, r) => s + r.billableHours, 0),
      invoiced: sumAcrossTenants(rows, r => r.invoiced),
      collected: sumAcrossTenants(rows, r => r.collected),
      outstanding: sumAcrossTenants(rows, r => r.outstanding),
    },
    // Agency-mode rows always render even before any activity exists —
    // zero-adoption agencies are exactly what the operator needs to see.
    tenants: views.slice(0, maxTenantRows),
  };
}
