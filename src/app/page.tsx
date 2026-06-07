"use client";

import React, { useState, useEffect } from 'react';
import SuperAdminDashboard from '@/components/SuperAdminDashboard';
import MoneyOSDashboard from '@/components/MoneyOSDashboard';
import { LogIn, RefreshCw, AlertCircle, Triangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

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
  const [darkMode, setDarkMode] = useState(true); // Default to true as per SaaS trend
  
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
        if (isSignup) showToast('Account created successfully.', 'success');
      } else {
        showToast(data.error || 'Authentication failed.', 'error');
      }
    } catch (err) {
      showToast('Connection error occurred.', 'error');
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
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-[#000000]' : 'bg-white'}`}>
        <RefreshCw className={`w-5 h-5 animate-spin ${darkMode ? 'text-neutral-500' : 'text-neutral-400'}`} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 transition-colors duration-150 ${darkMode ? 'bg-[#000000] text-[#ededed]' : 'bg-[#fcfcfc] text-[#171717]'}`}>
        
        {/* Crisp Toasts */}
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
          {toasts.map(t => (
            <div key={t.id} className="flex items-center gap-2.5 px-4 py-3 rounded-md shadow-lg border text-[13px] font-medium animate-in bg-rose-500/10 border-rose-500/20 text-rose-500">
              <AlertCircle className="w-4 h-4" /> <span>{t.text}</span>
            </div>
          ))}
        </div>
        
        <div className={`w-full max-w-[360px] rounded-xl p-8 border ${darkMode ? 'bg-[#0a0a0a] border-neutral-800' : 'bg-white border-neutral-200'} shadow-sm`}>
          <div className="flex justify-center mb-6">
            <div className={`p-2 rounded-md ${darkMode ? 'bg-neutral-800' : 'bg-neutral-100'}`}>
              <Triangle className={`w-6 h-6 ${darkMode ? 'text-neutral-200' : 'text-neutral-800'} fill-current`} />
            </div>
          </div>
          <h2 className="text-xl font-semibold text-center mb-8 tracking-tight">
            {isSignup ? 'Create your workspace' : 'Log in to Money OS'}
          </h2>
          
          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {isSignup && (
              <div className="animate-in">
                <label className="block text-[12px] font-medium mb-1.5 text-neutral-500">Organization Name</label>
                <Input 
                  type="text" 
                  value={authTenantName} 
                  onChange={e => setAuthTenantName(e.target.value)} 
                  required={isSignup} 
                  autoFocus
                />
              </div>
            )}
            <div>
              <label className="block text-[12px] font-medium mb-1.5 text-neutral-500">
                {isSignup ? 'Admin Username' : 'Username'}
              </label>
              <Input 
                type="text" 
                value={authUsername} 
                onChange={e => setAuthUsername(e.target.value)} 
                required 
                autoFocus={!isSignup}
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium mb-1.5 text-neutral-500">Password</label>
              <Input 
                type="password" 
                value={authPassword} 
                onChange={e => setAuthPassword(e.target.value)} 
                required 
              />
            </div>
            <div className="pt-2">
              <Button type="submit" disabled={authLoading} className="w-full">
                {authLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : (isSignup ? 'Create Workspace' : 'Continue')}
              </Button>
            </div>

            <div className="text-center mt-6 pt-6">
              <button 
                type="button" 
                onClick={() => { setIsSignup(!isSignup); setAuthTenantName(''); setAuthUsername(''); setAuthPassword(''); }} 
                className="text-[13px] text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-300 transition-colors"
              >
                {isSignup ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
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
