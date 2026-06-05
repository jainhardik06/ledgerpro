import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getUserById } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const user = await getUserById(session.userId);
    if (!user) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id || user._id.toString(),
        username: user.username,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'An error occurred fetching user session' },
      { status: 500 }
    );
  }
}
