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

export async function POST(req: NextRequest) {
  try {
    const { tenantName, username, password } = await req.json();

    if (!tenantName || !username || !password) {
      return NextResponse.json(
        { error: 'Tenant name, admin username, and password are required' },
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

    // Create the tenant
    const newTenant = await createTenant(tenantName);

    // Create the tenant admin
    const passwordHash = await bcrypt.hash(password, 10);
    const newAdmin = await createUser(username, passwordHash, 'TENANT_ADMIN', newTenant.id!);

    // Pre-seed Accounts
    await createAccount(newTenant.id!, 'Cash', 'CASH', 0);
    await createAccount(newTenant.id!, 'Bank', 'BANK', 0);
    
    // Pre-seed Smart Categories
    const defaultCategories = ['Food', 'Travel', 'Shopping', 'Bills', 'Entertainment', 'Salary', 'Marketing', 'Rent', 'Software', 'Client Revenue', 'Tax'];
    for (const cat of defaultCategories) {
      await createCategory(newTenant.id!, newAdmin.id || newAdmin._id.toString(), cat);
    }

    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('remote-addr') || 'unknown';
    await createLog(username, 'Sign Up', `New tenant created: ${tenantName}`, newTenant.id!, ipAddress);

    // Auto-Login
    const token = generateToken({
      userId: newAdmin.id || newAdmin._id.toString(),
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
  } catch (error: any) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'An error occurred during sign up' },
      { status: 500 }
    );
  }
}
