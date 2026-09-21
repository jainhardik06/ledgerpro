import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getTenants } from '@/lib/db';
import { PLAN_CATALOG } from '@/lib/plans';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenants = await getTenants();
    
    // Calculate basic revenue metrics based on plans
    let totalMrr = 0;
    const planCounts = {
      ENTERPRISE: 0,
      STARTER: 0,
      FREE: 0
    };

    // The published list prices (STARTER/ENTERPRISE) live in the shared plan
    // catalog so the Organizations page's plan picker and this MRR estimate can
    // never disagree. MRR here is a legitimate estimate (real active tenant
    // counts x list price), not fabricated. There is no Stripe/billing
    // integration in this codebase, so net retention and churn cannot be
    // computed (both require historical subscription lifecycle events —
    // upgrades, downgrades, cancellations — that nothing here tracks yet).
    // Returning null rather than a placeholder number is intentional: the UI
    // must show "not available", not fake data.
    const ENTERPRISE_PRICE = PLAN_CATALOG.ENTERPRISE.monthlyListPrice;
    const STARTER_PRICE = PLAN_CATALOG.STARTER.monthlyListPrice;

    tenants.forEach(t => {
      if (t.status === 'ACTIVE') {
        if (t.plan === 'ENTERPRISE') {
           totalMrr += ENTERPRISE_PRICE;
           planCounts.ENTERPRISE++;
        } else if (t.plan === 'STARTER') {
           totalMrr += STARTER_PRICE;
           planCounts.STARTER++;
        } else {
           planCounts.FREE++;
        }
      }
    });

    const arpa = totalMrr / (planCounts.ENTERPRISE + planCounts.STARTER || 1);

    return NextResponse.json({
      mrr: totalMrr,
      mrrIsEstimate: true,
      netRetention: null,
      arpa: Math.round(arpa),
      churnRate: null,
      planDistribution: planCounts
    });
  } catch (error) {
    console.error('Revenue fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch revenue data' }, { status: 500 });
  }
}
