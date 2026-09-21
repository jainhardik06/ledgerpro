import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { updateTenantAppMode, createLog } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId || session.role !== 'TENANT_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { appMode } = await req.json();

    if (!['Standard', 'Student_Club', 'Agency'].includes(appMode)) {
      return NextResponse.json({ error: 'Invalid app mode' }, { status: 400 });
    }

    const success = await updateTenantAppMode(session.tenantId, appMode);
    
    if (success) {
      await createLog(session.username, 'Update Settings', `Changed App Mode to ${appMode}`, session.tenantId);
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: 'Failed to update tenant settings' }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
