import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getTenants, createTenant, createUser, createLog, getUserByUsername, createAccount, createCategory } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenants = await getTenants();
    return NextResponse.json({ success: true, tenants });
  } catch (error: any) {
    console.error('Fetch tenants error:', error);
    return NextResponse.json({ error: 'An error occurred fetching tenants' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, adminUsername, adminPassword } = await req.json();

    if (!name || !adminUsername || !adminPassword) {
      return NextResponse.json(
        { error: 'Tenant name, admin username, and admin password are required' },
        { status: 400 }
      );
    }

    const existingUser = await getUserByUsername(adminUsername);
    if (existingUser) {
      return NextResponse.json(
        { error: 'Admin username already exists' },
        { status: 400 }
      );
    }

    // Create the tenant
    const newTenant = await createTenant(name);

    // Create the tenant admin
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const newAdmin = await createUser(adminUsername, passwordHash, 'TENANT_ADMIN', newTenant.id!);

    // Pre-seed Accounts
    await createAccount(newTenant.id!, 'Cash', 'CASH', 0);
    await createAccount(newTenant.id!, 'Bank', 'BANK', 0);
    
    // Pre-seed Smart Categories
    const defaultCategories = ['Food', 'Travel', 'Shopping', 'Bills', 'Entertainment', 'Salary', 'Marketing', 'Rent', 'Software', 'Client Revenue', 'Tax'];
    for (const cat of defaultCategories) {
      await createCategory(newTenant.id!, newAdmin.id || newAdmin._id.toString(), cat);
    }

    await createLog(session.username, 'Add Tenant', `Created tenant: ${name} with admin: ${adminUsername}`);

    return NextResponse.json({ success: true, tenant: newTenant, admin: newAdmin });
  } catch (error: any) {
    console.error('Create tenant error:', error);
    return NextResponse.json(
      { error: 'An error occurred creating the tenant' },
      { status: 500 }
    );
  }
}
