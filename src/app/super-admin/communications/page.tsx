"use client";

import React from 'react';
import { Megaphone, Send } from 'lucide-react';

export default function CommunicationsPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-56px)] animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="p-6 shrink-0 border-b border-white/[0.05] flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white mb-1">Platform Communications</h1>
          <p className="text-[13px] text-neutral-400">Broadcast global banners or send targeted emails to tenants.</p>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
         
         {/* Global Banner Composer */}
         <div className="rounded-xl border border-white/[0.05] bg-[#0a0a0a] overflow-hidden flex flex-col">
            <div className="p-5 border-b border-white/[0.05] flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Megaphone className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-[14px] font-medium text-white">Deploy Global Notice</h2>
                <p className="text-[12px] text-neutral-500">Inject a banner into all tenant dashboards.</p>
              </div>
            </div>
            <div className="p-5 space-y-4 flex-1">
              <div>
                <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">Notice Type</label>
                <select className="w-full bg-[#000000] border border-white/[0.1] rounded-md px-3 py-2 text-[13px] text-white outline-none focus:border-white/[0.2]">
                  <option>Maintenance Notice (Amber)</option>
                  <option>Feature Announcement (Indigo)</option>
                  <option>Emergency Alert (Rose)</option>
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">Message Content</label>
                <textarea 
                  className="w-full bg-[#000000] border border-white/[0.1] rounded-md px-3 py-2 text-[13px] text-white outline-none focus:border-white/[0.2] h-24 resize-none"
                  placeholder="Money OS will undergo scheduled maintenance on..."
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">Target Audience</label>
                <select className="w-full bg-[#000000] border border-white/[0.1] rounded-md px-3 py-2 text-[13px] text-white outline-none focus:border-white/[0.2]">
                  <option>All Active Tenants</option>
                  <option>Enterprise Plans Only</option>
                  <option>Administrators Only</option>
                </select>
              </div>
            </div>
            <div className="p-4 border-t border-white/[0.05] bg-white/[0.02] flex justify-end">
              <button className="h-9 px-4 bg-white text-black text-[13px] font-medium rounded-md hover:bg-neutral-200 transition-colors flex items-center gap-2">
                Deploy Notice <Send className="w-3.5 h-3.5" />
              </button>
            </div>
         </div>

         {/* Previous Broadcasts */}
         <div>
            <h2 className="text-[13px] font-medium text-white uppercase tracking-widest mb-4">Recent Broadcasts</h2>
            <div className="rounded-xl border border-white/[0.05] bg-[#0a0a0a] overflow-hidden">
               <div className="p-4 border-b border-white/[0.05] hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 rounded border border-indigo-500/20 bg-indigo-500/10 text-indigo-400 text-[10px] font-mono font-bold tracking-widest uppercase">Feature</span>
                    <span className="text-[11px] font-mono text-neutral-500">Oct 12, 2026</span>
                  </div>
                  <p className="text-[13px] text-white font-medium mb-1">New Reporting Engine Live</p>
                  <p className="text-[12px] text-neutral-400">Target: All Active Tenants</p>
               </div>
               <div className="p-4 hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 rounded border border-amber-500/20 bg-amber-500/10 text-amber-400 text-[10px] font-mono font-bold tracking-widest uppercase">Maintenance</span>
                    <span className="text-[11px] font-mono text-neutral-500">Sep 28, 2026</span>
                  </div>
                  <p className="text-[13px] text-white font-medium mb-1">Database Migrations</p>
                  <p className="text-[12px] text-neutral-400">Target: Administrators Only</p>
               </div>
            </div>
         </div>

      </div>

    </div>
  );
}
