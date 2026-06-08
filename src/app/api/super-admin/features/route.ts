import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getFeatureFlags, createFeatureFlag } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const flags = await getFeatureFlags();

    return NextResponse.json(flags);
  } catch (error) {
    console.error('Features fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch feature flags' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { name, desc, status, rollout, target } = body;

    if (!name || !desc) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const flag = await createFeatureFlag({ name, desc, status: status || false, rollout: rollout || '0%', target: target || 'None' });
    return NextResponse.json(flag, { status: 201 });
  } catch (error) {
    console.error('Feature creation error:', error);
    return NextResponse.json({ error: 'Failed to create feature flag' }, { status: 500 });
  }
}
