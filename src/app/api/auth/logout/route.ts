import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionUser } from '@/lib/auth';
import { createLog } from '@/lib/db';
import PostHogClient from '@/lib/posthog-server';

export async function POST() {
  try {
    const session = await getSessionUser();
    if (session) {
      await createLog(session.username, 'Logout', 'User successfully signed out');
      
      const posthog = PostHogClient();
      posthog.capture({
        distinctId: session.userId,
        event: 'USER_LOGOUT',
      });
    }
    
    const cookieStore = await cookies();
    cookieStore.delete('token');
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'An error occurred during sign out' },
      { status: 500 }
    );
  }
}
