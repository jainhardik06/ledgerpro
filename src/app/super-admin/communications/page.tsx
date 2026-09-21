"use client";

import React, { useState, useEffect } from 'react';
import { Megaphone, Send } from 'lucide-react';
import { Select } from '@/components/ui/Select';

export default function CommunicationsPage() {
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [type, setType] = useState('Maintenance Notice');
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState('All Active Tenants');
  const [deploying, setDeploying] = useState(false);

  const fetchBroadcasts = async () => {
    try {
      const res = await fetch('/api/super-admin/communications');
      if (res.ok) {
        const data = await res.json();
        setBroadcasts(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBroadcasts();
  }, []);

  const handleDeploy = async () => {
    if(!message) return;
    setDeploying(true);
    try {
      await fetch('/api/super-admin/communications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, message, target })
      });
      setMessage('');
      fetchBroadcasts();
    } catch (e) {
      console.error(e);
    } finally {
      setDeploying(false);
    }
  };

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
                <Select value={type} onChange={e=>setType(e.target.value)} className="w-full bg-[#000000] border border-white/[0.1] rounded-md px-3 py-2 text-[13px] text-white outline-none focus:border-white/[0.2]">
                  <option>Maintenance Notice</option>
                  <option>Feature Announcement</option>
                  <option>Emergency Alert</option>
                </Select>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">Message Content</label>
                <textarea 
                  value={message}
                  onChange={e=>setMessage(e.target.value)}
                  className="w-full bg-[#000000] border border-white/[0.1] rounded-md px-3 py-2 text-[13px] text-white outline-none focus:border-white/[0.2] h-24 resize-none"
                  placeholder="Money OS will undergo scheduled maintenance on..."
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">Target Audience</label>
                <Select value={target} onChange={e=>setTarget(e.target.value)} className="w-full bg-[#000000] border border-white/[0.1] rounded-md px-3 py-2 text-[13px] text-white outline-none focus:border-white/[0.2]">
                  <option>All Active Tenants</option>
                  <option>Enterprise Plans Only</option>
                  <option>Administrators Only</option>
                </Select>
              </div>
            </div>
            <div className="p-4 border-t border-white/[0.05] bg-white/[0.02] flex justify-end">
              <button disabled={deploying || !message} onClick={handleDeploy} className="h-9 px-4 bg-white text-black disabled:bg-neutral-500 text-[13px] font-medium rounded-md hover:bg-neutral-200 transition-colors flex items-center gap-2">
                {deploying ? 'Deploying...' : 'Deploy Notice'} <Send className="w-3.5 h-3.5" />
              </button>
            </div>
         </div>

         {/* Previous Broadcasts */}
         <div>
            <h2 className="text-[13px] font-medium text-white uppercase tracking-widest mb-4">Recent Broadcasts</h2>
            <div className="rounded-xl border border-white/[0.05] bg-[#0a0a0a] overflow-hidden divide-y divide-white/[0.05]">
               {loading ? (
                  <div className="p-4 text-[13px] text-neutral-500">Loading history...</div>
               ) : broadcasts.length === 0 ? (
                  <div className="p-4 text-[13px] text-neutral-500">No broadcasts have been sent yet.</div>
               ) : (
                 broadcasts.map(b => (
                   <div key={b.id} className="p-4 hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <span className={`px-2 py-0.5 rounded border text-[10px] font-mono font-bold tracking-widest uppercase ${
                          b.type.includes('Feature') ? 'border-indigo-500/20 bg-indigo-500/10 text-indigo-400' :
                          b.type.includes('Emergency') ? 'border-rose-500/20 bg-rose-500/10 text-rose-400' :
                          'border-amber-500/20 bg-amber-500/10 text-amber-400'
                        }`}>{b.type}</span>
                        <span className="text-[11px] font-mono text-neutral-500">{new Date(b.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p className="text-[13px] text-white font-medium mb-1">{b.message}</p>
                      <p className="text-[12px] text-neutral-400">Target: {b.target}</p>
                   </div>
                 ))
               )}
            </div>
         </div>

      </div>

    </div>
  );
}
