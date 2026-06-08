import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getUserById, updateUser, deleteUser, createLog, getUserByUsername } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { logError } from '@/lib/logger';
import { validatePassword, validateString } from '@/lib/validation';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId || session.role !== 'TENANT_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { username, password } = await req.json();

    // Verify user exists and belongs to the same tenant
    const user = await getUserById(id);
    if (!user || user.tenantId !== session.tenantId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const updates: any = {};

    if (username) {
      const cleanUsername = validateString(username, 'Username', { min: 3, max: 32 });
      if (cleanUsername instanceof NextResponse) return cleanUsername;
      if (cleanUsername.toLowerCase() !== user.username.toLowerCase()) {
        // Check uniqueness in database
        const existing = await getUserByUsername(cleanUsername);
        if (existing) {
          return NextResponse.json({ error: 'Username already exists' }, { status: 400 });
        }
        updates.username = cleanUsername;
      }
    }

    if (password) {
      const cleanPassword = validatePassword(password);
      if (cleanPassword instanceof NextResponse) return cleanPassword;
      updates.passwordHash = await bcrypt.hash(cleanPassword, 12);
    }

    if (Object.keys(updates).length > 0) {
      await updateUser(id, updates);
      await createLog(session.username, 'Edit User', `Updated user details for: ${username || user.username}`, session.tenantId);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logError('Update user error', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId || session.role !== 'TENANT_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify user exists and belongs to same tenant
    const user = await getUserById(id);
    if (!user || user.tenantId !== session.tenantId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Prevent deleting oneself
    if (user.id === session.userId) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    await deleteUser(id);
    await createLog(session.username, 'Delete User', `Deleted user: ${user.username}`, session.tenantId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logError('Delete user error', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
