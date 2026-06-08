import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getNewsletterSubscribers } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const subscribers = await getNewsletterSubscribers();
    return NextResponse.json(subscribers);
  } catch (error) {
    console.error('Fetch subscribers error:', error);
    return NextResponse.json({ error: 'Failed to fetch subscribers' }, { status: 500 });
  }
}
