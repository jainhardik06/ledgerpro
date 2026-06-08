import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getUserByUsername } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    if (session.role === 'SUPER_ADMIN') {
      return NextResponse.json({
        authenticated: true,
        user: {
          id: session.userId,
          username: session.username,
          role: session.role,
        },
      });
    }

    const user = await getUserByUsername(session.username);
    if (!user) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }
    const persistedUserId = user.id || user._id?.toString();
    if (!persistedUserId) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: persistedUserId,
        username: user.username,
        role: user.role,
        tenantId: user.tenantId,
        impersonatedBy: session.impersonatedBy,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'An error occurred fetching user session' },
      { status: 500 }
    );
  }
}
