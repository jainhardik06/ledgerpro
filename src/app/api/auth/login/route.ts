import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { getUserByUsername, createLog, getTenantById } from '@/lib/db';
import { generateToken } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { firstClientIp, validatePassword, validateString } from '@/lib/validation';
import { logError } from '@/lib/logger';
import PostHogClient from '@/lib/posthog-server';
import { resolveVertical } from '@/lib/agency/types/vertical';

const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set({
    name: 'token',
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  });
}

function requireSuperAdminHash(): string | null {
  let hash = process.env.SUPER_ADMIN_PASSWORD_HASH;
  if (hash) {
    hash = hash.replace(/^['"]|['"]$/g, '');
    hash = hash.replace(/\\/g, '');
  }
  if (!hash) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SUPER_ADMIN_PASSWORD_HASH must be set in production');
    }
    return null;
  }
  return hash;
}

export async function POST(req: NextRequest) {
  const ipAddress = firstClientIp(req);

  try {
    const body = await req.json();
    const username = validateString(body.username, 'Username', { min: 3, max: 255 });
    if (username instanceof NextResponse) return username;

    const rate = checkRateLimit(`login:${ipAddress}:${username}`, LOGIN_LIMIT, LOGIN_WINDOW_MS);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } }
      );
    }

    const password = validatePassword(body.password);
    if (password instanceof NextResponse) return password;

    const superAdminUsername = process.env.SUPER_ADMIN_USERNAME;
    const superAdminHash = requireSuperAdminHash();

    if (superAdminUsername && superAdminHash && username === superAdminUsername) {
      const isAdminMatch = await bcrypt.compare(password, superAdminHash);
      if (!isAdminMatch) {
        await createLog(username, 'FAILED_LOGIN', 'Super Admin: incorrect password', undefined, ipAddress);
        return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
      }

      const token = generateToken({
        userId: 'super_admin',
        username: superAdminUsername,
        role: 'SUPER_ADMIN',
      });
      await setSessionCookie(token);
      await createLog(username, 'Login', 'Super Admin successfully logged in', undefined, ipAddress);

      // Analytics
      const posthog = PostHogClient();
      posthog.capture({
        distinctId: 'super_admin',
        event: 'USER_LOGIN',
        properties: { email: superAdminUsername, role: 'SUPER_ADMIN' }
      });

      return NextResponse.json({
        success: true,
        user: { username: superAdminUsername, role: 'SUPER_ADMIN' },
      });
    }

    const user = await getUserByUsername(username);
    if (!user) {
      await createLog(username, 'FAILED_LOGIN', 'User not found', undefined, ipAddress);
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    if (user.status === 'LOCKED') {
      await createLog(username, 'FAILED_LOGIN', 'Account is locked', user.tenantId, ipAddress);
      return NextResponse.json({ error: 'Account is locked. Contact administrator.' }, { status: 403 });
    }

    const tenant = await getTenantById(user.tenantId);
    if (tenant?.status === 'SUSPENDED') {
      await createLog(username, 'FAILED_LOGIN', 'Tenant is suspended', user.tenantId, ipAddress);
      return NextResponse.json({ error: 'Organization account is suspended. Contact support.' }, { status: 403 });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      await createLog(user.username, 'FAILED_LOGIN', 'Incorrect password entered', user.tenantId, ipAddress);
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    const persistedUserId = user.id || user._id?.toString();
    if (!persistedUserId) {
      throw new Error('Persisted user is missing an identifier');
    }

    const token = generateToken({
      userId: persistedUserId,
      username: user.username,
      role: user.role,
      tenantId: user.tenantId,
    });
    await setSessionCookie(token);
    await createLog(user.username, 'Login', 'User successfully logged in', user.tenantId, ipAddress);

    // Analytics
    const posthog = PostHogClient();
    posthog.capture({
      distinctId: persistedUserId,
      event: 'USER_LOGIN',
      properties: { 
        email: user.username, 
        role: user.role, 
        tenantId: user.tenantId 
      }
    });

    return NextResponse.json({
      success: true,
      user: {
        username: user.username,
        role: user.role,
        tenantId: user.tenantId,
      },
      // Module 1.1 — Agency workspaces land on the Agency Command Center;
      // other verticals keep the generic dashboard untouched.
      redirectTo: resolveVertical(tenant?.appMode) === 'Agency' ? '/dashboard/agency' : '/dashboard',
    });
  } catch (error) {
    logError('Login error', error, { ipAddress });
    return NextResponse.json({ error: 'An error occurred during sign in' }, { status: 500 });
  }
}
