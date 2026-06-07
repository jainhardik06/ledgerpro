"use client";

import React, { useState, useEffect } from 'react';
import MoneyOSDashboard from '@/components/MoneyOSDashboard';
import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface UserSession {
  id: string;
  email: string;
  username: string;
  tenantId: string | null;
  role: string | null;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserSession | null>(null);
  const [darkMode, setDarkMode] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            // Check if impersonating
            const impStr = localStorage.getItem('impersonating_tenant');
            if (impStr) {
              try {
                const imp = JSON.parse(impStr);
                data.user.tenantId = imp.id;
                data.user.role = 'ADMIN';
              } catch (e) {}
            }
            
            setUser(data.user);
            
            // Redirect SUPER_ADMIN to the new Mission Control
            if (data.user.role === 'SUPER_ADMIN') {
               router.push('/super-admin');
               return;
            }
          } else {
            router.push('/login');
          }
        } else {
          router.push('/login');
        }
      } catch (err) {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [router]);

  if (loading || !user) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-[#000000]' : 'bg-white'}`}>
        <RefreshCw className={`w-5 h-5 animate-spin ${darkMode ? 'text-neutral-500' : 'text-neutral-400'}`} />
      </div>
    );
  }

  // Fallback if they manage to stay on this page as SUPER_ADMIN
  if (user.role === 'SUPER_ADMIN') {
    return (
       <div className="min-h-screen bg-black flex items-center justify-center text-white">
         Redirecting to Mission Control...
       </div>
    );
  }

  return (
    <MoneyOSDashboard 
      user={user} 
      onLogout={async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/login');
      }} 
      darkMode={darkMode} 
      setDarkMode={setDarkMode} 
    />
  );
}
