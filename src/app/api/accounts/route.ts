import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getAccounts, createAccount, createLog } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accounts = await getAccounts(session.tenantId);
    return NextResponse.json({ success: true, accounts });
  } catch (error: any) {
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

    if (!name || !type || initialBalance === undefined) {
      return NextResponse.json(
        { error: 'Name, type, and initial balance are required' },
        { status: 400 }
      );
    }

    const newAccount = await createAccount(
      session.tenantId,
      name,
      type,
      Number(initialBalance)
    );

    await createLog(session.username, 'Add Account', `Created account: ${name}`, session.tenantId);

    return NextResponse.json({ success: true, account: newAccount });
  } catch (error: any) {
    console.error('Create account error:', error);
    return NextResponse.json(
      { error: 'An error occurred creating the account' },
      { status: 500 }
    );
  }
}
