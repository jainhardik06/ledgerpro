import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { getUserByUsername, createLog } from '@/lib/db';
import { generateToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    const user = await getUserByUsername(username);
    if (!user) {
      await createLog(username, 'Login Failed', 'User not found');
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      await createLog(user.username, 'Login Failed', 'Incorrect password entered');
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    const token = generateToken({
      userId: user.id || user._id.toString(),
      username: user.username,
    });

    const cookieStore = await cookies();
    cookieStore.set({
      name: 'token',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    await createLog(user.username, 'Login', 'User successfully logged in');

    return NextResponse.json({
      success: true,
      user: {
        username: user.username,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'An error occurred during sign in' },
      { status: 500 }
    );
  }
}
