import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getTenants } from '@/lib/db';

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

    tenants.forEach(t => {
      if (t.status === 'ACTIVE') {
        if (t.plan === 'ENTERPRISE') {
           totalMrr += 299; // Mock price per enterprise
           planCounts.ENTERPRISE++;
        } else if (t.plan === 'STARTER') {
           totalMrr += 49;
           planCounts.STARTER++;
        } else {
           planCounts.FREE++;
        }
      }
    });

    const netRetention = 104.2; // Derived metric placeholder
    const arpa = totalMrr / (planCounts.ENTERPRISE + planCounts.STARTER || 1);
    const churnRate = 1.2;

    return NextResponse.json({
      mrr: totalMrr,
      netRetention,
      arpa: Math.round(arpa),
      churnRate,
      planDistribution: planCounts
    });
  } catch (error) {
    console.error('Revenue fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch revenue data' }, { status: 500 });
  }
}
