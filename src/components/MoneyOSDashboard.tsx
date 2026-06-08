import React, { useState, useEffect } from 'react';
import {
  Plus, Search, LogOut, Wallet, Moon, Sun, RefreshCw, AlertCircle, 
  User, Activity, FileSpreadsheet, Target, CalendarDays, Trash2, Edit2, 
  Users, FileText, Settings, Briefcase, Paperclip, ChevronRight
} from 'lucide-react';
import { BrandMark } from '@/components/ui/BrandMark';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  ResponsiveContainer, PieChart, Pie, Cell 
} from 'recharts';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';

export default function MoneyOSDashboard({ user, onLogout, darkMode, setDarkMode }: any) {
  const [toasts, setToasts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview'|'budgets'|'recurring'|'clients'|'team'|'logs'|'settings'>('overview');

  // Data States
  const [tenant, setTenant] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [recurring, setRecurring] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [teamUsers, setTeamUsers] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  // Modal States
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [txType, setTxType] = useState<'Credit' | 'Debit'>('Debit');
  const [txAmount, setTxAmount] = useState('');
  const [txDesc, setTxDesc] = useState('');
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [txCategory, setTxCategory] = useState('');
  const [txAccountId, setTxAccountId] = useState('');
  const [txClientId, setTxClientId] = useState('');
  const [txNotes, setTxNotes] = useState('');
  const [txLoading, setTxLoading] = useState(false);

  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [budgetCategory, setBudgetCategory] = useState('');
  const [budgetLimit, setBudgetLimit] = useState('');

  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [recType, setRecType] = useState<'Credit' | 'Debit'>('Debit');
  const [recAmount, setRecAmount] = useState('');
  const [recDesc, setRecDesc] = useState('');
  const [recCategory, setRecCategory] = useState('');
  const [recAccountId, setRecAccountId] = useState('');
  const [recInterval, setRecInterval] = useState<'Daily'|'Weekly'|'Monthly'>('Monthly');
  const [recNextRun, setRecNextRun] = useState(new Date().toISOString().split('T')[0]);

  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState('Checking');
  const [newAccountBalance, setNewAccountBalance] = useState('0');

  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [editingRecurringId, setEditingRecurringId] = useState<string | null>(null);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);

  const appMode = tenant?.appMode || 'Standard';
  const clientTerm = appMode === 'Student_Club' ? 'Sponsors' : 'Clients';
  const singleClientTerm = appMode === 'Student_Club' ? 'Sponsor' : 'Client';
  const incomeTerm = appMode === 'Student_Club' ? 'Funds Collected' : (appMode === 'Agency' ? 'Revenue' : 'Income');
  const expenseTerm = appMode === 'Student_Club' ? 'Event Expenses' : 'Expenses';

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  };

  const handleDelete = async (endpoint: string, id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;
    try {
      const res = await fetch(`/api/${endpoint}/${id}`, { method: 'DELETE' });
      if (res.ok) { showToast('Deleted successfully', 'success'); fetchData(); }
      else showToast('Failed to delete', 'error');
    } catch(e) { showToast('Error deleting', 'error'); }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      await fetch('/api/recurring/trigger', { method: 'POST' });
      const [txRes, accRes, catRes, budRes, recRes, cliRes, tenRes] = await Promise.all([
        fetch('/api/transactions'), fetch('/api/accounts'), fetch('/api/categories'),
        fetch('/api/budgets'), fetch('/api/recurring'), fetch('/api/clients'), fetch('/api/tenant')
      ]);

      if (tenRes.ok) setTenant((await tenRes.json()).tenant);
      if (txRes.ok) setTransactions((await txRes.json()).transactions || []);
      if (accRes.ok) {
        const accs = (await accRes.json()).accounts || [];
        setAccounts(accs);
        if (accs.length > 0 && !txAccountId) { setTxAccountId(accs[0].id); setRecAccountId(accs[0].id); }
      }
      if (catRes.ok) setCategories((await catRes.json()).categories || []);
      if (budRes.ok) setBudgets((await budRes.json()).budgets || []);
      if (recRes.ok) setRecurring((await recRes.json()).recurring || []);
      if (cliRes.ok) setClients((await cliRes.json()).clients || []);
    } catch (err) {
      showToast('Error loading data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchAdminData = async () => {
    if (user.role !== 'TENANT_ADMIN') return;
    try {
      const [usersRes, logsRes] = await Promise.all([ fetch('/api/tenant/users'), fetch('/api/logs') ]);
      if (usersRes.ok) setTeamUsers((await usersRes.json()).users || []);
      if (logsRes.ok) setLogs((await logsRes.json()).logs || []);
    } catch(e) {}
  };

  useEffect(() => { 
    fetchData(); 
    if (user.role === 'TENANT_ADMIN') fetchAdminData();
  }, []);

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxLoading(true);
    try {
      const url = editingTxId ? `/api/transactions/${editingTxId}` : '/api/transactions';
      const method = editingTxId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: txType, amount: txAmount, description: txDesc, date: txDate, category: txCategory, accountId: txAccountId, clientId: txClientId, notes: txNotes })
      });
      if (res.ok) {
        showToast(`Transaction saved`, 'success');
        setIsTxModalOpen(false); setTxDesc(''); setTxAmount(''); setTxNotes(''); setEditingTxId(null);
        fetchData();
      } else showToast('Failed to save', 'error');
    } catch (err) { showToast('Error saving transaction', 'error'); } 
    finally { setTxLoading(false); }
  };

  const handleAddBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingBudgetId ? `/api/budgets/${editingBudgetId}` : '/api/budgets';
      const method = editingBudgetId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: budgetCategory, limitAmount: budgetLimit, month: new Date().toISOString().substring(0, 7) })
      });
      if (res.ok) { showToast('Budget saved', 'success'); setIsBudgetModalOpen(false); setEditingBudgetId(null); fetchData(); }
    } catch (err) { showToast('Failed to save budget', 'error'); }
  };

  const handleAddRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingRecurringId ? `/api/recurring/${editingRecurringId}` : '/api/recurring';
      const method = editingRecurringId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: recType, description: recDesc, amount: recAmount, accountId: recAccountId, category: recCategory, interval: recInterval, nextRunDate: recNextRun })
      });
      if (res.ok) { showToast('Recurring saved', 'success'); setIsRecurringModalOpen(false); setEditingRecurringId(null); fetchData(); }
    } catch (err) { showToast('Failed to save recurring', 'error'); }
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingClientId ? `/api/clients/${editingClientId}` : '/api/clients';
      const method = editingClientId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clientName, email: clientEmail })
      });
      if (res.ok) { showToast(`${singleClientTerm} saved`, 'success'); setIsClientModalOpen(false); setClientName(''); setEditingClientId(null); fetchData(); }
    } catch (err) {}
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/tenant/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername, password: newUserPassword })
      });
      if (res.ok) { showToast('User created', 'success'); setIsUserModalOpen(false); fetchAdminData(); }
      else showToast('Failed to create user', 'error');
    } catch (e) {}
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingCategoryId ? `/api/categories/${editingCategoryId}` : '/api/categories';
      const method = editingCategoryId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategoryName })
      });
      if (res.ok) { showToast('Category saved', 'success'); setIsCategoryModalOpen(false); setNewCategoryName(''); setEditingCategoryId(null); fetchData(); }
    } catch (e) {}
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingAccountId ? `/api/accounts/${editingAccountId}` : '/api/accounts';
      const method = editingAccountId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newAccountName, type: newAccountType, initialBalance: Number(newAccountBalance) })
      });
      if (res.ok) { showToast('Account saved', 'success'); setIsAccountModalOpen(false); setNewAccountName(''); setNewAccountBalance('0'); setEditingAccountId(null); fetchData(); }
    } catch (e) {}
  };

  const updateAppMode = async (mode: string) => {
    try {
      const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appMode: mode }) });
      if (res.ok) { showToast('Settings updated', 'success'); fetchData(); }
    } catch (e) {}
  };

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(transactions.map(t => ({
      Date: t.date,
      Type: t.type,
      Description: t.description,
      Amount: t.amount,
      Category: t.category,
      Notes: t.notes
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
    XLSX.writeFile(wb, "Transactions_Export.xlsx");
  };

  // --- Derived Analytics ---
  const currentMonthPrefix = new Date().toISOString().substring(0, 7);
  const monthTxs = transactions.filter(t => t.date.startsWith(currentMonthPrefix));
  const incomeThisMonth = monthTxs.filter(t => t.type === 'Credit').reduce((acc, t) => acc + t.amount, 0);
  const expenseThisMonth = monthTxs.filter(t => t.type === 'Debit').reduce((acc, t) => acc + t.amount, 0);
  const profitLoss = incomeThisMonth - expenseThisMonth;

  const totalBalance = accounts.reduce((acc, a) => {
    const accTxs = transactions.filter(t => t.accountId === a.id);
    const cr = accTxs.filter(t => t.type === 'Credit').reduce((s, t) => s + t.amount, 0);
    const dr = accTxs.filter(t => t.type === 'Debit').reduce((s, t) => s + t.amount, 0);
    return acc + (a.initialBalance + cr - dr);
  }, 0);

  const catMap: Record<string, number> = {};
  monthTxs.filter(t => t.type === 'Debit').forEach(t => { catMap[t.category || 'Uncategorized'] = (catMap[t.category || 'Uncategorized'] || 0) + t.amount; });
  const pieData = Object.keys(catMap).map(k => ({ name: k, value: catMap[k] })).sort((a,b) => b.value - a.value);
  const COLORS = ['#171717', '#525252', '#737373', '#a3a3a3', '#d4d4d4'];

  const trendDataMap: Record<string, any> = {};
  Array.from({length: 30}, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (29 - i)); return d.toISOString().split('T')[0]; })
    .forEach(d => { trendDataMap[d] = { date: d, income: 0, expense: 0 }; });
  transactions.forEach(t => { if (trendDataMap[t.date]) { if (t.type === 'Credit') trendDataMap[t.date].income += t.amount; else trendDataMap[t.date].expense += t.amount; }});
  const trendData = Object.values(trendDataMap);

  const filteredTransactions = transactions.filter(t => t.description.toLowerCase().includes(searchQuery.toLowerCase()) || t.category?.toLowerCase().includes(searchQuery.toLowerCase()) || t.username?.toLowerCase().includes(searchQuery.toLowerCase()) || t.amount.toString().includes(searchQuery));
  const filteredLogs = logs.filter(l => l.action.toLowerCase().includes(searchQuery.toLowerCase()) || l.username.toLowerCase().includes(searchQuery.toLowerCase()));

  // Tab config
  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'budgets', label: 'Budgets' },
    { id: 'recurring', label: 'Recurring' },
    { id: 'clients', label: clientTerm },
    { id: 'team', label: 'Team', adminOnly: true },
    { id: 'logs', label: 'Logs', adminOnly: true },
    { id: 'settings', label: 'Settings', adminOnly: true }
  ];

  return (
    <div className={`min-h-screen flex flex-col ${darkMode ? 'bg-[#000000] text-[#ededed]' : 'bg-[#ffffff] text-[#171717]'}`}>
      
      {/* Impersonation Banner */}
      {user?.impersonatedBy && (
        <div className="bg-rose-500 text-white text-[13px] font-medium py-1.5 px-4 text-center z-[100] sticky top-0">
          ⚠️ Impersonating {user.username}
        </div>
      )}

      {/* Floating Toasts */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id} className="flex items-center gap-2.5 px-4 py-2 rounded-md shadow-sm border bg-white dark:bg-[#0a0a0a] border-neutral-200 dark:border-neutral-800 text-[13px] font-medium animate-in">
            {t.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-500" />}
            {t.type === 'success' && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>

      {/* Top Header - Minimalist */}
      <header className={`sticky top-0 z-40 border-b flex h-14 items-center justify-between px-4 lg:px-6 ${darkMode ? 'bg-[#000000]/80 border-neutral-800 backdrop-blur-md' : 'bg-white/80 border-neutral-200 backdrop-blur-md'}`}>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <BrandMark size={24} className={`${darkMode ? 'text-neutral-200' : 'text-neutral-800'}`} />
            <span className="font-semibold text-[14px] tracking-tight">Money OS</span>
            <span className="text-neutral-400 dark:text-neutral-600 px-1">/</span>
            <span className="text-[14px] font-medium text-neutral-500">{tenant?.name || 'Workspace'}</span>
          </div>

          <nav className="hidden md:flex items-center gap-1 ml-4">
            {TABS.map(tab => {
              if (tab.adminOnly && user?.role !== 'TENANT_ADMIN') return null;
              const isActive = activeTab === tab.id;
              return (
                <button 
                  key={tab.id} 
                  onClick={() => setActiveTab(tab.id as any)} 
                  className={`px-3 py-1.5 text-[13px] font-medium rounded-md transition-colors ${isActive ? 'bg-neutral-100 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100' : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-300'}`}
                >
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative hidden md:flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-2.5 text-neutral-500" />
            <Input 
              type="text" 
              placeholder="Search..." 
              className="w-48 pl-8 h-8 rounded-md bg-transparent" 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
            />
          </div>
          <Button variant="ghost" size="icon" onClick={() => setDarkMode(!darkMode)} className="rounded-full w-8 h-8 text-neutral-500">
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
          <div className="w-7 h-7 rounded-full bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-[11px] font-medium">
            {user?.username.charAt(0).toUpperCase()}
          </div>
          <Button variant="ghost" size="icon" onClick={onLogout} className="w-8 h-8 text-neutral-500 hover:text-rose-500 dark:hover:text-rose-400">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1200px] w-full mx-auto p-4 md:p-8 space-y-8 relative">
        {loading && <div className="absolute top-4 right-8"><RefreshCw className="w-4 h-4 animate-spin text-neutral-400" /></div>}

        {activeTab === 'overview' && (
          <div className="space-y-6 animate-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
                <p className="text-[13px] text-neutral-500 mt-1">Current month metrics and activity.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setTxType('Credit'); setIsTxModalOpen(true); }} className="text-emerald-600 dark:text-emerald-400 border-neutral-200 dark:border-neutral-800">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add {incomeTerm}
                </Button>
                <Button variant="default" onClick={() => { setTxType('Debit'); setIsTxModalOpen(true); }}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add {expenseTerm}
                </Button>
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">Total Balance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold tabular-nums">₹{totalBalance.toLocaleString()}</div>
                  <div className="flex gap-1.5 flex-wrap mt-2">
                    {accounts.map(a => {
                      const bal = transactions.filter(t => t.accountId === a.id).reduce((sum, t) => sum + (t.type === 'Credit' ? t.amount : -t.amount), a.initialBalance);
                      return <span key={a.id} className="text-[11px] font-medium text-neutral-500">{a.name}: ₹{bal}</span>
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">{incomeTerm} (Current)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">₹{incomeThisMonth.toLocaleString()}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">{expenseTerm} (Current)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold tabular-nums">₹{expenseThisMonth.toLocaleString()}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">Net Position</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-semibold tabular-nums ${profitLoss >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-900 dark:text-neutral-100'}`}>
                    {profitLoss >= 0 ? '+' : ''}₹{profitLoss.toLocaleString()}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-[14px]">Cash Flow</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[240px] w-full">
                    {transactions.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorInc" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                            <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#737373" stopOpacity={0.1}/><stop offset="95%" stopColor="#737373" stopOpacity={0}/></linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? '#262626' : '#e5e5e5'} />
                          <XAxis dataKey="date" tick={{fontSize: 11, fill: '#737373'}} tickLine={false} axisLine={false} />
                          <YAxis tick={{fontSize: 11, fill: '#737373'}} tickLine={false} axisLine={false} tickFormatter={(val) => `₹${val}`} />
                          <RechartsTooltip contentStyle={{ backgroundColor: darkMode ? '#0a0a0a' : '#fff', borderRadius: '8px', border: `1px solid ${darkMode ? '#262626' : '#e5e5e5'}`, fontSize: '12px' }} />
                          <Area type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorInc)" />
                          <Area type="monotone" dataKey="expense" stroke="#737373" strokeWidth={2} fillOpacity={1} fill="url(#colorExp)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-[13px] text-neutral-500">No data available</div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-[14px]">Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[180px]">
                    {pieData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value" stroke="none">
                            {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                          </Pie>
                          <RechartsTooltip contentStyle={{ backgroundColor: darkMode ? '#0a0a0a' : '#fff', borderRadius: '8px', border: `1px solid ${darkMode ? '#262626' : '#e5e5e5'}`, fontSize: '12px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-[13px] text-neutral-500">No data available</div>
                    )}
                  </div>
                  <div className="mt-4 space-y-2">
                    {pieData.slice(0, 3).map((d, i) => (
                      <div key={i} className="flex justify-between items-center text-[12px] font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                          <span className="text-neutral-600 dark:text-neutral-400">{d.name}</span>
                        </div>
                        <span className="tabular-nums">₹{d.value}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Transactions Table */}
            <Card>
              <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex justify-between items-center">
                <CardTitle className="text-[14px]">Recent Transactions</CardTitle>
                <Button variant="ghost" size="sm" onClick={exportToExcel} className="h-7 text-[12px]">
                  <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" /> Export
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.slice(0, 20).map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${t.type === 'Credit' ? 'bg-emerald-500' : 'bg-neutral-400'}`} />
                          {t.description}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 text-[11px] text-neutral-500 bg-neutral-50 dark:bg-neutral-900">
                          {t.category || 'None'}
                        </span>
                      </TableCell>
                      <TableCell className="text-[12px] text-neutral-500">
                        {t.clientId && <span>{clients.find(c=>c.id===t.clientId)?.name}</span>}
                        {t.notes && <span className="ml-2 truncate max-w-[150px] inline-block align-bottom">{t.notes}</span>}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums font-medium ${t.type === 'Credit' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                        {t.type === 'Credit' ? '+' : '-'}₹{t.amount.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredTransactions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center text-neutral-500">No transactions found.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </div>
        )}

        {/* --- Other Tabs following brutalist/minimalist patterns --- */}
        {activeTab === 'clients' && (
          <div className="space-y-6 animate-in">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">{clientTerm}</h1>
                <p className="text-[13px] text-neutral-500 mt-1">Manage entity records.</p>
              </div>
              <Button onClick={() => setIsClientModalOpen(true)}>Add {singleClientTerm}</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {clients.map(c => {
                const revenue = transactions.filter(t => t.clientId === c.id && t.type === 'Credit').reduce((s, t) => s + t.amount, 0);
                return (
                  <Card key={c.id}>
                    <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
                      <div>
                        <CardTitle className="text-[14px]">{c.name}</CardTitle>
                        <CardDescription>{c.email || 'No email'}</CardDescription>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingClientId(c.id); setClientName(c.name); setClientEmail(c.email || ''); setIsClientModalOpen(true); }}><Edit2 className="w-3 h-3"/></Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-rose-500" onClick={() => handleDelete('clients', c.id, c.name)}><Trash2 className="w-3 h-3"/></Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-[11px] uppercase font-medium text-neutral-500 mb-1">Total {incomeTerm}</div>
                      <div className="text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">₹{revenue.toLocaleString()}</div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Settings Tab - dense data management */}
        {activeTab === 'settings' && (
          <div className="max-w-4xl animate-in space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
              <p className="text-[13px] text-neutral-500 mt-1">Manage workspace preferences and data schemas.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                  <CardTitle className="text-[14px]">Categories</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => { setEditingCategoryId(null); setNewCategoryName(''); setIsCategoryModalOpen(true); }}>Add</Button>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableBody>
                      {categories.map(c => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium text-[13px]">{c.name}</TableCell>
                          <TableCell className="text-right py-2">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingCategoryId(c.id); setNewCategoryName(c.name); setIsCategoryModalOpen(true); }}><Edit2 className="w-3 h-3"/></Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-rose-500" onClick={() => handleDelete('categories', c.id, c.name)}><Trash2 className="w-3 h-3"/></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                  <CardTitle className="text-[14px]">Accounts</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => { setEditingAccountId(null); setNewAccountName(''); setNewAccountBalance('0'); setIsAccountModalOpen(true); }}>Add</Button>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableBody>
                      {accounts.map(a => (
                        <TableRow key={a.id}>
                          <TableCell>
                            <div className="font-medium text-[13px]">{a.name}</div>
                            <div className="text-[11px] text-neutral-500">{a.type}</div>
                          </TableCell>
                          <TableCell className="text-right py-2">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingAccountId(a.id); setNewAccountName(a.name); setNewAccountType(a.type); setNewAccountBalance(a.initialBalance.toString()); setIsAccountModalOpen(true); }}><Edit2 className="w-3 h-3"/></Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-rose-500" onClick={() => handleDelete('accounts', a.id, a.name)}><Trash2 className="w-3 h-3"/></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-[14px]">Application Mode</CardTitle>
                <CardDescription>Changes terminology globally across the interface.</CardDescription>
              </CardHeader>
              <CardContent className="flex gap-3">
                {['Standard', 'Student_Club', 'Agency'].map(mode => (
                  <Button 
                    key={mode} 
                    variant={appMode === mode ? 'default' : 'outline'} 
                    onClick={() => updateAppMode(mode)}
                  >
                    {mode.replace('_', ' ')}
                  </Button>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Minimalist Modals */}
        {isTxModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in">
            <Card className="w-full max-w-md shadow-2xl">
              <CardHeader className="border-b border-neutral-200 dark:border-neutral-800">
                <CardTitle>Record {txType}</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <form onSubmit={handleAddTransaction} className="space-y-4">
                  <div>
                    <label className="block text-[12px] font-medium mb-1.5">Amount (₹)</label>
                    <Input type="number" value={txAmount} onChange={e => setTxAmount(e.target.value)} required min="1" step="0.01" autoFocus className="text-lg font-medium h-10" />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium mb-1.5">Description</label>
                    <Input type="text" value={txDesc} onChange={e => setTxDesc(e.target.value)} required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[12px] font-medium mb-1.5">Category</label>
                      <select value={txCategory} onChange={e => setTxCategory(e.target.value)} className="w-full h-8 px-2 text-[13px] rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent outline-none">
                        <option value="">Select...</option>
                        {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium mb-1.5">Account</label>
                      <select value={txAccountId} onChange={e => setTxAccountId(e.target.value)} className="w-full h-8 px-2 text-[13px] rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent outline-none" required>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium mb-1.5">Date</label>
                    <Input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} required />
                  </div>
                  <div className="pt-4 flex justify-end gap-2 border-t border-neutral-200 dark:border-neutral-800 mt-6">
                    <Button type="button" variant="ghost" onClick={() => setIsTxModalOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={txLoading}>{txLoading ? 'Saving...' : 'Save'}</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Fallback rendering for un-refactored tabs to avoid errors during progressive rewrite */}
        {(activeTab === 'budgets' || activeTab === 'recurring' || activeTab === 'team' || activeTab === 'logs') && (
           <div className="animate-in">
             <Card>
               <CardContent className="p-12 text-center text-[13px] text-neutral-500">
                 This module is currently being redesigned to match the new UI architecture.
               </CardContent>
             </Card>
           </div>
        )}
      </main>
    </div>
  );
}
