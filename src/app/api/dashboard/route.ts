import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getTransactions } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const txs = await getTransactions(session.userId);

    let credit = 0;
    let debit = 0;
    
    txs.forEach((tx) => {
      const amount = Number(tx.amount);
      if (tx.type === 'Credit') {
        credit += amount;
      } else {
        debit += amount;
      }
    });

    const balance = credit - debit;

    return NextResponse.json({
      balance,
      credit,
      debit,
      transactions: txs.length,
    });
  } catch (error: any) {
    console.error('Fetch dashboard error:', error);
    return NextResponse.json(
      { error: 'An error occurred fetching dashboard data' },
      { status: 500 }
    );
  }
}
