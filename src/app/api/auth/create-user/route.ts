import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSessionUser } from '@/lib/auth';
import { getUserByUsername, createUser } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    // Authenticate the current session
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized. You must be signed in to create new users.' },
        { status: 401 }
      );
    }

    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    if (username.length < 3) {
      return NextResponse.json(
        { error: 'Username must be at least 3 characters' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    const existingUser = await getUserByUsername(username);
    if (existingUser) {
      return NextResponse.json(
        { error: 'Username is already taken' },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await createUser(username, passwordHash);

    return NextResponse.json({
      success: true,
      user: {
        username: newUser.username,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'An error occurred during user creation' },
      { status: 500 }
    );
  }
}
