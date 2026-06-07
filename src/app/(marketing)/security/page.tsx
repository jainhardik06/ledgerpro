import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Lock, Database, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function SecurityPage() {
  return (
    <div className="flex flex-col items-center pb-24">
      <section className="w-full pt-32 pb-24 px-6 relative border-b border-white/[0.05] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-800/20 via-[#000000] to-[#000000] -z-10" />
        <div className="max-w-4xl mx-auto flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-8 animate-in">
            <ShieldCheck className="w-8 h-8 text-neutral-300" />
          </div>
          <h1 className="text-4xl md:text-6xl font-semibold tracking-tight text-white mb-6 animate-in" style={{ animationDelay: '100ms' }}>
            Enterprise-grade security.
          </h1>
          <p className="text-lg text-neutral-400 font-medium max-w-2xl mx-auto mb-10 animate-in" style={{ animationDelay: '200ms' }}>
            We treat your financial data with the highest level of strictness. Built from the ground up with tenant isolation and robust role management.
          </p>
        </div>
      </section>

      <section className="w-full py-24 px-6 max-w-5xl mx-auto grid md:grid-cols-2 gap-16">
        <div className="space-y-12">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Database className="w-5 h-5 text-white" />
              <h3 className="text-xl font-semibold text-white">Strict Tenant Isolation</h3>
            </div>
            <p className="text-[14px] text-neutral-400 leading-relaxed">
              Every query made to the Money OS database is strictly filtered by a cryptographic `tenantId`. It is mathematically impossible for data to leak across organizational boundaries. Your ledgers are completely siloed.
            </p>
          </div>
          
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Lock className="w-5 h-5 text-white" />
              <h3 className="text-xl font-semibold text-white">JWT Authentication</h3>
            </div>
            <p className="text-[14px] text-neutral-400 leading-relaxed">
              We utilize secure, HttpOnly JSON Web Tokens for session management. We do not store plain-text passwords, and sessions are actively monitored and invalidated upon logout.
            </p>
          </div>

          <div>
            <div className="flex items-center gap-3 mb-4">
              <Users className="w-5 h-5 text-white" />
              <h3 className="text-xl font-semibold text-white">Role Management</h3>
            </div>
            <p className="text-[14px] text-neutral-400 leading-relaxed">
              Access control is enforced at the API level. Tenant Admins have full configuration rights, while standard Users are restricted to operational data entry, preventing unauthorized schema modifications.
            </p>
          </div>
        </div>

        {/* Abstract UI for Security */}
        <div className="relative rounded-2xl border border-white/[0.1] bg-[#0a0a0a] p-8 shadow-2xl overflow-hidden flex flex-col justify-center">
           <div className="absolute top-0 left-0 right-0 h-1 bg-neutral-800" />
           <div className="space-y-4">
              {/* Tenant 1 */}
              <div className="p-4 rounded-lg bg-[#000000] border border-white/[0.05] relative overflow-hidden">
                <div className="absolute top-0 bottom-0 left-0 w-1 bg-emerald-500" />
                <div className="text-[12px] text-neutral-500 uppercase tracking-widest mb-1">Tenant A Context</div>
                <div className="text-[14px] font-medium text-white mb-2">Query Transactions</div>
                <div className="text-[11px] text-emerald-400 font-mono bg-emerald-500/10 p-2 rounded">✓ Auth: Validated<br/>✓ Scope: Isolated</div>
              </div>
              
              {/* Tenant 2 */}
              <div className="p-4 rounded-lg bg-[#000000] border border-white/[0.05] relative overflow-hidden opacity-50">
                <div className="absolute top-0 bottom-0 left-0 w-1 bg-rose-500" />
                <div className="text-[12px] text-neutral-500 uppercase tracking-widest mb-1">Tenant B Context</div>
                <div className="text-[14px] font-medium text-white mb-2">Query Transactions</div>
                <div className="text-[11px] text-rose-400 font-mono bg-rose-500/10 p-2 rounded">✗ Auth: Rejected<br/>✗ Scope: Denied</div>
              </div>
           </div>
        </div>
      </section>
    </div>
  );
}
