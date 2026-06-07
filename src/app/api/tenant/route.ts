import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { connectDb, initLocalDb, safeObjectId } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    let tenant = null;
    const { db } = await connectDb();
    if (db) {
      tenant = await db.collection('tenants').findOne({ _id: safeObjectId(session.tenantId) });
    } else {
      const data = initLocalDb();
      tenant = data.tenants.find(t => t.id === session.tenantId);
    }
    
    if (tenant) {
      return NextResponse.json({ 
        success: true, 
        tenant: {
          id: tenant._id?.toString() || tenant.id,
          name: tenant.name,
          appMode: tenant.appMode || 'Standard'
        }
      });
    }
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch tenant' }, { status: 500 });
  }
}
