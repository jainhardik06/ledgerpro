import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { toggleFeatureFlag, createLog } from '@/lib/db';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const success = await toggleFeatureFlag(id);
    if (!success) {
      return NextResponse.json({ error: 'Failed to toggle feature flag' }, { status: 400 });
    }

    await createLog(session.username, 'Toggle Feature Flag', `Toggled feature flag ${id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Feature flag toggle error:', error);
    return NextResponse.json({ error: 'Failed to toggle feature flag' }, { status: 500 });
  }
}
