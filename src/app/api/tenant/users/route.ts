import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getUsersByTenant, createUser, createLog, getUserByUsername } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId || session.role !== 'TENANT_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = await getUsersByTenant(session.tenantId);
    // Ensure we don't send hashes to client
    const safeUsers = users.map(u => ({
      id: u.id,
      username: u.username,
      role: u.role,
      createdAt: u.createdAt,
    }));
    return NextResponse.json({ success: true, users: safeUsers });
  } catch (error: any) {
    console.error('Fetch users error:', error);
    return NextResponse.json({ error: 'An error occurred fetching users' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId || session.role !== 'TENANT_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    const existingUser = await getUserByUsername(username);
    if (existingUser) {
      return NextResponse.json(
        { error: 'Username already exists' },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await createUser(username, passwordHash, 'USER', session.tenantId);

    await createLog(session.username, 'Add User', `Created user: ${username}`, session.tenantId);

    return NextResponse.json({ 
      success: true, 
      user: {
        id: newUser.id,
        username: newUser.username,
        role: newUser.role,
      } 
    });
  } catch (error: any) {
    console.error('Create user error:', error);
    return NextResponse.json(
      { error: 'An error occurred creating the user' },
      { status: 500 }
    );
  }
}
