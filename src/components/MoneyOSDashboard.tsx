import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Search, ArrowUpRight, ArrowDownRight, LogOut, Wallet, 
  Moon, Sun, RefreshCw, AlertCircle, User, Activity, FileSpreadsheet, 
  Target, CalendarDays, Trash2, Edit2, Users, FileText, Settings, Briefcase, Paperclip,
  TrendingUp, TrendingDown
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  ResponsiveContainer, PieChart, Pie, Cell 
} from 'recharts';
import * as XLSX from 'xlsx';

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

  const handleDelete = async (endpoint: string, id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;
    try {
      const res = await fetch(`/api/${endpoint}/${id}`, { method: 'DELETE' });
      if (res.ok) { showToast('Deleted successfully', 'success'); fetchData(); }
      else showToast('Failed to delete', 'error');
    } catch(e) { showToast('Error deleting', 'error'); }
  };


  // Terminology mappings based on AppMode
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
        showToast(`Transaction ${editingTxId ? 'updated' : 'added'}!`, 'success');
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
      if (res.ok) { showToast('Budget saved!', 'success'); setIsBudgetModalOpen(false); setEditingBudgetId(null); fetchData(); }
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
      if (res.ok) { showToast('Recurring saved!', 'success'); setIsRecurringModalOpen(false); setEditingRecurringId(null); fetchData(); }
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
      if (res.ok) { showToast(`${singleClientTerm} saved!`, 'success'); setIsClientModalOpen(false); setClientName(''); setEditingClientId(null); fetchData(); }
    } catch (err) {}
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/tenant/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername, password: newUserPassword })
      });
      if (res.ok) { showToast('User created!', 'success'); setIsUserModalOpen(false); fetchAdminData(); }
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
      if (res.ok) { showToast('Category saved!', 'success'); setIsCategoryModalOpen(false); setNewCategoryName(''); setEditingCategoryId(null); fetchData(); }
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
      if (res.ok) { showToast('Account saved!', 'success'); setIsAccountModalOpen(false); setNewAccountName(''); setNewAccountBalance('0'); setEditingAccountId(null); fetchData(); }
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
  const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#10b981'];

  const trendDataMap: Record<string, any> = {};
  Array.from({length: 30}, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (29 - i)); return d.toISOString().split('T')[0]; })
    .forEach(d => { trendDataMap[d] = { date: d, income: 0, expense: 0 }; });
  transactions.forEach(t => { if (trendDataMap[t.date]) { if (t.type === 'Credit') trendDataMap[t.date].income += t.amount; else trendDataMap[t.date].expense += t.amount; }});
  const trendData = Object.values(trendDataMap);

  const filteredTransactions = transactions.filter(t => t.description.toLowerCase().includes(searchQuery.toLowerCase()) || t.category?.toLowerCase().includes(searchQuery.toLowerCase()) || t.username?.toLowerCase().includes(searchQuery.toLowerCase()) || t.amount.toString().includes(searchQuery));
  const filteredLogs = logs.filter(l => l.action.toLowerCase().includes(searchQuery.toLowerCase()) || l.username.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-500 ${darkMode ? 'bg-[#0a0f1c] text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      
      {/* Impersonation Banner */}
      {user?.impersonatedBy && (
        <div className="bg-rose-500 text-white text-center py-2 px-4 text-sm font-bold flex justify-center items-center gap-4 z-[100] sticky top-0 shadow-md">
          <span>⚠️ You are impersonating {user.username}. Actions logged as Super Admin.</span>
          <button onClick={onLogout} className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-md text-xs border border-white/20">Exit Impersonation</button>
        </div>
      )}

      {/* Floating Toasts */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id} className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl border backdrop-blur-md text-sm ${t.type === 'success' ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400' : 'bg-rose-500/15 border-rose-500/35 text-rose-400'}`}>
            <span>{t.text}</span>
          </div>
        ))}
      </div>

      {/* Top Navbar */}
      <nav className={`sticky top-0 z-40 border-b backdrop-blur-xl ${darkMode ? 'bg-[#0a0f1c]/80 border-slate-800/60' : 'bg-white/80 border-slate-200'}`}>
        <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-3.5 flex justify-between items-center">
          <div className="flex items-center gap-2.5 font-black text-xl tracking-tight">
            <div className="bg-gradient-to-tr from-indigo-500 to-fuchsia-500 p-2.5 rounded-xl text-white shadow-lg shadow-indigo-500/20">
              <Wallet className="w-5 h-5" />
            </div>
            <span className="bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-rose-400 bg-clip-text text-transparent hidden sm:inline">Money OS</span>
          </div>

          <div className="flex items-center gap-3">
            <div className={`hidden md:flex items-center px-4 py-2 rounded-full border ${darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'}`}>
              <Search className="w-4 h-4 text-slate-400 mr-2" />
              <input type="text" placeholder="Global Search..." className="bg-transparent outline-none text-sm w-48" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            
            <button onClick={() => setDarkMode(!darkMode)} className={`p-2.5 rounded-xl border transition-all ${darkMode ? 'border-slate-800 bg-slate-900/50 text-amber-400 hover:bg-slate-800' : 'border-slate-200 bg-white text-indigo-600 hover:bg-slate-50'}`}>
              {darkMode ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
            </button>

            <div className={`hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold ${darkMode ? 'border-slate-800 bg-slate-900/50' : 'border-slate-200 bg-white'}`}>
              <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-indigo-500 to-fuchsia-500 flex items-center justify-center text-[10px] text-white">{user?.username.charAt(0).toUpperCase()}</div>
              <span>{user?.username}</span>
            </div>

            <button onClick={onLogout} className={`p-2.5 rounded-xl border transition-all ${darkMode ? 'bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white' : 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-500 hover:text-white'}`}>
              <LogOut className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      </nav>

      {/* Sub Navigation Tabs */}
      <div className={`border-b ${darkMode ? 'border-slate-800/60 bg-slate-900/20' : 'border-slate-200 bg-white'}`}>
        <div className="max-w-[1400px] mx-auto px-4 lg:px-8 flex gap-2 overflow-x-auto hide-scrollbar">
          {[
            { id: 'overview', label: 'Overview', icon: Activity },
            { id: 'budgets', label: 'Budgets', icon: Target },
            { id: 'recurring', label: 'Recurring', icon: CalendarDays },
            { id: 'clients', label: clientTerm, icon: Briefcase },
            { id: 'team', label: 'Team', icon: Users, adminOnly: true },
            { id: 'logs', label: 'Logs', icon: FileText, adminOnly: true },
            { id: 'settings', label: 'Settings', icon: Settings, adminOnly: true }
          ].map(tab => {
            if (tab.adminOnly && user?.role !== 'TENANT_ADMIN') return null;
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`py-4 px-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${isActive ? 'border-indigo-500 text-indigo-500' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-500' : 'text-slate-400'}`} /> {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto p-4 md:p-6 lg:p-8 space-y-8 relative">
        {loading && <div className="absolute top-0 right-8"><RefreshCw className="w-5 h-5 animate-spin text-indigo-500" /></div>}

        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h1 className="text-3xl font-black tracking-tight">Overview</h1>
                <p className="text-slate-500 text-sm mt-1">Here's what's happening with your money this month.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setTxType('Credit'); setIsTxModalOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-xl hover:bg-emerald-500 hover:text-white transition font-bold text-sm shadow-sm backdrop-blur-md">
                  <ArrowUpRight className="w-4 h-4" /> Quick {incomeTerm}
                </button>
                <button onClick={() => { setTxType('Debit'); setIsTxModalOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-xl hover:bg-rose-500 hover:text-white transition font-bold text-sm shadow-sm backdrop-blur-md">
                  <ArrowDownRight className="w-4 h-4" /> Quick {expenseTerm}
                </button>
              </div>
            </div>

            {/* Premium Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className={`relative overflow-hidden p-6 rounded-3xl border shadow-lg transition-transform hover:-translate-y-1 ${darkMode ? 'bg-gradient-to-br from-indigo-900/40 to-slate-900/80 border-indigo-500/20' : 'bg-gradient-to-br from-indigo-50 to-white border-indigo-200'}`}>
                <div className="absolute -top-4 -right-4 p-4 opacity-10 rotate-12"><Wallet className="w-32 h-32 text-indigo-500" /></div>
                <div className="relative z-10">
                  <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>Total Balance</p>
                  <h3 className="text-4xl font-black mb-3">₹{totalBalance.toLocaleString()}</h3>
                  <div className="flex gap-2 flex-wrap">
                    {accounts.map(a => {
                      const bal = transactions.filter(t => t.accountId === a.id).reduce((sum, t) => sum + (t.type === 'Credit' ? t.amount : -t.amount), a.initialBalance);
                      return <span key={a.id} className={`text-[10px] px-2.5 py-1 rounded-full font-bold border ${darkMode ? 'bg-slate-950/50 border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-600'}`}>{a.name}: ₹{bal}</span>
                    })}
                  </div>
                </div>
              </div>

              <div className={`relative overflow-hidden p-6 rounded-3xl border shadow-lg transition-transform hover:-translate-y-1 ${darkMode ? 'bg-gradient-to-br from-emerald-900/30 to-slate-900/80 border-emerald-500/20' : 'bg-gradient-to-br from-emerald-50 to-white border-emerald-200'}`}>
                <div className="absolute -top-4 -right-4 p-4 opacity-10 -rotate-12"><TrendingUp className="w-32 h-32 text-emerald-500" /></div>
                <div className="relative z-10">
                  <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>{incomeTerm} (This Month)</p>
                  <h3 className="text-4xl font-black text-emerald-500">₹{incomeThisMonth.toLocaleString()}</h3>
                </div>
              </div>

              <div className={`relative overflow-hidden p-6 rounded-3xl border shadow-lg transition-transform hover:-translate-y-1 ${darkMode ? 'bg-gradient-to-br from-rose-900/30 to-slate-900/80 border-rose-500/20' : 'bg-gradient-to-br from-rose-50 to-white border-rose-200'}`}>
                <div className="absolute -top-4 -right-4 p-4 opacity-10 rotate-6"><TrendingDown className="w-32 h-32 text-rose-500" /></div>
                <div className="relative z-10">
                  <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-rose-400' : 'text-rose-600'}`}>{expenseTerm} (This Month)</p>
                  <h3 className="text-4xl font-black text-rose-500">₹{expenseThisMonth.toLocaleString()}</h3>
                </div>
              </div>

              <div className={`relative overflow-hidden p-6 rounded-3xl border shadow-lg transition-transform hover:-translate-y-1 ${darkMode ? 'bg-gradient-to-br from-fuchsia-900/30 to-slate-900/80 border-fuchsia-500/20' : 'bg-gradient-to-br from-fuchsia-50 to-white border-fuchsia-200'}`}>
                <div className="absolute -top-4 -right-4 p-4 opacity-10 -rotate-6"><Activity className="w-32 h-32 text-fuchsia-500" /></div>
                <div className="relative z-10">
                  <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-fuchsia-400' : 'text-fuchsia-600'}`}>Net Profit/Loss</p>
                  <h3 className={`text-4xl font-black ${profitLoss >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {profitLoss >= 0 ? '+' : '-'}₹{Math.abs(profitLoss).toLocaleString()}
                  </h3>
                </div>
              </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className={`lg:col-span-2 p-6 rounded-3xl border shadow-lg ${darkMode ? 'bg-slate-900/50 border-slate-800/60' : 'bg-white border-slate-200'}`}>
                <h3 className="text-lg font-bold mb-6">Cash Flow Trend</h3>
                <div className="h-72 w-full">
                  {transactions.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorInc" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                          <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4}/><stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/></linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? '#1e293b' : '#e2e8f0'} />
                        <XAxis dataKey="date" tick={{fontSize: 12, fill: '#64748b'}} tickLine={false} axisLine={false} />
                        <YAxis tick={{fontSize: 12, fill: '#64748b'}} tickLine={false} axisLine={false} tickFormatter={(val) => `₹${val}`} />
                        <RechartsTooltip contentStyle={{ backgroundColor: darkMode ? '#0f172a' : '#fff', borderRadius: '12px', border: '1px solid #334155', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)' }} />
                        <Area type="monotone" dataKey="income" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorInc)" />
                        <Area type="monotone" dataKey="expense" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorExp)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50">
                      <Activity className="w-16 h-16 mb-2" />
                      <p>Add transactions to see cash flow trends</p>
                    </div>
                  )}
                </div>
              </div>
              <div className={`p-6 rounded-3xl border shadow-lg flex flex-col ${darkMode ? 'bg-slate-900/50 border-slate-800/60' : 'bg-white border-slate-200'}`}>
                <h3 className="text-lg font-bold mb-6">Top Spending</h3>
                <div className="flex-1 min-h-[220px]">
                  {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={70} outerRadius={90} paddingAngle={5} dataKey="value" stroke="none">
                          {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                        </Pie>
                        <RechartsTooltip contentStyle={{ backgroundColor: darkMode ? '#0f172a' : '#fff', borderRadius: '12px', border: 'none' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50">
                      <Target className="w-16 h-16 mb-2" />
                      <p>No expenses this month</p>
                    </div>
                  )}
                </div>
                <div className="mt-4 space-y-3">
                  {pieData.slice(0, 3).map((d, i) => (
                    <div key={i} className="flex justify-between items-center text-sm font-semibold">
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full shadow-inner" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                        {d.name}
                      </div>
                      <span className="font-bold">₹{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Transactions Table */}
            <div className={`rounded-3xl border shadow-lg overflow-hidden ${darkMode ? 'bg-slate-900/50 border-slate-800/60' : 'bg-white border-slate-200'}`}>
              <div className={`p-5 border-b flex justify-between items-center ${darkMode ? 'border-slate-800/60' : 'border-slate-200'}`}>
                <h3 className="text-lg font-bold">Recent Activity</h3>
                <button onClick={exportToExcel} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg hover:bg-indigo-500 hover:text-white transition font-bold text-xs">
                  <FileSpreadsheet className="w-4 h-4" /> Export CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className={`text-[10px] uppercase font-black tracking-wider ${darkMode ? 'bg-slate-950/50 text-slate-400 border-slate-800' : 'bg-slate-50 text-slate-500 border-slate-200'} border-b`}>
                    <tr>
                      <th className="px-6 py-4">Transaction</th>
                      <th className="px-6 py-4">Category</th>
                      <th className="px-6 py-4">Client/Notes</th>
                      <th className="px-6 py-4">Account</th>
                      <th className="px-6 py-4">Team Member</th>
                      <th className="px-6 py-4 text-right">Amount</th><th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.slice(0, 20).map(t => (
                      <tr key={t.id} className={`border-b last:border-0 ${darkMode ? 'border-slate-800/40 hover:bg-slate-800/60' : 'border-slate-100 hover:bg-slate-50'}`}>
                        <td className="px-6 py-4 font-bold flex items-center gap-3">
                          <div className={`p-2 rounded-xl shrink-0 ${t.type === 'Credit' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                            {t.type === 'Credit' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                          </div>
                          {t.description}
                        </td>
                        <td className="px-6 py-4 font-semibold text-xs">
                          <span className={`px-2 py-1 rounded-md border ${darkMode ? 'bg-slate-800/50 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'}`}>{t.category || 'N/A'}</span>
                        </td>
                        <td className="px-6 py-4">
                          {t.clientId && <span className="block text-xs font-bold text-indigo-400">{clients.find(c=>c.id===t.clientId)?.name}</span>}
                          {t.notes && (
                            <a href={t.notes.startsWith('http') ? t.notes : '#'} target="_blank" className="text-xs text-slate-400 hover:text-indigo-400 flex items-center gap-1 mt-1">
                              <Paperclip className="w-3 h-3" /> {t.notes.length > 20 ? t.notes.substring(0,20)+'...' : t.notes}
                            </a>
                          )}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-400">{accounts.find(a => a.id === t.accountId)?.name || 'N/A'}</td>
                        <td className="px-6 py-4 font-semibold text-xs">{t.username || 'System'}</td>
                        <td className={`px-6 py-4 text-right font-black ${t.type === 'Credit' ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {t.type === 'Credit' ? '+' : '-'}₹{t.amount.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    {filteredTransactions.length === 0 && (
                      <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-bold">No transactions found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ... Other Tabs remain structurally similar but themed ... */}
        {activeTab === 'clients' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-black tracking-tight">{clientTerm}</h1>
                <p className="text-slate-500 text-sm mt-1">Manage and track revenue per {singleClientTerm.toLowerCase()}.</p>
              </div>
              <button onClick={() => setIsClientModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition font-bold text-sm shadow-md">
                <Plus className="w-4 h-4" /> Add {singleClientTerm}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {clients.map(c => {
                const clientTxs = transactions.filter(t => t.clientId === c.id);
                const revenue = clientTxs.filter(t => t.type === 'Credit').reduce((s, t) => s + t.amount, 0);
                return (
                  <div key={c.id} className={`p-5 rounded-3xl border shadow-lg ${darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'}`}>
                    <div className="w-12 h-12 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-black text-xl mb-4">{c.name.charAt(0)}</div>
                    <div className="flex justify-between items-center"><h3 className="text-lg font-bold">{c.name}</h3><div className="flex gap-2"><button onClick={() => { setEditingClientId(c.id); setClientName(c.name); setClientEmail(c.email || ''); setIsClientModalOpen(true); }} className="text-indigo-500 hover:text-indigo-400"><Edit2 className="w-4 h-4"/></button><button onClick={() => handleDelete('clients', c.id, c.name)} className="text-rose-500 hover:text-rose-400"><Trash2 className="w-4 h-4"/></button></div></div>
                    <p className="text-xs text-slate-400 mb-4">{c.email || 'No email'}</p>
                    <div className={`p-3 rounded-xl border ${darkMode ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                      <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Total {incomeTerm}</p>
                      <p className="text-xl font-black text-emerald-400">₹{revenue.toLocaleString()}</p>
                    </div>
                  </div>
                );
              })}
              {clients.length === 0 && <div className="col-span-full p-12 text-center text-slate-500 border border-dashed rounded-3xl border-slate-700">No {clientTerm.toLowerCase()} added yet.</div>}
            </div>
          </div>
        )}

        {/* Budgets Tab */}
        {activeTab === 'budgets' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-black tracking-tight">Budgets</h1>
                <p className="text-slate-500 text-sm mt-1">Set monthly limits to keep {expenseTerm.toLowerCase()} in check.</p>
              </div>
              <button onClick={() => setIsBudgetModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition font-bold text-sm shadow-md">
                <Plus className="w-4 h-4" /> Add Budget
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {budgets.map(b => {
                const spent = transactions.filter(t => t.type === 'Debit' && t.category === b.category && t.date.startsWith(currentMonthPrefix)).reduce((s, t) => s + t.amount, 0);
                const pct = Math.min((spent / b.limitAmount) * 100, 100);
                const isWarning = pct >= 80 && pct < 100;
                const isDanger = pct >= 100;
                return (
                  <div key={b.id} className={`p-5 rounded-3xl border shadow-lg ${darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'}`}>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold flex items-center gap-2">
                        <Target className={`w-5 h-5 ${isDanger ? 'text-rose-500' : isWarning ? 'text-amber-500' : 'text-indigo-500'}`} />
                        {b.category}
                      </h3>
                      <div className="flex items-center gap-3"><span className="text-sm font-bold text-slate-500">₹{spent} / ₹{b.limitAmount}</span><button onClick={() => { setEditingBudgetId(b.id); setBudgetCategory(b.category); setBudgetLimit(b.limitAmount.toString()); setIsBudgetModalOpen(true); }} className="text-indigo-500 hover:text-indigo-400"><Edit2 className="w-4 h-4"/></button><button onClick={() => handleDelete('budgets', b.id, b.category)} className="text-rose-500 hover:text-rose-400"><Trash2 className="w-4 h-4"/></button></div>
                    </div>
                    <div className={`w-full h-3 rounded-full overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                      <div className={`h-full rounded-full transition-all duration-1000 ${isDanger ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }}></div>
                    </div>
                    {isDanger && <p className="text-rose-500 text-xs font-bold mt-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Budget Exceeded</p>}
                  </div>
                );
              })}
              {budgets.length === 0 && <div className="col-span-full p-12 text-center text-slate-500 border border-dashed rounded-3xl border-slate-700">No budgets set.</div>}
            </div>
          </div>
        )}

        {/* Recurring Tab */}
        {activeTab === 'recurring' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-black tracking-tight">Recurring {expenseTerm}</h1>
                <p className="text-slate-500 text-sm mt-1">Automate your fixed {expenseTerm.toLowerCase()} at 0 cost.</p>
              </div>
              <button onClick={() => setIsRecurringModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition font-bold text-sm shadow-md">
                <Plus className="w-4 h-4" /> Add Recurring
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {recurring.map(r => (
                <div key={r.id} className={`p-5 rounded-3xl border shadow-lg ${darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${r.type === 'Debit' ? 'bg-rose-500/20 text-rose-500' : 'bg-emerald-500/20 text-emerald-500'}`}>
                    <CalendarDays className="w-5 h-5" />
                  </div>
                  <div className="flex justify-between items-start"><h3 className="text-lg font-bold">{r.description}</h3><div className="flex gap-2"><button onClick={() => { setEditingRecurringId(r.id); setRecType(r.type as any); setRecAmount(r.amount.toString()); setRecDesc(r.description); setRecCategory(r.category || ''); setRecAccountId(r.accountId || ''); setRecInterval(r.interval as any); setRecNextRun(r.nextRunDate); setIsRecurringModalOpen(true); }} className="text-indigo-500 hover:text-indigo-400"><Edit2 className="w-4 h-4"/></button><button onClick={() => handleDelete('recurring', r.id, r.description)} className="text-rose-500 hover:text-rose-400"><Trash2 className="w-4 h-4"/></button></div></div>
                  <p className="text-2xl font-black mt-2 mb-4">₹{r.amount}</p>
                  <div className="flex justify-between items-center text-xs font-bold text-slate-500">
                    <span className="uppercase tracking-wider">{r.interval}</span>
                    <span>Next: {r.nextRunDate}</span>
                  </div>
                </div>
              ))}
              {recurring.length === 0 && <div className="col-span-full p-12 text-center text-slate-500 border border-dashed rounded-3xl border-slate-700">No recurring {expenseTerm.toLowerCase()} setup.</div>}
            </div>
          </div>
        )}

        {/* Team Tab */}
        {activeTab === 'team' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-black tracking-tight">Team Management</h1>
                <p className="text-slate-500 text-sm mt-1">Manage users who have access to this tenant.</p>
              </div>
              <button onClick={() => setIsUserModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition font-bold text-sm shadow-md">
                <Plus className="w-4 h-4" /> Add User
              </button>
            </div>
            <div className={`rounded-3xl border shadow-lg overflow-hidden ${darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'}`}>
              <table className="w-full text-sm text-left">
                <thead className={`text-xs uppercase font-black tracking-wider ${darkMode ? 'bg-slate-950 text-slate-400' : 'bg-slate-100 text-slate-600'} border-b ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
                  <tr>
                    <th className="px-6 py-4">Username</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Created At</th>
                  </tr>
                </thead>
                <tbody>
                  {teamUsers.map(u => (
                    <tr key={u.id} className={`border-b last:border-0 ${darkMode ? 'border-slate-800/50' : 'border-slate-100'}`}>
                      <td className="px-6 py-4 font-bold flex items-center gap-3"><User className="w-4 h-4 text-slate-400" /> {u.username}</td>
                      <td className="px-6 py-4"><span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${u.role === 'TENANT_ADMIN' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>{u.role}</span></td>
                      <td className="px-6 py-4 font-mono text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && (
          <div className="space-y-6 animate-in fade-in">
            <h1 className="text-3xl font-black tracking-tight">Activity Logs</h1>
            <div className={`rounded-3xl border shadow-lg overflow-hidden ${darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'}`}>
              <table className="w-full text-sm text-left">
                <thead className={`text-[10px] uppercase font-black tracking-wider ${darkMode ? 'bg-slate-950 text-slate-400 border-slate-800' : 'bg-slate-100 text-slate-500 border-slate-200'} border-b`}>
                  <tr>
                    <th className="px-6 py-4">User</th>
                    <th className="px-6 py-4">Action</th>
                    <th className="px-6 py-4">Details</th>
                    <th className="px-6 py-4">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.slice(0, 50).map(l => (
                    <tr key={l.id} className={`border-b last:border-0 ${darkMode ? 'border-slate-800/40' : 'border-slate-100'}`}>
                      <td className="px-6 py-4 font-semibold">{l.username}</td>
                      <td className="px-6 py-4 font-bold text-xs"><span className={`px-2 py-1 rounded-md border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>{l.action}</span></td>
                      <td className="px-6 py-4">{l.details}</td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-400">{new Date(l.timestamp).toLocaleString()}</td>
                    </tr>
                  ))}
                  {filteredLogs.length === 0 && <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-500">No logs found.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl animate-in fade-in">
            <h1 className="text-3xl font-black tracking-tight mb-6">Tenant Settings</h1>
            <div className={`p-6 rounded-3xl border shadow-lg ${darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'}`}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Categories Table */}
              <div className={`p-6 md:p-8 rounded-3xl border shadow-xl flex flex-col h-[400px] transition-all ${darkMode ? 'bg-gradient-to-br from-slate-900/80 to-slate-900/40 border-slate-800/60' : 'bg-gradient-to-br from-white to-slate-50 border-slate-200'}`}>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-black text-lg tracking-tight">Manage Categories</h3>
                  <button onClick={() => { setEditingCategoryId(null); setNewCategoryName(''); setIsCategoryModalOpen(true); }} className="text-indigo-500 hover:text-indigo-400 font-bold text-sm flex items-center gap-1.5 transition-colors"><Plus className="w-4 h-4"/> Add</button>
                </div>
                <div className="flex-1 overflow-y-auto pr-3 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-700/30 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-700/60 transition-all space-y-2">
                  {categories.map(c => (
                    <div key={c.id} className={`flex justify-between items-center p-3.5 rounded-xl transition-all ${darkMode ? 'hover:bg-slate-800/60' : 'hover:bg-slate-100'}`}>
                      <span className="font-bold text-sm tracking-wide">{c.name}</span>
                      <div className="flex gap-1.5">
                        <button onClick={() => { setEditingCategoryId(c.id); setNewCategoryName(c.name); setIsCategoryModalOpen(true); }} className={`p-2 rounded-lg transition-colors ${darkMode ? 'text-indigo-400 hover:bg-indigo-500/20' : 'text-indigo-600 hover:bg-indigo-50'}`}><Edit2 className="w-4 h-4"/></button>
                        <button onClick={() => handleDelete('categories', c.id, c.name)} className={`p-2 rounded-lg transition-colors ${darkMode ? 'text-rose-400 hover:bg-rose-500/20' : 'text-rose-600 hover:bg-rose-50'}`}><Trash2 className="w-4 h-4"/></button>
                      </div>
                    </div>
                  ))}
                  {categories.length === 0 && (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-slate-500 font-medium">No categories added.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Accounts Table */}
              <div className={`p-6 md:p-8 rounded-3xl border shadow-xl flex flex-col h-[400px] transition-all ${darkMode ? 'bg-gradient-to-br from-slate-900/80 to-slate-900/40 border-slate-800/60' : 'bg-gradient-to-br from-white to-slate-50 border-slate-200'}`}>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-black text-lg tracking-tight">Manage Accounts</h3>
                  <button onClick={() => { setEditingAccountId(null); setNewAccountName(''); setNewAccountBalance('0'); setIsAccountModalOpen(true); }} className="text-indigo-500 hover:text-indigo-400 font-bold text-sm flex items-center gap-1.5 transition-colors"><Plus className="w-4 h-4"/> Add</button>
                </div>
                <div className="flex-1 overflow-y-auto pr-3 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-700/30 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-700/60 transition-all space-y-2">
                  {accounts.map(a => (
                    <div key={a.id} className={`flex justify-between items-center p-3.5 rounded-xl transition-all ${darkMode ? 'hover:bg-slate-800/60' : 'hover:bg-slate-100'}`}>
                      <div>
                        <p className="font-bold text-sm tracking-wide">{a.name}</p>
                        <p className={`text-xs mt-0.5 font-bold ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{a.type} • ₹{a.initialBalance}</p>
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => { setEditingAccountId(a.id); setNewAccountName(a.name); setNewAccountType(a.type); setNewAccountBalance(a.initialBalance.toString()); setIsAccountModalOpen(true); }} className={`p-2 rounded-lg transition-colors ${darkMode ? 'text-indigo-400 hover:bg-indigo-500/20' : 'text-indigo-600 hover:bg-indigo-50'}`}><Edit2 className="w-4 h-4"/></button>
                        <button onClick={() => handleDelete('accounts', a.id, a.name)} className={`p-2 rounded-lg transition-colors ${darkMode ? 'text-rose-400 hover:bg-rose-500/20' : 'text-rose-600 hover:bg-rose-50'}`}><Trash2 className="w-4 h-4"/></button>
                      </div>
                    </div>
                  ))}
                  {accounts.length === 0 && (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-slate-500 font-medium">No accounts added.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <h3 className="font-bold mb-4">Application Mode</h3>
              <p className="text-sm text-slate-400 mb-6">Change terminology across the application to suit your organization type.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {['Standard', 'Student_Club', 'Agency'].map(mode => (
                  <button key={mode} onClick={() => updateAppMode(mode)} className={`p-4 rounded-xl border text-left transition-all ${appMode === mode ? 'border-indigo-500 bg-indigo-500/10' : darkMode ? 'border-slate-700 hover:border-slate-500' : 'border-slate-200 hover:border-slate-300'}`}>
                    <h4 className="font-bold mb-1">{mode.replace('_', ' ')}</h4>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Enhanced Transaction Modal */}
      {isTxModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className={`w-full max-w-lg rounded-[2rem] shadow-2xl p-8 border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <h2 className={`text-2xl font-black mb-6 flex items-center gap-3 ${txType === 'Credit' ? 'text-emerald-400' : 'text-rose-400'}`}>
              <div className={`p-2 rounded-xl ${txType === 'Credit' ? 'bg-emerald-500/20' : 'bg-rose-500/20'}`}>
                {txType === 'Credit' ? <ArrowUpRight className="w-6 h-6" /> : <ArrowDownRight className="w-6 h-6" />} 
              </div>
              Record {txType === 'Credit' ? incomeTerm : expenseTerm}
            </h2>
            <form onSubmit={handleAddTransaction} className="space-y-5">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Amount (₹)</label>
                <input type="number" value={txAmount} onChange={e => setTxAmount(e.target.value)} className={`w-full p-4 rounded-xl border outline-none font-black text-2xl transition ${darkMode ? 'bg-slate-950 border-slate-800 focus:border-indigo-500 text-white' : 'bg-slate-50 border-slate-300 focus:border-indigo-500 text-black'}`} required min="1" step="0.01" autoFocus/>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Description</label>
                <input type="text" value={txDesc} onChange={e => setTxDesc(e.target.value)} className={`w-full p-3.5 rounded-xl border outline-none font-medium transition ${darkMode ? 'bg-slate-950 border-slate-800 focus:border-indigo-500' : 'bg-slate-50 border-slate-300 focus:border-indigo-500'}`} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center justify-between text-xs font-bold uppercase text-slate-500 mb-2">Category <button type="button" onClick={() => setIsCategoryModalOpen(true)} className="text-indigo-500 hover:text-indigo-400 p-1"><Plus className="w-3 h-3"/></button></label>
                  <select value={txCategory} onChange={e => setTxCategory(e.target.value)} className={`w-full p-3.5 rounded-xl border outline-none font-medium ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'}`}>
                    <option value="">Select...</option>
                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="flex items-center justify-between text-xs font-bold uppercase text-slate-500 mb-2">Account <button type="button" onClick={() => setIsAccountModalOpen(true)} className="text-indigo-500 hover:text-indigo-400 p-1"><Plus className="w-3 h-3"/></button></label>
                  <select value={txAccountId} onChange={e => setTxAccountId(e.target.value)} className={`w-full p-3.5 rounded-xl border outline-none font-medium ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'}`} required>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Link to {singleClientTerm}</label>
                  <select value={txClientId} onChange={e => setTxClientId(e.target.value)} className={`w-full p-3.5 rounded-xl border outline-none font-medium ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'}`}>
                    <option value="">None</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Date</label>
                  <input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} className={`w-full p-3.5 rounded-xl border outline-none font-medium ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'}`} required />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Notes / Receipt URL (Optional)</label>
                <input type="text" placeholder="https://drive.google.com/..." value={txNotes} onChange={e => setTxNotes(e.target.value)} className={`w-full p-3.5 rounded-xl border outline-none font-medium text-sm transition ${darkMode ? 'bg-slate-950 border-slate-800 focus:border-indigo-500' : 'bg-slate-50 border-slate-300 focus:border-indigo-500'}`} />
              </div>

              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-800/50">
                <button type="button" onClick={() => setIsTxModalOpen(false)} className={`px-6 py-3 rounded-xl font-bold transition ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}>Cancel</button>
                <button type="submit" disabled={txLoading} className={`px-6 py-3 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg transition active:scale-95 ${txType === 'Credit' ? 'bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300' : 'bg-gradient-to-r from-rose-500 to-rose-400 hover:from-rose-400 hover:to-rose-300'}`}>
                  {txLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : `Save ${txType === 'Credit' ? incomeTerm : expenseTerm}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Client Modal */}
      {isClientModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className={`w-full max-w-sm rounded-3xl shadow-2xl p-8 border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <h2 className="text-xl font-black mb-6">Add {singleClientTerm}</h2>
            <form onSubmit={handleAddClient} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Name</label>
                <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} className={`w-full p-3.5 rounded-xl border outline-none font-medium ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'}`} required />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Email (Optional)</label>
                <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} className={`w-full p-3.5 rounded-xl border outline-none font-medium ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'}`} />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsClientModalOpen(false)} className={`px-4 py-2 rounded-xl font-bold ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}>Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Modal */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className={`w-full max-w-sm rounded-3xl shadow-2xl p-8 border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <h2 className="text-xl font-black mb-6">Create Team Member</h2>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Username</label>
                <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} className={`w-full p-3.5 rounded-xl border outline-none font-medium ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'}`} required />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Password</label>
                <input type="password" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} className={`w-full p-3.5 rounded-xl border outline-none font-medium ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'}`} required />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsUserModalOpen(false)} className={`px-4 py-2 rounded-xl font-bold ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}>Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Budget Modal */}
      {isBudgetModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className={`w-full max-w-sm rounded-3xl shadow-2xl p-8 border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <h2 className="text-xl font-black mb-6 flex items-center gap-2"><Target className="text-indigo-500 w-5 h-5"/> Set Budget Limit</h2>
            <form onSubmit={handleAddBudget} className="space-y-4">
              <div>
                <label className="flex items-center justify-between text-xs font-bold uppercase text-slate-500 mb-2">Category <button type="button" onClick={() => setIsCategoryModalOpen(true)} className="text-indigo-500 hover:text-indigo-400 p-1"><Plus className="w-3 h-3"/></button></label>
                <select value={budgetCategory} onChange={e => setBudgetCategory(e.target.value)} className={`w-full p-3.5 rounded-xl border outline-none font-medium ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'}`} required>
                  <option value="">Select...</option>
                  {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Limit Amount (₹)</label>
                <input type="number" value={budgetLimit} onChange={e => setBudgetLimit(e.target.value)} className={`w-full p-3.5 rounded-xl border outline-none font-medium ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'}`} required min="1" />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsBudgetModalOpen(false)} className={`px-4 py-2 rounded-xl font-bold ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}>Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold">Save Budget</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recurring Modal */}
      {isRecurringModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className={`w-full max-w-lg rounded-3xl shadow-2xl p-8 border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <h2 className="text-xl font-black mb-6">Add Recurring {expenseTerm}</h2>
            <form onSubmit={handleAddRecurring} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Amount (₹)</label>
                  <input type="number" value={recAmount} onChange={e => setRecAmount(e.target.value)} className={`w-full p-3.5 rounded-xl border outline-none font-medium ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'}`} required min="1" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Description</label>
                  <input type="text" value={recDesc} onChange={e => setRecDesc(e.target.value)} className={`w-full p-3.5 rounded-xl border outline-none font-medium ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'}`} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center justify-between text-xs font-bold uppercase text-slate-500 mb-2">Category <button type="button" onClick={() => setIsCategoryModalOpen(true)} className="text-indigo-500 hover:text-indigo-400 p-1"><Plus className="w-3 h-3"/></button></label>
                  <select value={recCategory} onChange={e => setRecCategory(e.target.value)} className={`w-full p-3.5 rounded-xl border outline-none font-medium ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'}`}>
                    <option value="">Select...</option>
                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Interval</label>
                  <select value={recInterval as any} onChange={e => setRecInterval(e.target.value as any)} className={`w-full p-3.5 rounded-xl border outline-none font-medium ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'}`}>
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Next Run Date</label>
                <input type="date" value={recNextRun} onChange={e => setRecNextRun(e.target.value)} className={`w-full p-3.5 rounded-xl border outline-none font-medium ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'}`} required />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsRecurringModalOpen(false)} className={`px-4 py-2 rounded-xl font-bold ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}>Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold">Save Recurring</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className={`w-full max-w-sm rounded-3xl shadow-2xl p-8 border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <h2 className="text-xl font-black mb-6 flex items-center gap-2"><Briefcase className="w-5 h-5"/> Add Category</h2>
            <form onSubmit={handleAddCategory} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Category Name</label>
                <input type="text" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} className={`w-full p-3.5 rounded-xl border outline-none font-medium ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'}`} required autoFocus />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsCategoryModalOpen(false)} className={`px-4 py-2 rounded-xl font-bold ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}>Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Account Modal */}
      {isAccountModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className={`w-full max-w-sm rounded-3xl shadow-2xl p-8 border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <h2 className="text-xl font-black mb-6 flex items-center gap-2"><Wallet className="w-5 h-5"/> Add Account</h2>
            <form onSubmit={handleAddAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Account Name</label>
                <input type="text" value={newAccountName} onChange={e => setNewAccountName(e.target.value)} className={`w-full p-3.5 rounded-xl border outline-none font-medium ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'}`} required autoFocus />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Type</label>
                <select value={newAccountType} onChange={e => setNewAccountType(e.target.value)} className={`w-full p-3.5 rounded-xl border outline-none font-medium ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'}`}>
                  <option value="Checking">Checking</option>
                  <option value="Savings">Savings</option>
                  <option value="Credit Card">Credit Card</option>
                  <option value="Cash">Cash</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Initial Balance</label>
                <input type="number" value={newAccountBalance} onChange={e => setNewAccountBalance(e.target.value)} className={`w-full p-3.5 rounded-xl border outline-none font-medium ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'}`} required step="0.01" />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsAccountModalOpen(false)} className={`px-4 py-2 rounded-xl font-bold ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}>Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
