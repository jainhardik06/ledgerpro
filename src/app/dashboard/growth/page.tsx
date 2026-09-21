import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ArrowUpRight, TrendingDown, Target, Building2 } from 'lucide-react';
import { getSessionUser } from '@/lib/auth';
import { connectDb, initLocalDb } from '@/lib/db';
import { redirect } from 'next/navigation';

export default async function GrowthDashboard() {
  const session = await getSessionUser();
  if (!session || !session.tenantId) {
    redirect('/login');
  }
  const tenantId = session.tenantId;

  // Fetch real data for the tenant
  const { db } = await connectDb();
  let totalIncome = 0;
  let totalExpense = 0;
  let totalTransactions = 0;
  let totalClients = 0;
  let activeBudgets = 0;
  let activeRecurring = 0;

  if (db) {
    const txs = await db.collection('transactions').find({ tenantId }).toArray();
    totalTransactions = txs.length;
    txs.forEach((tx: any) => {
      if (tx.type === 'Credit') totalIncome += Number(tx.amount || 0);
      if (tx.type === 'Debit') totalExpense += Number(tx.amount || 0);
    });
    totalClients = await db.collection('clients').countDocuments({ tenantId });
    activeBudgets = await db.collection('budgets').countDocuments({ tenantId });
    activeRecurring = await db.collection('recurring').countDocuments({ tenantId });
  } else {
    // Local DB fallback
    const localDb = initLocalDb();
    const txs = localDb.transactions.filter((t: any) => t.tenantId === tenantId);
    totalTransactions = txs.length;
    txs.forEach((tx: any) => {
      if (tx.type === 'Credit') totalIncome += Number(tx.amount || 0);
      if (tx.type === 'Debit') totalExpense += Number(tx.amount || 0);
    });
    totalClients = localDb.clients.filter((c: any) => c.tenantId === tenantId).length;
    activeBudgets = localDb.budgets.filter((b: any) => b.tenantId === tenantId).length;
    activeRecurring = localDb.recurring.filter((r: any) => r.tenantId === tenantId).length;
  }

  const metrics = [
    { title: "Total Income", value: `$${totalIncome.toLocaleString(undefined, {minimumFractionDigits: 2})}`, icon: ArrowUpRight },
    { title: "Total Expenses", value: `$${totalExpense.toLocaleString(undefined, {minimumFractionDigits: 2})}`, icon: TrendingDown },
    { title: "Total Clients", value: totalClients.toString(), icon: Building2 },
    { title: "Transactions", value: totalTransactions.toString(), icon: Target },
  ];

  const funnels = [
    { label: "Active Budgets", value: activeBudgets.toString() },
    { label: "Recurring Setups", value: activeRecurring.toString() },
    { label: "Avg Transaction Size", value: totalTransactions > 0 ? `$${((totalIncome + totalExpense) / totalTransactions).toFixed(2)}` : "$0.00" },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 w-full">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Growth & Financials</h1>
        <p className="text-muted-foreground mt-2 text-sm sm:text-base">
          Monitor your organization's financial growth, client acquisition, and overall activity.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric) => (
          <Card key={metric.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{metric.title}</CardTitle>
              <metric.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metric.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Workspace Engagement</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="space-y-6 mt-2">
              {funnels.map((funnel) => (
                <div key={funnel.label} className="flex items-center">
                  <div className="ml-4 space-y-1 flex-1">
                    <p className="text-sm font-medium leading-none">{funnel.label}</p>
                  </div>
                  <div className="ml-auto font-medium pr-4">{funnel.value}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
