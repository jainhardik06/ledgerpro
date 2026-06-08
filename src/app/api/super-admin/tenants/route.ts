import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getTenants, createTenant, createUser, createLog, getUserByUsername, createAccount, createCategory } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { validatePassword, validateString } from '@/lib/validation';
import { logError } from '@/lib/logger';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenants = await getTenants();
    return NextResponse.json({ success: true, tenants });
  } catch (error) {
    logError('Fetch tenants error', error);
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

    const cleanName = validateString(name, 'Tenant name', { min: 2, max: 100 });
    if (cleanName instanceof NextResponse) return cleanName;
    const cleanAdminUsername = validateString(adminUsername, 'Admin username', { min: 3, max: 32 });
    if (cleanAdminUsername instanceof NextResponse) return cleanAdminUsername;
    const cleanAdminPassword = validatePassword(adminPassword);
    if (cleanAdminPassword instanceof NextResponse) return cleanAdminPassword;

    const existingUser = await getUserByUsername(cleanAdminUsername);
    if (existingUser) {
      return NextResponse.json(
        { error: 'Admin username already exists' },
        { status: 400 }
      );
    }

    // Create the tenant
    const newTenant = await createTenant(cleanName);

    // Create the tenant admin
    const passwordHash = await bcrypt.hash(cleanAdminPassword, 12);
    const newAdmin = await createUser(cleanAdminUsername, passwordHash, 'TENANT_ADMIN', newTenant.id!);
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

    await createLog(session.username, 'Add Tenant', `Created tenant: ${cleanName} with admin: ${cleanAdminUsername}`);

    return NextResponse.json({ 
      success: true, 
      tenant: { id: newTenant.id, name: newTenant.name }, 
      admin: { id: newAdminId, username: newAdmin.username, role: newAdmin.role }
    });
  } catch (error) {
    logError('Create tenant error', error);
    return NextResponse.json(
      { error: 'An error occurred creating the tenant' },
      { status: 500 }
    );
  }
}
