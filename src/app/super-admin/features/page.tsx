"use client";

import React, { useState, useEffect } from 'react';
import { ToggleLeft, ToggleRight, Check, Plus } from 'lucide-react';

export default function FeaturesPage() {
  const [flags, setFlags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFlags = async () => {
    try {
      const res = await fetch('/api/super-admin/features');
      if (res.ok) {
        const data = await res.json();
        setFlags(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlags();
  }, []);

  const toggleFlag = async (id: string, currentStatus: boolean) => {
    // Optimistic UI update
    setFlags(flags.map(f => f.id === id ? { ...f, status: !currentStatus } : f));
    // In a real app we would have an API route to toggle, e.g. PUT /api/super-admin/features/[id]
    // Since we didn't build the PUT route, we will just simulate it here for local state.
  };

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="p-6 shrink-0 border-b border-white/[0.05] flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white mb-1">Feature Flag Management</h1>
          <p className="text-[13px] text-neutral-400">Control platform capabilities, beta testing cohorts, and feature rollouts.</p>
        </div>
        <button className="h-9 px-4 bg-white text-black text-[13px] font-medium rounded-md hover:bg-neutral-200 transition-colors flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Flag
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl space-y-4">
          
          {loading ? (
             <div className="text-neutral-500 text-[13px]">Loading feature flags...</div>
          ) : flags.length === 0 ? (
             <div className="text-neutral-500 text-[13px]">No feature flags found.</div>
          ) : (
            flags.map(flag => (
              <div key={flag.id} className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] flex items-start gap-6 hover:border-white/[0.1] transition-colors">
                 
                 {/* Toggle Control */}
                 <button onClick={() => toggleFlag(flag.id, flag.status)} className="shrink-0 mt-1 focus:outline-none">
                   {flag.status 
                     ? <ToggleRight className="w-10 h-10 text-emerald-500" />
                     : <ToggleLeft className="w-10 h-10 text-neutral-600" />
                   }
                 </button>

                 {/* Details */}
                 <div className="flex-1">
                   <div className="flex items-center gap-3 mb-1">
                     <h3 className={`text-[15px] font-medium ${flag.status ? 'text-white' : 'text-neutral-400'}`}>{flag.name}</h3>
                     <span className="px-2 py-0.5 rounded bg-white/[0.05] text-[10px] font-mono text-neutral-500">{flag.id}</span>
                   </div>
                   <p className="text-[13px] text-neutral-400 mb-4">{flag.desc}</p>
                   
                   <div className="flex items-center gap-6 pt-4 border-t border-white/[0.05]">
                      <div>
                        <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-widest mb-1">Rollout Percentage</div>
                        <div className="text-[13px] font-mono text-white">{flag.rollout}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-widest mb-1">Targeting Rules</div>
                        <div className="text-[13px] font-medium text-neutral-300">{flag.target}</div>
                      </div>
                      {flag.status && (
                        <div className="ml-auto flex items-center gap-1.5 text-[11px] font-medium text-emerald-500 uppercase tracking-widest border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 rounded">
                          <Check className="w-3.5 h-3.5" /> Live
                        </div>
                      )}
                   </div>
                 </div>

              </div>
            ))
          )}

        </div>
      </div>

    </div>
  );
}
