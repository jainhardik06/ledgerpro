"use client";

import React, { useState, useEffect } from 'react';
import { ToggleLeft, ToggleRight, Check, Plus, X } from 'lucide-react';

export default function FeaturesPage() {
  const [flags, setFlags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewFlag, setShowNewFlag] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newFlag, setNewFlag] = useState({ name: '', desc: '', rollout: '0%', target: 'None' });

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
    // Optimistic UI update, reverted if the persist call fails.
    setFlags(prev => prev.map(f => f.id === id ? { ...f, status: !currentStatus } : f));
    try {
      const res = await fetch(`/api/super-admin/features/${id}`, { method: 'PUT' });
      if (!res.ok) throw new Error('toggle failed');
    } catch (e) {
      console.error(e);
      setFlags(prev => prev.map(f => f.id === id ? { ...f, status: currentStatus } : f));
    }
  };

  const submitNewFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFlag.name || !newFlag.desc) return;
    setCreating(true);
    try {
      const res = await fetch('/api/super-admin/features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newFlag, status: false }),
      });
      if (res.ok) {
        const created = await res.json();
        setFlags(prev => [...prev, created]);
        setNewFlag({ name: '', desc: '', rollout: '0%', target: 'None' });
        setShowNewFlag(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="p-6 shrink-0 border-b border-white/[0.05] flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white mb-1">Feature Flag Management</h1>
          <p className="text-[13px] text-neutral-400">Control platform capabilities, beta testing cohorts, and feature rollouts.</p>
        </div>
        <button onClick={() => setShowNewFlag(true)} className="h-9 px-4 bg-white text-black text-[13px] font-medium rounded-md hover:bg-neutral-200 transition-colors flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Flag
        </button>
      </div>

      {showNewFlag && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowNewFlag(false)}>
          <div className="w-full max-w-md rounded-xl border border-white/[0.08] bg-[#0a0a0a] p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[15px] font-medium text-white">New Feature Flag</h2>
              <button onClick={() => setShowNewFlag(false)} className="text-neutral-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={submitNewFlag} className="space-y-3">
              <input
                required
                placeholder="Flag name"
                value={newFlag.name}
                onChange={(e) => setNewFlag({ ...newFlag, name: e.target.value })}
                className="w-full h-9 px-3 text-[13px] rounded-md border border-white/[0.08] bg-black text-white focus:outline-none focus:ring-1 focus:ring-white/30"
              />
              <textarea
                required
                placeholder="Description"
                value={newFlag.desc}
                onChange={(e) => setNewFlag({ ...newFlag, desc: e.target.value })}
                className="w-full px-3 py-2 text-[13px] rounded-md border border-white/[0.08] bg-black text-white focus:outline-none focus:ring-1 focus:ring-white/30 resize-none h-20"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="Rollout (e.g. 25%)"
                  value={newFlag.rollout}
                  onChange={(e) => setNewFlag({ ...newFlag, rollout: e.target.value })}
                  className="w-full h-9 px-3 text-[13px] rounded-md border border-white/[0.08] bg-black text-white focus:outline-none focus:ring-1 focus:ring-white/30"
                />
                <input
                  placeholder="Target (e.g. Beta cohort)"
                  value={newFlag.target}
                  onChange={(e) => setNewFlag({ ...newFlag, target: e.target.value })}
                  className="w-full h-9 px-3 text-[13px] rounded-md border border-white/[0.08] bg-black text-white focus:outline-none focus:ring-1 focus:ring-white/30"
                />
              </div>
              <button type="submit" disabled={creating} className="w-full h-9 bg-white text-black text-[13px] font-medium rounded-md hover:bg-neutral-200 transition-colors disabled:opacity-50">
                {creating ? 'Creating...' : 'Create Flag'}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-6">
        <div className="space-y-4">
          
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
