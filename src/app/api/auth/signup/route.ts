import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { 
  getUserByUsername, 
  createTenant, 
  createUser, 
  createAccount, 
  createCategory, 
  createLog 
} from '@/lib/db';
import { generateToken } from '@/lib/auth';
import { firstClientIp, validatePassword, validateString } from '@/lib/validation';
import { logError } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const { tenantName, username, password } = await req.json();

    const cleanTenantName = validateString(tenantName, 'Organization name', { min: 2, max: 100 });
    if (cleanTenantName instanceof NextResponse) return cleanTenantName;
    const cleanUsername = validateString(username, 'Username', { min: 3, max: 255 });
    if (cleanUsername instanceof NextResponse) return cleanUsername;
    const cleanPassword = validatePassword(password);
    if (cleanPassword instanceof NextResponse) return cleanPassword;

    const existingUser = await getUserByUsername(cleanUsername);
    if (existingUser) {
      return NextResponse.json(
        { error: 'Username is already taken' },
        { status: 400 }
      );
    }

    // Create the tenant
    const newTenant = await createTenant(cleanTenantName);

    // Create the tenant admin
    const passwordHash = await bcrypt.hash(cleanPassword, 12);
    const newAdmin = await createUser(cleanUsername, passwordHash, 'TENANT_ADMIN', newTenant.id!);
    const newAdminId = newAdmin.id || newAdmin._id?.toString();
    if (!newAdminId) {
      throw new Error('Created tenant admin is missing an identifier');
    }

    // Pre-seed Accounts
    await createAccount(newTenant.id!, 'Cash', 'CASH', 0);
    await createAccount(newTenant.id!, 'Bank', 'BANK', 0);
    
    // Pre-seed Smart Categories
    const defaultCategories = ['Food', 'Travel', 'Shopping', 'Bills', 'Entertainment', 'Salary', 'Marketing', 'Rent', 'Software', 'Client Revenue', 'Tax'];
    for (const cat of defaultCategories) {
      await createCategory(newTenant.id!, newAdminId, cat);
    }

    const ipAddress = firstClientIp(req);
    await createLog(cleanUsername, 'Sign Up', `New tenant created: ${cleanTenantName}`, newTenant.id!, ipAddress);

    // Auto-Login
    const token = generateToken({
      userId: newAdminId,
      username: newAdmin.username,
      role: newAdmin.role,
      tenantId: newAdmin.tenantId,
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

    return NextResponse.json({
      success: true,
      user: {
        username: newAdmin.username,
        role: newAdmin.role,
        tenantId: newAdmin.tenantId,
      },
    });
  } catch (error) {
    logError('Signup error', error);
    return NextResponse.json(
      { error: 'An error occurred during sign up' },
      { status: 500 }
    );
  }
}
