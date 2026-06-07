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

    const SUPER_ADMIN_USERNAME = process.env.SUPER_ADMIN_USERNAME;
    const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

    if (
      SUPER_ADMIN_USERNAME &&
      SUPER_ADMIN_PASSWORD &&
      username === SUPER_ADMIN_USERNAME &&
      password === SUPER_ADMIN_PASSWORD
    ) {
      const token = generateToken({
        userId: 'super_admin',
        username: SUPER_ADMIN_USERNAME,
        role: 'SUPER_ADMIN',
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

      await createLog(username, 'Login', 'Super Admin successfully logged in');

      return NextResponse.json({
        success: true,
        user: {
          username: SUPER_ADMIN_USERNAME,
          role: 'SUPER_ADMIN',
        },
      });
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
      await createLog(user.username, 'Login Failed', 'Incorrect password entered', user.tenantId);
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    const token = generateToken({
      userId: user.id || user._id.toString(),
      username: user.username,
      role: user.role,
      tenantId: user.tenantId,
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

    await createLog(user.username, 'Login', 'User successfully logged in', user.tenantId);

    return NextResponse.json({
      success: true,
      user: {
        username: user.username,
        role: user.role,
        tenantId: user.tenantId,
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
