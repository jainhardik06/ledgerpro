"use client";

import React, { useState, useEffect } from 'react';
import SuperAdminDashboard from '@/components/SuperAdminDashboard';
import MoneyOSDashboard from '@/components/MoneyOSDashboard';
import { LogIn, RefreshCw, AlertCircle } from 'lucide-react';

interface UserSession {
  id: string;
  username: string;
  role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'USER';
  tenantId?: string;
  impersonatedBy?: string;
}

interface ToastMessage {
  id: string;
  text: string;
  type: 'success' | 'error' | 'info';
}

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<UserSession | null>(null);
  
  const [isSignup, setIsSignup] = useState(false);
  const [authTenantName, setAuthTenantName] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  };

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.authenticated) {
        setUser(data.user);
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
    } catch (e) {
      setIsAuthenticated(false);
    }
  };

  useEffect(() => { checkAuth(); }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      const endpoint = isSignup ? '/api/auth/signup' : '/api/auth/login';
      const payload = isSignup 
        ? { tenantName: authTenantName, username: authUsername, password: authPassword }
        : { username: authUsername, password: authPassword };
        
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUser(data.user);
        setIsAuthenticated(true);
        if (isSignup) showToast('Account created successfully!', 'success');
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
    await fetch('/api/auth/logout', { method: 'POST' });
    setIsAuthenticated(false);
    setUser(null);
    window.location.reload();
  };

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center">
        <RefreshCw className="w-10 h-10 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 transition-colors duration-500 ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
          {toasts.map(t => (
            <div key={t.id} className="flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl border backdrop-blur-md text-sm bg-rose-500/15 border-rose-500/35 text-rose-400">
              <AlertCircle className="w-4 h-4" /> <span>{t.text}</span>
            </div>
          ))}
        </div>
        
        <div className={`w-full max-w-md rounded-[2rem] p-8 shadow-2xl border ${darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="flex justify-center mb-6">
            <div className="bg-gradient-to-tr from-indigo-600 to-violet-500 p-3 rounded-2xl text-white shadow-lg">
              <RefreshCw className="w-8 h-8" />
            </div>
          </div>
          <h2 className="text-3xl font-black text-center mb-8">Money OS</h2>
          
          <form onSubmit={handleAuthSubmit} className="space-y-5">
            {isSignup && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="block text-sm font-semibold mb-2">Organization / Company Name</label>
                <input type="text" value={authTenantName} onChange={e => setAuthTenantName(e.target.value)} className={`w-full px-4 py-3.5 rounded-xl border outline-none font-medium transition ${darkMode ? 'bg-slate-950 border-slate-800 focus:border-indigo-500 text-white' : 'bg-slate-50 border-slate-300 focus:border-indigo-500 text-black'}`} required={isSignup} />
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold mb-2">{isSignup ? 'Admin Username' : 'Username'}</label>
              <input type="text" value={authUsername} onChange={e => setAuthUsername(e.target.value)} className={`w-full px-4 py-3.5 rounded-xl border outline-none font-medium transition ${darkMode ? 'bg-slate-950 border-slate-800 focus:border-indigo-500 text-white' : 'bg-slate-50 border-slate-300 focus:border-indigo-500 text-black'}`} required />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Password</label>
              <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} className={`w-full px-4 py-3.5 rounded-xl border outline-none font-medium transition ${darkMode ? 'bg-slate-950 border-slate-800 focus:border-indigo-500 text-white' : 'bg-slate-50 border-slate-300 focus:border-indigo-500 text-black'}`} required />
            </div>
            <button type="submit" disabled={authLoading} className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-3.5 rounded-xl shadow-lg active:scale-[0.99] transition-all flex justify-center items-center gap-2 mt-4 cursor-pointer">
              {authLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><LogIn className="w-4 h-4" /> {isSignup ? 'Create Account' : 'Sign In'}</>}
            </button>

            <div className="text-center mt-6 pt-4 border-t border-slate-800/30">
              <button type="button" onClick={() => { setIsSignup(!isSignup); setAuthTenantName(''); setAuthUsername(''); setAuthPassword(''); }} className="text-sm font-semibold text-indigo-500 hover:text-indigo-400 transition-colors">
                {isSignup ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (user?.role === 'SUPER_ADMIN') {
    return <SuperAdminDashboard user={user} onLogout={handleLogout} darkMode={darkMode} setDarkMode={setDarkMode} />;
  }

  return (
    <MoneyOSDashboard 
      user={user} 
      onLogout={handleLogout} 
      darkMode={darkMode} 
      setDarkMode={setDarkMode} 
    />
  );
}
