import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionUser, generateToken } from '@/lib/auth';
import { getUserById, createLog } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    const targetUser = await getUserById(userId);
    
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Generate a token as the target user, but flag it as impersonated
    const token = generateToken({
      userId: targetUser.id || targetUser._id.toString(),
      username: targetUser.username,
      role: targetUser.role,
      tenantId: targetUser.tenantId,
      impersonatedBy: session.username // Special flag
    });

    const cookieStore = await cookies();
    cookieStore.set({
      name: 'token',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 2, // 2 hours impersonation max
      path: '/',
    });

    await createLog(session.username, 'Impersonate', `Impersonated user ${targetUser.username} (${userId})`);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Impersonation error:', error);
    return NextResponse.json({ error: 'Failed to impersonate user' }, { status: 500 });
  }
}
