"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

interface UserSession {
  id: string;
  email: string;
  username: string;
  tenantId: string | null;
  role: string | null;
  impersonatedBy?: string;
}

interface DashboardContextType {
  user: UserSession | null;
  tenant: any | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshContext: () => Promise<void>;
}

const DashboardContext = createContext<DashboardContextType>({
  user: null,
  tenant: null,
  loading: true,
  logout: async () => {},
  refreshContext: async () => {},
});

export const useDashboardContext = () => useContext(DashboardContext);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [tenant, setTenant] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const fetchContext = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          // Check impersonation
          const impStr = localStorage.getItem('impersonating_tenant');
          if (impStr) {
            try {
              const imp = JSON.parse(impStr);
              data.user.tenantId = imp.id;
              data.user.role = 'TENANT_ADMIN';
              data.user.impersonatedBy = 'SUPER_ADMIN';
            } catch (e) {}
          }

          setUser(data.user);

          if (data.user.role === 'SUPER_ADMIN' && !impStr) {
            router.push('/super-admin');
            return;
          }

          // Fetch tenant info
          const tenRes = await fetch('/api/tenant');
          if (tenRes.ok) {
            const tenData = await tenRes.json();
            setTenant(tenData.tenant);
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

  useEffect(() => {
    fetchContext();
  }, [pathname]);

  const logout = async () => {
    if (user?.impersonatedBy) {
      localStorage.removeItem('impersonating_tenant');
      router.push('/super-admin/tenants');
      return;
    }
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <RefreshCw className="w-5 h-5 text-neutral-500 animate-spin" />
      </div>
    );
  }

  return (
    <DashboardContext.Provider value={{ user, tenant, loading, logout, refreshContext: fetchContext }}>
      {children}
    </DashboardContext.Provider>
  );
}
