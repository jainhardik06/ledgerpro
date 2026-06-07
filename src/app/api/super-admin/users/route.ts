import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getAllUsers, updateUserStatus, createLog } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = await getAllUsers();
    
    // Remove password hashes before sending to client
    const safeUsers = users.map(u => ({
      id: u.id,
      username: u.username,
      role: u.role,
      tenantId: u.tenantId,
      status: u.status,
      createdAt: u.createdAt,
    }));

    return NextResponse.json(safeUsers);
  } catch (error: any) {
    console.error('Users fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch global users' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, status } = await req.json();

    if (!id || !status) {
      return NextResponse.json({ error: 'User ID and status are required' }, { status: 400 });
    }

    const success = await updateUserStatus(id, status);
    if (!success) {
      return NextResponse.json({ error: 'Failed to update user status' }, { status: 400 });
    }

    await createLog(session.username, 'Update User', `Changed user ${id} status to ${status}`);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('User update error:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}
