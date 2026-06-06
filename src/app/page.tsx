"use client";

import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  Plus, Search, ArrowUpRight, ArrowDownRight, LogOut, LogIn,
  Trash2, Edit3, Calendar, Wallet, User, Lock, 
  AlertCircle, RefreshCw, FileSpreadsheet, FileText, 
  X, Moon, Sun, TrendingUp, TrendingDown, UserPlus, Info, CheckCircle2
} from 'lucide-react';

interface ClientTransaction {
  id: string;
  userId: string;
  type: 'Credit' | 'Debit';
  description: string;
  amount: number;
  date: string;
  category?: string;
  runningBalance?: number;
}

interface ClientCategory {
  id: string;
  userId: string;
  name: string;
}

interface SystemLog {
  id: string;
  username: string;
  action: string;
  details: string;
  timestamp: string;
}

interface UserSession {
  id: string;
  username: string;
}

interface ToastMessage {
  id: string;
  text: string;
  type: 'success' | 'error' | 'info';
}

export default function Home() {
  // --- Auth State ---
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null); // null means checking
  const [user, setUser] = useState<UserSession | null>(null);
  
  // Login Form Fields
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // --- App State ---
  const [transactions, setTransactions] = useState<ClientTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(true);

  // --- Stats State ---
  const [stats, setStats] = useState({
    balance: 0,
    credit: 0,
    debit: 0,
    count: 0
  });

  // --- Filtering & Searching State ---
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'All' | 'Credit' | 'Debit'>('All');
  const [dateFilter, setDateFilter] = useState<'All' | 'Today' | 'This Week' | 'This Month' | 'Custom'>('All');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');

  // --- Category State ---
  const [categories, setCategories] = useState<ClientCategory[]>([]);
  const [txCategory, setTxCategory] = useState('');
  const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryFormLoading, setCategoryFormLoading] = useState(false);

  // --- Logs State ---
  const [currentView, setCurrentView] = useState<'dashboard' | 'logs'>('dashboard');
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsSearchQuery, setLogsSearchQuery] = useState('');

  // --- Modals State ---
  // Add/Edit Transaction Modal
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [txModalMode, setTxModalMode] = useState<'add' | 'edit'>('add');
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [txType, setTxType] = useState<'Credit' | 'Debit'>('Credit');
  const [txDescription, setTxDescription] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txDate, setTxDate] = useState('');
  const [txFormLoading, setTxFormLoading] = useState(false);

  // Delete Confirmation Modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Admin Add User Modal (Inside Dashboard Only)
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserConfirmPassword, setNewUserConfirmPassword] = useState('');
  const [addUserLoading, setAddUserLoading] = useState(false);

  // --- Toast Messages ---
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Add a toast alert
  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // --- Check Authentication Session ---
  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated) {
          setUser(data.user);
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
        }
      } else {
        setIsAuthenticated(false);
      }
    } catch (err) {
      setIsAuthenticated(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  // Fetch Categories
  const fetchCategories = async () => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch('/api/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  // Fetch Transactions and Dashboard data
  const fetchData = async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const txRes = await fetch('/api/transactions');
      const dbRes = await fetch('/api/dashboard');
      
      if (txRes.ok && dbRes.ok) {
        const txData = await txRes.json();
        const dbData = await dbRes.json();
        
        const loadedTxs = (txData.transactions || []).map((t: any) => ({
          id: t.id || t._id,
          userId: t.userId,
          type: t.type,
          description: t.description,
          amount: Number(t.amount),
          date: t.date,
          category: t.category
        }));
        
        setTransactions(loadedTxs);
        setStats({
          balance: dbData.balance,
          credit: dbData.credit,
          debit: dbData.debit,
          count: dbData.transactions
        });
      } else {
        showToast('Failed to retrieve ledger data', 'error');
      }
    } catch (err) {
      showToast('Error connecting to the server', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
      fetchCategories();
    }
  }, [isAuthenticated]);

  // --- Auth Handlers ---
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authLoading) return;
    
    if (!authUsername || !authPassword) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    setAuthLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword })
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        setUser(data.user);
        setIsAuthenticated(true);
        setAuthUsername('');
        setAuthPassword('');
      } else {
        showToast(data.error || 'Authentication failed', 'error');
      }
    } catch (err) {
      showToast('Connection error occurred', 'error');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        setUser(null);
        setIsAuthenticated(false);
        setTransactions([]);
        setCategories([]);
        setCategoryFilter('All');
        setLogs([]);
        setLogsSearchQuery('');
        setCurrentView('dashboard');
        setStats({ balance: 0, credit: 0, debit: 0, count: 0 });
      }
    } catch (err) {
      showToast('Failed to sign out', 'error');
    }
  };

  const fetchLogs = async () => {
    if (!isAuthenticated) return;
    setLogsLoading(true);
    try {
      const res = await fetch('/api/logs');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      } else {
        showToast('Failed to retrieve system logs', 'error');
      }
    } catch (err) {
      showToast('Error connecting to the server', 'error');
    } finally {
      setLogsLoading(false);
    }
  };

  const handleViewChange = (view: 'dashboard' | 'logs') => {
    setCurrentView(view);
    if (view === 'logs') {
      fetchLogs();
    }
  };

  const filteredLogs = useMemo(() => {
    if (!logsSearchQuery) return logs;
    const q = logsSearchQuery.toLowerCase();
    return logs.filter(l => 
      l.username.toLowerCase().includes(q) || 
      l.action.toLowerCase().includes(q) || 
      l.details.toLowerCase().includes(q)
    );
  }, [logs, logsSearchQuery]);

  // --- Create User Handler (Inside Dashboard) ---
  const handleAddUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addUserLoading) return;

    if (!newUserUsername || !newUserPassword || !newUserConfirmPassword) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    if (newUserPassword !== newUserConfirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }

    setAddUserLoading(true);
    try {
      const res = await fetch('/api/auth/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUserUsername, password: newUserPassword })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        showToast(`User "${data.user.username}" created successfully!`, 'success');
        setIsAddUserModalOpen(false);
        setNewUserUsername('');
        setNewUserPassword('');
        setNewUserConfirmPassword('');
      } else {
        showToast(data.error || 'Failed to create user', 'error');
      }
    } catch (err) {
      showToast('Connection error occurred', 'error');
    } finally {
      setAddUserLoading(false);
    }
  };

  // --- CRUD Handlers ---
  const handleAddClick = () => {
    setTxModalMode('add');
    setSelectedTxId(null);
    setTxType('Credit');
    setTxDescription('');
    setTxAmount('');
    setTxCategory('');
    
    const today = new Date().toISOString().split('T')[0];
    setTxDate(today);
    
    setIsTxModalOpen(true);
  };

  const handleEditClick = (tx: ClientTransaction) => {
    setTxModalMode('edit');
    setSelectedTxId(tx.id);
    setTxType(tx.type);
    setTxDescription(tx.description);
    setTxAmount(tx.amount.toString());
    setTxDate(tx.date);
    setTxCategory(tx.category || '');
    
    setIsTxModalOpen(true);
  };

  const handleTxSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (txFormLoading) return;

    const amountNum = Number(txAmount);
    if (!txDescription || isNaN(amountNum) || amountNum <= 0 || !txDate) {
      showToast('Please enter valid inputs', 'error');
      return;
    }

    setTxFormLoading(true);
    const url = txModalMode === 'add' ? '/api/transactions' : `/api/transactions/${selectedTxId}`;
    const method = txModalMode === 'add' ? 'POST' : 'PUT';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: txType,
          description: txDescription,
          amount: amountNum,
          date: txDate,
          category: txCategory
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        showToast(
          txModalMode === 'add' ? 'Transaction added successfully' : 'Transaction updated successfully',
          'success'
        );
        setIsTxModalOpen(false);
        fetchData();
      } else {
        showToast(data.error || 'Failed to save transaction', 'error');
      }
    } catch (err) {
      showToast('Network error occurred', 'error');
    } finally {
      setTxFormLoading(false);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (categoryFormLoading || !newCategoryName.trim()) return;

    setCategoryFormLoading(true);
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategoryName.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Category added successfully', 'success');
        setNewCategoryName('');
        fetchCategories();
      } else {
        showToast(data.error || 'Failed to add category', 'error');
      }
    } catch (err) {
      showToast('Network error occurred', 'error');
    } finally {
      setCategoryFormLoading(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Category deleted successfully', 'success');
        fetchCategories();
        // If the current filter was this category, reset filter to 'All'
        const deletedCat = categories.find(c => c.id === id);
        if (deletedCat && categoryFilter === deletedCat.name) {
          setCategoryFilter('All');
        }
      } else {
        showToast(data.error || 'Failed to delete category', 'error');
      }
    } catch (err) {
      showToast('Network error occurred', 'error');
    }
  };

  const handleDeleteRequest = (id: string) => {
    setDeleteId(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteId || deleteLoading) return;
    setDeleteLoading(true);

    try {
      const res = await fetch(`/api/transactions/${deleteId}`, {
        method: 'DELETE'
      });
      const data = await res.json();

      if (res.ok && data.success) {
        showToast('Transaction deleted successfully', 'success');
        setIsDeleteModalOpen(false);
        setDeleteId(null);
        fetchData();
      } else {
        showToast(data.error || 'Failed to delete transaction', 'error');
      }
    } catch (err) {
      showToast('Network error occurred', 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  // --- Processing Ledger (Sorting + Running Balances) ---
  const processedTransactions = useMemo(() => {
    let list = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    let running = 0;
    list = list.map(t => {
      if (t.type === 'Credit') {
        running += t.amount;
      } else {
        running -= t.amount;
      }
      return { ...t, runningBalance: running };
    });

    list.reverse();

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(t => 
        t.description.toLowerCase().includes(q) || 
        t.amount.toString().includes(q) ||
        (t.category && t.category.toLowerCase().includes(q))
      );
    }

    if (typeFilter !== 'All') {
      list = list.filter(t => t.type === typeFilter);
    }

    if (categoryFilter !== 'All') {
      list = list.filter(t => t.category === categoryFilter);
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const now = new Date();
    
    if (dateFilter === 'Today') {
      list = list.filter(t => t.date === todayStr);
    } else if (dateFilter === 'This Week') {
      const startOfWeek = new Date(now);
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(startOfWeek.setDate(diff));
      monday.setHours(0,0,0,0);
      list = list.filter(t => new Date(t.date).getTime() >= monday.getTime() && new Date(t.date).getTime() <= now.getTime());
    } else if (dateFilter === 'This Month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      startOfMonth.setHours(0,0,0,0);
      list = list.filter(t => new Date(t.date).getTime() >= startOfMonth.getTime() && new Date(t.date).getTime() <= now.getTime());
    } else if (dateFilter === 'Custom') {
      if (customStartDate) {
        list = list.filter(t => t.date >= customStartDate);
      }
      if (customEndDate) {
        list = list.filter(t => t.date <= customEndDate);
      }
    }

    return list;
  }, [transactions, searchQuery, typeFilter, categoryFilter, dateFilter, customStartDate, customEndDate]);

  // --- Export File Formats ---
  const handleExportCSV = () => {
    if (processedTransactions.length === 0) {
      showToast('No transaction records to export', 'error');
      return;
    }

    const headers = ['Date', 'Type', 'Category', 'Description', 'Amount (INR)', 'Running Balance (INR)'];
    const csvRows = [
      headers.join(','),
      ...processedTransactions.map(t => 
        `${t.date},${t.type},"${(t.category || '').replace(/"/g, '""')}","${t.description.replace(/"/g, '""')}",${t.amount},${t.runningBalance}`
      )
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ledger_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleExportExcel = () => {
    if (processedTransactions.length === 0) {
      showToast('No transaction records to export', 'error');
      return;
    }

    const rows = processedTransactions.map(t => ({
      Date: t.date,
      Type: t.type,
      Category: t.category || '',
      Description: t.description,
      Amount: t.amount,
      'Running Balance': t.runningBalance
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ledger Transactions');
    XLSX.writeFile(wb, `ledger_export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const formatINR = (value: number) => {
    return '₹' + Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  };

  // --- Rendering Check ---
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center">
        <div className="flex flex-col items-center space-y-4">
          <RefreshCw className="w-10 h-10 text-indigo-500 animate-spin" />
          <p className="text-slate-400 font-medium tracking-wide">Connecting...</p>
        </div>
      </div>
    );
  }

  // --- Auth View (Login ONLY) ---
  if (!isAuthenticated) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 transition-colors duration-500 ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
        
        {/* Floating Toasts */}
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
          {toasts.map(t => (
            <div 
              key={t.id} 
              className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl border backdrop-blur-md transition-all duration-300 animate-slide-in text-sm ${
                t.type === 'success' 
                  ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400' 
                  : t.type === 'error' 
                  ? 'bg-rose-500/15 border-rose-500/35 text-rose-400' 
                  : 'bg-indigo-500/15 border-indigo-500/35 text-indigo-400'
              }`}
            >
              {t.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
              {t.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
              {t.type === 'info' && <Info className="w-4 h-4 shrink-0" />}
              <span>{t.text}</span>
            </div>
          ))}
        </div>

        <div className="max-w-md w-full relative z-10">
          {/* Theme Switcher */}
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="absolute -top-12 right-2 p-2.5 rounded-full border transition-all duration-300 border-slate-700 hover:bg-slate-800 cursor-pointer"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
          </button>

          {/* Login Card */}
          <div className={`rounded-3xl shadow-2xl p-8 border backdrop-blur-md transition-all duration-300 ${
            darkMode 
              ? 'bg-slate-900/60 border-slate-800/80 shadow-indigo-950/20' 
              : 'bg-white/80 border-slate-200/80 shadow-slate-200/50'
          }`}>
            <div className="text-center mb-8">
              <div className="bg-gradient-to-tr from-indigo-600 to-violet-500 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/30">
                <Wallet className="text-white w-8 h-8" />
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">
                LedgerPro
              </h1>
              <p className={`text-sm mt-2 font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Sign in to manage finances
              </p>
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-5">
              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Username
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                  <input 
                    type="text" 
                    value={authUsername}
                    onChange={(e) => setAuthUsername(e.target.value)}
                    placeholder="Username" 
                    className={`w-full pl-10 pr-4 py-3 rounded-xl border outline-none text-sm transition-all duration-200 ${
                      darkMode 
                        ? 'bg-slate-950/60 border-slate-800 text-slate-100 placeholder-slate-600 focus:border-indigo-500/80 focus:ring-1 focus:ring-indigo-500/80' 
                        : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                    }`}
                    required
                  />
                </div>
              </div>

              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                  <input 
                    type="password" 
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••" 
                    className={`w-full pl-10 pr-4 py-3 rounded-xl border outline-none text-sm transition-all duration-200 ${
                      darkMode 
                        ? 'bg-slate-950/60 border-slate-800 text-slate-100 placeholder-slate-600 focus:border-indigo-500/80 focus:ring-1 focus:ring-indigo-500/80' 
                        : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                    }`}
                    required
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={authLoading}
                className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-600/20 active:scale-[0.99] transition-all duration-200 flex justify-center items-center gap-2 text-sm mt-3 cursor-pointer"
              >
                {authLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <LogIn className="w-4 h-4" /> Sign In
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // --- Main Dashboard Screen View ---
  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-500 ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      
      {/* Floating Toasts */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <div 
            key={t.id} 
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl border backdrop-blur-md transition-all duration-300 animate-slide-in text-sm ${
              t.type === 'success' 
                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400' 
                : t.type === 'error' 
                ? 'bg-rose-500/15 border-rose-500/35 text-rose-400' 
                : 'bg-indigo-500/15 border-indigo-500/35 text-indigo-400'
            }`}
          >
            {t.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {t.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
            {t.type === 'info' && <Info className="w-4 h-4 shrink-0" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>

      {/* Navigation Bar */}
      <nav className={`sticky top-0 z-40 border-b backdrop-blur-md transition-colors duration-300 ${
        darkMode ? 'bg-slate-950/80 border-slate-900' : 'bg-white/80 border-slate-200'
      }`}>
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex justify-between items-center">
          <div className="flex items-center gap-2.5 font-black text-xl tracking-tight">
            <div className="bg-gradient-to-tr from-indigo-600 to-violet-500 p-2 rounded-xl text-white shadow-md shadow-indigo-600/10">
              <Wallet className="w-5 h-5" />
            </div>
            <span className="bg-gradient-to-r from-indigo-500 via-violet-400 to-purple-400 bg-clip-text text-transparent">LedgerPro</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-xl border transition-all duration-200 cursor-pointer ${
                darkMode ? 'border-slate-800 hover:bg-slate-900 text-amber-400' : 'border-slate-200 hover:bg-slate-100 text-indigo-600'
              }`}
              title="Toggle Theme"
            >
              {darkMode ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
            </button>

            {/* Logs / Dashboard Toggle */}
            <button 
              onClick={() => handleViewChange(currentView === 'dashboard' ? 'logs' : 'dashboard')}
              className={`p-2 rounded-xl border transition-all duration-200 flex items-center gap-1.5 text-xs font-bold cursor-pointer ${
                darkMode 
                  ? 'border-slate-800 bg-slate-900/40 text-slate-300 hover:bg-slate-800 hover:text-white' 
                  : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
              title={currentView === 'dashboard' ? 'View Activity Logs' : 'Back to Dashboard'}
            >
              {currentView === 'dashboard' ? (
                <>
                  <FileText className="w-4.5 h-4.5 text-indigo-500" />
                  <span className="hidden md:inline">Activity Logs</span>
                </>
              ) : (
                <>
                  <Wallet className="w-4.5 h-4.5 text-indigo-500" />
                  <span className="hidden md:inline">Dashboard</span>
                </>
              )}
            </button>

            {/* Add User Button (Securely available inside dashboard) */}
            <button 
              onClick={() => setIsAddUserModalOpen(true)}
              className={`p-2 rounded-xl border transition-all duration-200 flex items-center gap-1.5 text-xs font-bold cursor-pointer ${
                darkMode 
                  ? 'border-slate-800 bg-slate-900/40 text-slate-300 hover:bg-slate-800 hover:text-white' 
                  : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
              title="Add New User Member"
            >
              <UserPlus className="w-4 h-4" />
              <span className="hidden md:inline">Add User</span>
            </button>

            {/* User Info Badge */}
            <div className={`hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs font-semibold ${
              darkMode ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-slate-100'
            }`}>
              <div className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
                {user?.username.charAt(0).toUpperCase()}
              </div>
              <span className={darkMode ? 'text-slate-300' : 'text-slate-700'}>{user?.username}</span>
            </div>

            {/* Logout Button */}
            <button 
              onClick={handleLogout} 
              className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all duration-200 cursor-pointer ${
                darkMode 
                  ? 'border-slate-800 bg-slate-900/20 hover:bg-rose-500/10 hover:border-rose-500/30 text-slate-400 hover:text-rose-400' 
                  : 'border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-slate-600 hover:text-rose-600 shadow-sm'
              }`}
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:py-8 space-y-6 md:space-y-8">
        {currentView === 'dashboard' ? (
          <>
            {/* Statistics section */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Card 1: Balance */}
              <div className={`p-5 rounded-3xl shadow-sm border transition-all duration-300 hover:-translate-y-1 relative overflow-hidden ${
                darkMode 
                  ? 'bg-slate-900/40 border-slate-900 hover:border-indigo-500/30 hover:shadow-indigo-950/10' 
                  : 'bg-white border-slate-200/60 hover:shadow-slate-200/80'
              }`}>
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl" />
                <p className={`text-xs font-semibold uppercase tracking-wider mb-2 flex justify-between items-center ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Current Balance 
                  <Wallet className="w-4 h-4 text-indigo-500" />
                </p>
                <h3 className="text-2xl font-black tracking-tight">{formatINR(stats.balance)}</h3>
              </div>

              {/* Card 2: Credit */}
              <div className={`p-5 rounded-3xl shadow-sm border transition-all duration-300 hover:-translate-y-1 relative overflow-hidden ${
                darkMode 
                  ? 'bg-slate-900/40 border-slate-900 hover:border-emerald-500/30 hover:shadow-emerald-950/10' 
                  : 'bg-white border-slate-200/60 hover:shadow-slate-200/80'
              }`}>
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl" />
                <p className={`text-xs font-semibold uppercase tracking-wider mb-2 flex justify-between items-center ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Total Credit 
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                </p>
                <h3 className="text-2xl font-black tracking-tight text-emerald-500">{formatINR(stats.credit)}</h3>
              </div>

              {/* Card 3: Debit */}
              <div className={`p-5 rounded-3xl shadow-sm border transition-all duration-300 hover:-translate-y-1 relative overflow-hidden ${
                darkMode 
                  ? 'bg-slate-900/40 border-slate-900 hover:border-rose-500/30 hover:shadow-rose-950/10' 
                  : 'bg-white border-slate-200/60 hover:shadow-slate-200/80'
              }`}>
                <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-2xl" />
                <p className={`text-xs font-semibold uppercase tracking-wider mb-2 flex justify-between items-center ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Total Debit 
                  <TrendingDown className="w-4 h-4 text-rose-500" />
                </p>
                <h3 className="text-2xl font-black tracking-tight text-rose-500">{formatINR(stats.debit)}</h3>
              </div>

              {/* Card 4: Records Count */}
              <div className={`p-5 rounded-3xl shadow-sm border transition-all duration-300 hover:-translate-y-1 relative overflow-hidden ${
                darkMode 
                  ? 'bg-slate-900/40 border-slate-900 hover:border-amber-500/30 hover:shadow-amber-950/10' 
                  : 'bg-white border-slate-200/60 hover:shadow-slate-200/80'
              }`}>
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl" />
                <p className={`text-xs font-semibold uppercase tracking-wider mb-2 flex justify-between items-center ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Total Records 
                  <Calendar className="w-4 h-4 text-amber-500" />
                </p>
                <h3 className="text-2xl font-black tracking-tight text-amber-500">
                  {stats.count} <span className="text-xs font-bold text-slate-500 lowercase">entries</span>
                </h3>
              </div>
            </div>

            {/* Filters and Search controls */}
            <div className={`p-5 rounded-3xl border shadow-sm space-y-4 transition-colors duration-300 ${
              darkMode ? 'bg-slate-900/40 border-slate-900/80' : 'bg-white border-slate-200/60'
            }`}>
              <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
                {/* Search Input */}
                <div className="flex-1 relative">
                  <Search className="w-4.5 h-4.5 absolute left-3.5 top-3.5 text-slate-500" />
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by description or amount..." 
                    className={`w-full pl-11 pr-4 py-3 rounded-xl border outline-none text-sm transition-all duration-200 ${
                      darkMode 
                        ? 'bg-slate-950/60 border-slate-800 text-slate-100 placeholder-slate-600 focus:border-indigo-500/80 focus:ring-1 focus:ring-indigo-500/80' 
                        : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                    }`}
                  />
                </div>

                {/* Advanced Filters */}
                <div className="grid grid-cols-2 sm:flex gap-3 items-center">
                  
                  {/* Type Select */}
                  <div className="flex flex-col">
                    <select 
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value as any)}
                      className={`py-3 px-3.5 rounded-xl border outline-none text-sm font-semibold transition-all duration-200 cursor-pointer ${
                        darkMode 
                          ? 'bg-slate-950/60 border-slate-800 text-slate-300 focus:border-indigo-500/80' 
                          : 'bg-slate-50 border-slate-200 text-slate-700 focus:border-indigo-500'
                      }`}
                    >
                      <option value="All">All Types</option>
                      <option value="Credit">Credit Only</option>
                      <option value="Debit">Debit Only</option>
                    </select>
                  </div>

                  {/* Category Select */}
                  <div className="flex flex-col">
                    <select 
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className={`py-3 px-3.5 rounded-xl border outline-none text-sm font-semibold transition-all duration-200 cursor-pointer ${
                        darkMode 
                          ? 'bg-slate-950/60 border-slate-800 text-slate-300 focus:border-indigo-500/80' 
                          : 'bg-slate-50 border-slate-200 text-slate-700 focus:border-indigo-500'
                      }`}
                    >
                      <option value="All">All Categories</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Date Filter Select */}
                  <div className="flex flex-col">
                    <select 
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value as any)}
                      className={`py-3 px-3.5 rounded-xl border outline-none text-sm font-semibold transition-all duration-200 cursor-pointer ${
                        darkMode 
                          ? 'bg-slate-950/60 border-slate-800 text-slate-300 focus:border-indigo-500/80' 
                          : 'bg-slate-50 border-slate-200 text-slate-700 focus:border-indigo-500'
                      }`}
                    >
                      <option value="All">All Time</option>
                      <option value="Today">Today</option>
                      <option value="This Week">This Week</option>
                      <option value="This Month">This Month</option>
                      <option value="Custom">Custom Range</option>
                    </select>
                  </div>

                  {/* Exports & Category Management */}
                  <div className="col-span-2 sm:col-span-1 flex gap-2 w-full">
                    {/* Export CSV */}
                    <button 
                      onClick={handleExportCSV} 
                      className={`flex-1 sm:flex-initial px-4 py-3 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer ${
                        darkMode 
                          ? 'border-slate-800 bg-slate-900/20 hover:bg-slate-800 text-slate-300 hover:text-white' 
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-black shadow-sm'
                      }`}
                      title="Export to CSV"
                    >
                      <FileText className="w-4 h-4 shrink-0 text-slate-400" />
                      <span className="inline sm:hidden lg:inline">CSV</span>
                    </button>

                    {/* Export Excel */}
                    <button 
                      onClick={handleExportExcel} 
                      className={`flex-1 sm:flex-initial px-4 py-3 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer ${
                        darkMode 
                          ? 'border-slate-800 bg-slate-900/20 hover:bg-slate-800 text-slate-300 hover:text-white' 
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-black shadow-sm'
                      }`}
                      title="Export to Excel (.xlsx)"
                    >
                      <FileSpreadsheet className="w-4 h-4 shrink-0 text-emerald-500" />
                      <span className="inline sm:hidden lg:inline">Excel</span>
                    </button>

                    {/* Manage Categories Button */}
                    <button 
                      onClick={() => setIsManageCategoriesOpen(true)} 
                      className={`flex-1 sm:flex-initial px-4 py-3 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer ${
                        darkMode 
                          ? 'border-slate-800 bg-slate-900/20 hover:bg-slate-800 text-slate-300 hover:text-white' 
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-black shadow-sm'
                      }`}
                      title="Manage Categories"
                    >
                      <Edit3 className="w-4 h-4 shrink-0 text-indigo-500" />
                      <span className="inline sm:hidden lg:inline">Categories</span>
                    </button>
                  </div>

                  {/* Add Button */}
                  <button 
                    onClick={handleAddClick} 
                    className="col-span-2 sm:col-span-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white px-5 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/10 active:scale-[0.99] transition-all duration-200 cursor-pointer"
                  >
                    <Plus className="w-4.5 h-4.5 shrink-0" />
                    <span>Add Record</span>
                  </button>

                </div>
              </div>

              {/* Date Pickers for Custom Range */}
              {dateFilter === 'Custom' && (
                <div className={`p-4 rounded-2xl border grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in ${
                  darkMode ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div>
                    <label className={`block text-xs font-bold uppercase tracking-wide mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      Start Date
                    </label>
                    <input 
                      type="date" 
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className={`w-full px-3.5 py-2 rounded-xl border outline-none text-sm ${
                        darkMode 
                          ? 'bg-slate-900/60 border-slate-800 text-slate-200' 
                          : 'bg-white border-slate-200 text-slate-950'
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-bold uppercase tracking-wide mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      End Date
                    </label>
                    <input 
                      type="date" 
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className={`w-full px-3.5 py-2 rounded-xl border outline-none text-sm ${
                        darkMode 
                          ? 'bg-slate-900/60 border-slate-800 text-slate-200' 
                          : 'bg-white border-slate-200 text-slate-950'
                      }`}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Ledger Transaction History Table */}
            <div className={`rounded-3xl border shadow-sm overflow-hidden transition-colors duration-300 ${
              darkMode ? 'bg-slate-900/20 border-slate-900/80' : 'bg-white border-slate-200/60'
            }`}>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className={`border-b text-xs font-semibold uppercase tracking-wider ${
                      darkMode ? 'bg-slate-900/40 border-slate-900 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}>
                      <th className="p-4.5 whitespace-nowrap">Date</th>
                      <th className="p-4.5 whitespace-nowrap">Type</th>
                      <th className="p-4.5 w-full">Description</th>
                      <th className="p-4.5 whitespace-nowrap text-right">Amount</th>
                      <th className="p-4.5 whitespace-nowrap text-right">Running Balance</th>
                      <th className="p-4.5 whitespace-nowrap text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-900/60 text-sm">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="p-16 text-center">
                          <div className="flex flex-col items-center justify-center gap-3">
                            <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
                            <span className="text-slate-500 font-medium">Updating...</span>
                          </div>
                        </td>
                      </tr>
                    ) : processedTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-16 text-center">
                          <div className="flex flex-col items-center justify-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-slate-500/10 flex items-center justify-center text-slate-500">
                              <Info className="w-6 h-6" />
                            </div>
                            <span className="text-slate-500 font-medium">No ledger records matched the criteria.</span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      processedTransactions.map((tx) => {
                        const isCredit = tx.type === 'Credit';
                        
                        return (
                          <tr 
                            key={tx.id} 
                            className={`transition-colors duration-150 ${
                              darkMode ? 'hover:bg-slate-900/30' : 'hover:bg-slate-50/50'
                            }`}
                          >
                            {/* Date */}
                            <td className={`p-4.5 whitespace-nowrap font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                              {new Date(tx.date).toLocaleDateString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric'
                              })}
                            </td>
                            
                            {/* Type Badge */}
                            <td className="p-4.5 whitespace-nowrap">
                              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${
                                isCredit 
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}>
                                {tx.type}
                              </span>
                            </td>
                            
                            {/* Description */}
                            <td className={`p-4.5 font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                              <div className="flex flex-wrap items-center gap-2">
                                <span>{tx.description}</span>
                                {tx.category && (
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide uppercase ${
                                    darkMode 
                                      ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' 
                                      : 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                                  }`}>
                                    {tx.category}
                                  </span>
                                )}
                              </div>
                            </td>
                            
                            {/* Amount */}
                            <td className={`p-4.5 whitespace-nowrap text-right font-black text-base ${
                              isCredit ? 'text-emerald-500' : 'text-rose-500'
                            }`}>
                              {isCredit ? '+' : '-'}{formatINR(tx.amount)}
                            </td>
                            
                            {/* Running Balance */}
                            <td className={`p-4.5 whitespace-nowrap text-right font-bold ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                              {formatINR(tx.runningBalance || 0)}
                            </td>
                            
                            {/* Actions */}
                            <td className="p-4.5 whitespace-nowrap text-center">
                              <div className="flex items-center justify-center gap-1">
                                
                                {/* Edit */}
                                <button 
                                  onClick={() => handleEditClick(tx)}
                                  className={`p-2 rounded-lg transition-all duration-150 cursor-pointer ${
                                    darkMode 
                                      ? 'text-slate-500 hover:text-indigo-400 hover:bg-slate-800/60' 
                                      : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100'
                                  }`}
                                  title="Edit Record"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>

                                {/* Delete */}
                                <button 
                                  onClick={() => handleDeleteRequest(tx.id)}
                                  className={`p-2 rounded-lg transition-all duration-150 cursor-pointer ${
                                    darkMode 
                                      ? 'text-slate-500 hover:text-rose-400 hover:bg-slate-800/60' 
                                      : 'text-slate-400 hover:text-rose-600 hover:bg-slate-100'
                                  }`}
                                  title="Delete Record"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Immutable System Activity Logs View */}
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h2 className="text-2xl font-black tracking-tight">System Activity Audit Logs</h2>
                  <p className={`text-xs font-semibold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Immutable records of all database operations and authentication events
                  </p>
                </div>
                <button 
                  onClick={fetchLogs} 
                  disabled={logsLoading}
                  className={`p-2.5 rounded-xl border transition-all duration-200 cursor-pointer text-sm font-bold flex items-center gap-2 ${
                    darkMode ? 'border-slate-800 bg-slate-900/40 text-slate-300 hover:bg-slate-800' : 'border-slate-200 bg-white hover:bg-slate-50 shadow-sm'
                  }`}
                  title="Refresh Audit Logs"
                >
                  <RefreshCw className={`w-4 h-4 ${logsLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {/* Logs Search Input */}
              <div className={`p-4 rounded-3xl border shadow-sm ${
                darkMode ? 'bg-slate-900/40 border-slate-900/80' : 'bg-white border-slate-200/60'
              }`}>
                <div className="relative">
                  <Search className="w-4.5 h-4.5 absolute left-3.5 top-3.5 text-slate-500" />
                  <input 
                    type="text" 
                    value={logsSearchQuery}
                    onChange={(e) => setLogsSearchQuery(e.target.value)}
                    placeholder="Search logs by action, username, or details..." 
                    className={`w-full pl-11 pr-4 py-3 rounded-xl border outline-none text-sm transition-all duration-200 ${
                      darkMode 
                        ? 'bg-slate-950/60 border-slate-800 text-slate-100 placeholder-slate-600 focus:border-indigo-500/80 focus:ring-1 focus:ring-indigo-500/80' 
                        : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                    }`}
                  />
                </div>
              </div>

              {/* Logs List Table */}
              <div className={`rounded-3xl border shadow-sm overflow-hidden transition-colors duration-300 ${
                darkMode ? 'bg-slate-900/20 border-slate-900/80' : 'bg-white border-slate-200/60'
              }`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className={`border-b text-xs font-semibold uppercase tracking-wider ${
                        darkMode ? 'bg-slate-900/40 border-slate-900 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}>
                        <th className="p-4.5 whitespace-nowrap">Timestamp</th>
                        <th className="p-4.5 whitespace-nowrap">Operator</th>
                        <th className="p-4.5 whitespace-nowrap">Action Type</th>
                        <th className="p-4.5 w-full">Activity Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-900/60 text-sm">
                      {logsLoading ? (
                        <tr>
                          <td colSpan={4} className="p-16 text-center">
                            <div className="flex flex-col items-center justify-center gap-3">
                              <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
                              <span className="text-slate-500 font-medium">Fetching audit trail...</span>
                            </div>
                          </td>
                        </tr>
                      ) : filteredLogs.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-16 text-center">
                            <div className="flex flex-col items-center justify-center gap-3">
                              <div className="w-12 h-12 rounded-full bg-slate-500/10 flex items-center justify-center text-slate-500">
                                <Info className="w-6 h-6" />
                              </div>
                              <span className="text-slate-500 font-medium">No activity audit logs found matching criteria.</span>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredLogs.map((log) => {
                          let actionColor = 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
                          if (log.action === 'Login') {
                            actionColor = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                          } else if (log.action.includes('Failed')) {
                            actionColor = 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
                          } else if (log.action === 'Add Record' || log.action === 'Add Category') {
                            actionColor = 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20';
                          } else if (log.action === 'Edit Record') {
                            actionColor = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
                          } else if (log.action === 'Delete Record' || log.action === 'Delete Category') {
                            actionColor = 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
                          } else if (log.action === 'Create User') {
                            actionColor = 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
                          }

                          return (
                            <tr 
                              key={log.id || Math.random().toString()} 
                              className={`transition-colors duration-150 ${
                                darkMode ? 'hover:bg-slate-900/30' : 'hover:bg-slate-50/50'
                              }`}
                            >
                              {/* Timestamp */}
                              <td className={`p-4.5 whitespace-nowrap font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                {new Date(log.timestamp).toLocaleString('en-GB', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                  hour12: false
                                })}
                              </td>

                              {/* Operator Username */}
                              <td className={`p-4.5 whitespace-nowrap font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                <div className="flex items-center gap-2">
                                  <div className="w-5 h-5 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-[10px] font-bold">
                                    {log.username.charAt(0).toUpperCase()}
                                  </div>
                                  <span>{log.username}</span>
                                </div>
                              </td>

                              {/* Action Type Badge */}
                              <td className="p-4.5 whitespace-nowrap">
                                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${actionColor}`}>
                                  {log.action}
                                </span>
                              </td>

                              {/* Details */}
                              <td className={`p-4.5 font-semibold text-slate-500 dark:text-slate-400`}>
                                {log.details}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className={`py-6 border-t mt-12 text-center text-xs font-semibold ${
        darkMode ? 'bg-slate-950 border-slate-900 text-slate-600' : 'bg-white border-slate-200 text-slate-400'
      }`}>
        <p>© 2026 LedgerPro Business Money Tracker. Secure & Encrypted.</p>
      </footer>

      {/* --- MODALS --- */}
      
      {/* 1. Add / Edit Transaction Modal */}
      {isTxModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className={`rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border ${
            darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className={`flex justify-between items-center p-5 border-b ${
              darkMode ? 'border-slate-800 bg-slate-900/40' : 'border-slate-100 bg-slate-50/50'
            }`}>
              <h3 className="text-lg font-bold">
                {txModalMode === 'add' ? 'New Transaction Record' : 'Edit Transaction Record'}
              </h3>
              <button 
                onClick={() => setIsTxModalOpen(false)}
                className={`p-1 rounded-lg border transition-all duration-150 cursor-pointer ${
                  darkMode ? 'border-slate-800 hover:bg-slate-800 text-slate-400' : 'border-slate-200 hover:bg-slate-100 text-slate-500'
                }`}
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <form onSubmit={handleTxSubmit} className="p-6 space-y-5">
              {/* Type Selection */}
              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Transaction Type
                </label>
                <div className={`flex p-1 rounded-xl ${darkMode ? 'bg-slate-950/80' : 'bg-slate-100'}`}>
                  <button 
                    type="button" 
                    onClick={() => setTxType('Credit')}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all duration-200 cursor-pointer ${
                      txType === 'Credit' 
                        ? 'bg-white shadow text-emerald-600 dark:bg-slate-800 dark:text-emerald-400' 
                        : 'text-slate-500 hover:text-slate-400'
                    }`}
                  >
                    Credit
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setTxType('Debit')}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all duration-200 cursor-pointer ${
                      txType === 'Debit' 
                        ? 'bg-white shadow text-rose-600 dark:bg-slate-800 dark:text-rose-400' 
                        : 'text-slate-500 hover:text-slate-400'
                    }`}
                  >
                    Debit
                  </button>
                </div>
              </div>

              {/* Description Input */}
              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Description
                </label>
                <input 
                  type="text" 
                  value={txDescription}
                  onChange={(e) => setTxDescription(e.target.value)}
                  placeholder="e.g. Office Rent, Customer Payment" 
                  className={`w-full px-4 py-2.5 rounded-xl border outline-none text-sm transition-all duration-200 ${
                    darkMode 
                      ? 'bg-slate-950/60 border-slate-800 text-slate-100 placeholder-slate-600 focus:border-indigo-500/80' 
                      : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-indigo-500'
                  }`}
                  required
                />
              </div>

              {/* Category Dropdown */}
              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Category / Context
                </label>
                <select 
                  value={txCategory}
                  onChange={(e) => setTxCategory(e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl border outline-none text-sm transition-all duration-200 cursor-pointer ${
                    darkMode 
                      ? 'bg-slate-950/60 border-slate-800 text-slate-100 focus:border-indigo-500/80' 
                      : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-indigo-500'
                  }`}
                >
                  <option value="">No Category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Amount */}
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Amount (₹)
                  </label>
                  <input 
                    type="number" 
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    min="0.01" 
                    step="any"
                    placeholder="5000" 
                    className={`w-full px-4 py-2.5 rounded-xl border outline-none text-sm transition-all duration-200 ${
                      darkMode 
                        ? 'bg-slate-950/60 border-slate-800 text-slate-100 placeholder-slate-600 focus:border-indigo-500/80' 
                        : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-indigo-500'
                    }`}
                    required
                  />
                </div>

                {/* Date */}
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Date
                  </label>
                  <input 
                    type="date" 
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className={`w-full px-4 py-2.5 rounded-xl border outline-none text-sm transition-all duration-200 ${
                      darkMode 
                        ? 'bg-slate-950/60 border-slate-800 text-slate-100 focus:border-indigo-500/80' 
                        : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-indigo-500'
                    }`}
                    required
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsTxModalOpen(false)}
                  className={`flex-1 py-3 rounded-xl font-bold transition-all duration-150 cursor-pointer text-sm ${
                    darkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={txFormLoading}
                  className="flex-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-600/10 active:scale-[0.99] transition-all duration-200 cursor-pointer text-sm flex justify-center items-center gap-2"
                >
                  {txFormLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className={`rounded-3xl shadow-2xl w-full max-w-sm p-6 text-center border ${
            darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="w-12 h-12 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-500/20">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-black tracking-tight mb-2">Delete Transaction?</h3>
            <p className={`text-sm mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              This action cannot be undone. Are you sure you want to remove this record?
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setDeleteId(null);
                }} 
                className={`flex-1 py-3 rounded-xl font-bold transition-all duration-150 cursor-pointer text-sm ${
                  darkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete} 
                disabled={deleteLoading}
                className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-rose-600/10 active:scale-[0.99] transition-all duration-200 cursor-pointer text-sm flex justify-center items-center gap-2"
              >
                {deleteLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Add User Modal (Administrative Control) */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className={`rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border ${
            darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className={`flex justify-between items-center p-5 border-b ${
              darkMode ? 'border-slate-800 bg-slate-900/40' : 'border-slate-100 bg-slate-50/50'
            }`}>
              <h3 className="text-lg font-bold flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-500" />
                <span>Add Authorized User</span>
              </h3>
              <button 
                onClick={() => setIsAddUserModalOpen(false)}
                className={`p-1 rounded-lg border transition-all duration-150 cursor-pointer ${
                  darkMode ? 'border-slate-800 hover:bg-slate-800 text-slate-400' : 'border-slate-200 hover:bg-slate-100 text-slate-500'
                }`}
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <form onSubmit={handleAddUserSubmit} className="p-6 space-y-5">
              
              {/* Username field */}
              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  New Username
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                  <input 
                    type="text" 
                    value={newUserUsername}
                    onChange={(e) => setNewUserUsername(e.target.value)}
                    placeholder="e.g. partner_accountant" 
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border outline-none text-sm transition-all duration-200 ${
                      darkMode 
                        ? 'bg-slate-950/60 border-slate-800 text-slate-100 placeholder-slate-600 focus:border-indigo-500/80' 
                        : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-indigo-500'
                    }`}
                    required
                  />
                </div>
              </div>

              {/* Password field */}
              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Temporary Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                  <input 
                    type="password" 
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    placeholder="••••••••" 
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border outline-none text-sm transition-all duration-200 ${
                      darkMode 
                        ? 'bg-slate-950/60 border-slate-800 text-slate-100 placeholder-slate-600 focus:border-indigo-500/80' 
                        : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-indigo-500'
                    }`}
                    required
                  />
                </div>
              </div>

              {/* Confirm Password field */}
              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Confirm Temporary Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                  <input 
                    type="password" 
                    value={newUserConfirmPassword}
                    onChange={(e) => setNewUserConfirmPassword(e.target.value)}
                    placeholder="••••••••" 
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border outline-none text-sm transition-all duration-200 ${
                      darkMode 
                        ? 'bg-slate-950/60 border-slate-800 text-slate-100 placeholder-slate-600 focus:border-indigo-500/80' 
                        : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-indigo-500'
                    }`}
                    required
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsAddUserModalOpen(false)}
                  className={`flex-1 py-3 rounded-xl font-bold transition-all duration-150 cursor-pointer text-sm ${
                    darkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={addUserLoading}
                  className="flex-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-600/10 active:scale-[0.99] transition-all duration-200 cursor-pointer text-sm flex justify-center items-center gap-2"
                >
                  {addUserLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Manage Categories Modal */}
      {isManageCategoriesOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className={`rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border ${
            darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className={`flex justify-between items-center p-5 border-b ${
              darkMode ? 'border-slate-800 bg-slate-900/40' : 'border-slate-100 bg-slate-50/50'
            }`}>
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-indigo-500" />
                <span>Manage Categories</span>
              </h3>
              <button 
                onClick={() => setIsManageCategoriesOpen(false)}
                className={`p-1 rounded-lg border transition-all duration-150 cursor-pointer ${
                  darkMode ? 'border-slate-800 hover:bg-slate-800 text-slate-400' : 'border-slate-200 hover:bg-slate-100 text-slate-500'
                }`}
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Add New Category */}
              <form onSubmit={handleCreateCategory} className="flex gap-2">
                <input 
                  type="text" 
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="New category name (e.g. Freelance)" 
                  className={`flex-1 px-4 py-2.5 rounded-xl border outline-none text-sm transition-all duration-200 ${
                    darkMode 
                      ? 'bg-slate-950/60 border-slate-800 text-slate-100 placeholder-slate-600 focus:border-indigo-500/80' 
                      : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-indigo-500'
                  }`}
                  required
                />
                <button 
                  type="submit" 
                  disabled={categoryFormLoading}
                  className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg active:scale-[0.99] transition-all duration-200 cursor-pointer"
                >
                  {categoryFormLoading ? <RefreshCw className="w-4.5 h-4.5 animate-spin" /> : <Plus className="w-4.5 h-4.5" />}
                </button>
              </form>

              {/* Categories List */}
              <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                {categories.length === 0 ? (
                  <p className="text-center text-sm text-slate-500 py-4">No categories created yet.</p>
                ) : (
                  categories.map((cat) => (
                    <div 
                      key={cat.id} 
                      className={`flex justify-between items-center px-4 py-3 rounded-xl border transition-all ${
                        darkMode 
                          ? 'bg-slate-950/30 border-slate-800/80 hover:border-slate-700' 
                          : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-sm font-semibold">{cat.name}</span>
                      <button 
                        onClick={() => handleDeleteCategory(cat.id)}
                        className={`p-1.5 rounded-lg transition-all duration-150 cursor-pointer text-slate-500 hover:text-rose-500 ${
                          darkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
                        }`}
                        title="Delete Category"
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className={`p-4 border-t flex justify-end ${
              darkMode ? 'border-slate-800 bg-slate-900/40' : 'border-slate-100 bg-slate-50/50'
            }`}>
              <button 
                onClick={() => setIsManageCategoriesOpen(false)}
                className={`px-5 py-2 rounded-xl font-bold transition-all duration-150 cursor-pointer text-sm ${
                  darkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
