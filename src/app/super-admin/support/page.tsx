"use client";

import React, { useState, useEffect } from 'react';
import { LifeBuoy, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';

export default function SupportPage() {
  const [activeTab, setActiveTab] = useState('open');
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTickets = async () => {
      try {
        const res = await fetch('/api/super-admin/support');
        if (res.ok) {
          const data = await res.json();
          setTickets(data);
        }
      } catch (e) {
        console.error("Failed to fetch tickets", e);
      } finally {
        setLoading(false);
      }
    };
    fetchTickets();
  }, []);

  const filteredTickets = tickets.filter(t => activeTab === 'open' ? t.status === 'OPEN' : t.status === 'RESOLVED');

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="p-6 shrink-0 border-b border-white/[0.05] flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white mb-1">Support Operations</h1>
          <p className="text-[13px] text-neutral-400">Manage tenant escalations and platform support tickets.</p>
        </div>
      </div>

      <div className="p-6">
         <div className="flex gap-6 border-b border-white/[0.05] mb-6">
            <button onClick={() => setActiveTab('open')} className={`pb-3 text-[13px] font-medium transition-colors border-b-2 ${activeTab === 'open' ? 'border-white text-white' : 'border-transparent text-neutral-500 hover:text-white'}`}>
              Open Tickets ({tickets.filter(t => t.status === 'OPEN').length})
            </button>
            <button onClick={() => setActiveTab('resolved')} className={`pb-3 text-[13px] font-medium transition-colors border-b-2 ${activeTab === 'resolved' ? 'border-white text-white' : 'border-transparent text-neutral-500 hover:text-white'}`}>
              Resolved ({tickets.filter(t => t.status === 'RESOLVED').length})
            </button>
         </div>

         <div className="space-y-3">
            {loading ? (
               <div className="text-[13px] text-neutral-500 p-4">Loading support queue...</div>
            ) : filteredTickets.length === 0 ? (
               <div className="text-[13px] text-neutral-500 p-4">No tickets in this queue.</div>
            ) : (
              filteredTickets.map(ticket => (
                <div key={ticket.id} className="p-4 rounded-xl border border-white/[0.05] bg-[#0a0a0a] hover:border-white/[0.1] transition-colors flex items-center justify-between group cursor-pointer">
                   <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full border border-white/[0.05] bg-[#000000] flex items-center justify-center shrink-0">
                         {ticket.status === 'OPEN' ? <LifeBuoy className="w-4 h-4 text-amber-500" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[11px] font-mono text-neutral-500">{ticket.id}</span>
                          <h3 className="text-[14px] font-medium text-white">{ticket.subject}</h3>
                        </div>
                        <div className="text-[12px] text-neutral-400">
                          Tenant ID <span className="font-mono text-neutral-500">{ticket.tenantId}</span>
                        </div>
                      </div>
                   </div>
                   
                   <div className="flex items-center gap-6">
                      <div className="flex flex-col items-end gap-1">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-widest uppercase ${
                          ticket.priority === 'HIGH' ? 'bg-rose-500/10 text-rose-400' :
                          ticket.priority === 'MEDIUM' ? 'bg-amber-500/10 text-amber-400' :
                          'bg-white/[0.05] text-neutral-400'
                        }`}>
                          {ticket.priority}
                        </span>
                        <div className="flex items-center gap-1 text-[11px] text-neutral-500 font-mono">
                          <Clock className="w-3 h-3" /> {new Date(ticket.createdAt).toLocaleDateString()}
                        </div>
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
