"use client";

import React, { useState, useEffect } from 'react';
import SuperAdminDashboard from '@/components/SuperAdminDashboard';
import MoneyOSDashboard from '@/components/MoneyOSDashboard';
import { RefreshCw } from 'lucide-react';

interface UserSession {
  id: string;
  username: string;
  role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'USER';
  tenantId?: string;
  impersonatedBy?: string;
}

export default function DashboardPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<UserSession | null>(null);
  const [darkMode, setDarkMode] = useState(true);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.authenticated) {
        setUser(data.user);
        setIsAuthenticated(true);
      } else {
        window.location.href = '/login';
      }
    } catch (e) {
      window.location.href = '/login';
    }
  };

  useEffect(() => { checkAuth(); }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  if (isAuthenticated === null) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-[#000000]' : 'bg-white'}`}>
        <RefreshCw className={`w-5 h-5 animate-spin ${darkMode ? 'text-neutral-500' : 'text-neutral-400'}`} />
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
