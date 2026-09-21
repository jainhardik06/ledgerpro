/**
 * The tenant plan catalog — the ONE source of truth for the plan tiers Money OS
 * sells and what each one costs.
 *
 * Before this file the published list prices lived as local constants inside
 * /api/super-admin/revenue (which multiplies them by active tenant counts to
 * estimate MRR). The Organizations page needs the same numbers to offer a plan
 * change, and a second copy of a price is a second truth: the picker and the
 * revenue maths could drift apart silently. Both now read from here.
 *
 * The prices are Money OS's real published list prices. Keeping them here (and
 * not, say, reading them from a billing provider) is honest because there is no
 * billing integration in this codebase — see the revenue route.
 */

export const TENANT_PLANS = ['FREE', 'STARTER', 'ENTERPRISE'] as const;

export type TenantPlan = (typeof TENANT_PLANS)[number];

export interface PlanDefinition {
  /** Shown in the UI. */
  label: string;
  /** Published list price per month, in USD. Free is genuinely 0. */
  monthlyListPrice: number;
}

export const PLAN_CATALOG: Record<TenantPlan, PlanDefinition> = {
  FREE: { label: 'Free', monthlyListPrice: 0 },
  STARTER: { label: 'Starter', monthlyListPrice: 49 },
  ENTERPRISE: { label: 'Enterprise', monthlyListPrice: 299 },
};

/** "$49/mo", or "Free" — the price as the UI should print it. */
export function formatPlanPrice(plan: TenantPlan): string {
  const price = PLAN_CATALOG[plan].monthlyListPrice;
  return price === 0 ? 'Free' : `$${price}/mo`;
}

export function isTenantPlan(value: unknown): value is TenantPlan {
  return typeof value === 'string' && (TENANT_PLANS as readonly string[]).includes(value);
}
