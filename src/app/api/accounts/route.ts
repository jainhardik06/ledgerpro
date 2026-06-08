import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getAccounts, createAccount, createLog } from '@/lib/db';
import { validateFiniteNumber, validateString } from '@/lib/validation';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accounts = await getAccounts(session.tenantId);
    return NextResponse.json({ success: true, accounts });
  } catch (error) {
    console.error('Fetch accounts error:', error);
    return NextResponse.json({ error: 'An error occurred fetching accounts' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, type, initialBalance } = await req.json();
    const cleanName = validateString(name, 'Account name', { min: 1, max: 80 });
    if (cleanName instanceof NextResponse) return cleanName;
    const cleanType = validateString(type, 'Account type', { min: 1, max: 40 });
    if (cleanType instanceof NextResponse) return cleanType;
    const cleanInitialBalance = validateFiniteNumber(initialBalance, 'Initial balance', { min: -999999999, max: 999999999 });
    if (cleanInitialBalance instanceof NextResponse) return cleanInitialBalance;

    const newAccount = await createAccount(
      session.tenantId,
      cleanName,
      cleanType,
      cleanInitialBalance
    );

    await createLog(session.username, 'Add Account', `Created account: ${cleanName}`, session.tenantId);

    return NextResponse.json({ success: true, account: newAccount });
  } catch (error) {
    console.error('Create account error:', error);
    return NextResponse.json(
      { error: 'An error occurred creating the account' },
      { status: 500 }
    );
  }
}
