"use client";

import React from 'react';
import { Settings2, Database, Mail, Shield } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-56px)] animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="p-6 shrink-0 border-b border-white/[0.05] flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white mb-1">Platform Settings</h1>
          <p className="text-[13px] text-neutral-400">Global configurations, API keys, and environment variables.</p>
        </div>
      </div>

      <div className="p-6 max-w-4xl space-y-8">
         
         <section>
           <h2 className="text-[13px] font-medium text-white uppercase tracking-widest mb-4 flex items-center gap-2">
             <Shield className="w-4 h-4 text-neutral-500" /> Authentication & Security
           </h2>
           <div className="rounded-xl border border-white/[0.05] bg-[#0a0a0a] overflow-hidden">
              <div className="p-5 border-b border-white/[0.05] flex items-center justify-between">
                <div>
                  <h3 className="text-[14px] font-medium text-white mb-1">Require 2FA Globally</h3>
                  <p className="text-[12px] text-neutral-500">Force all tenant administrators to configure two-factor authentication.</p>
                </div>
                <button className="w-10 h-5 rounded-full bg-emerald-500 relative transition-colors">
                  <div className="absolute right-1 top-0.5 w-4 h-4 rounded-full bg-white shadow-sm" />
                </button>
              </div>
              <div className="p-5 flex items-center justify-between">
                <div>
                  <h3 className="text-[14px] font-medium text-white mb-1">Session Timeout</h3>
                  <p className="text-[12px] text-neutral-500">Maximum idle time before forcing re-authentication.</p>
                </div>
                <select className="bg-[#000000] border border-white/[0.1] rounded-md px-3 py-1.5 text-[13px] text-white outline-none">
                  <option>15 Minutes</option>
                  <option>1 Hour</option>
                  <option>4 Hours</option>
                </select>
              </div>
           </div>
         </section>

         <section>
           <h2 className="text-[13px] font-medium text-white uppercase tracking-widest mb-4 flex items-center gap-2">
             <Mail className="w-4 h-4 text-neutral-500" /> SMTP & Email
           </h2>
           <div className="rounded-xl border border-white/[0.05] bg-[#0a0a0a] p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">SMTP Host</label>
                  <input type="text" value="smtp.resend.com" readOnly className="w-full bg-[#000000] border border-white/[0.1] rounded-md px-3 py-2 text-[13px] text-white font-mono outline-none opacity-70" />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">From Address</label>
                  <input type="text" value="noreply@moneyos.com" readOnly className="w-full bg-[#000000] border border-white/[0.1] rounded-md px-3 py-2 text-[13px] text-white font-mono outline-none opacity-70" />
                </div>
              </div>
              <p className="text-[12px] text-amber-500">SMTP settings are managed via environment variables and cannot be mutated here.</p>
           </div>
         </section>

      </div>

    </div>
  );
}
