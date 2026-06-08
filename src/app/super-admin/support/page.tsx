"use client";

import React, { useState, useEffect } from 'react';
import { LifeBuoy, AlertCircle, Clock, CheckCircle2, Mail } from 'lucide-react';

export default function SupportPage() {
  const [activeTab, setActiveTab] = useState('open');
  const [tickets, setTickets] = useState<any[]>([]);
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Detail Drawer State
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ticketsRes, subsRes] = await Promise.all([
          fetch('/api/super-admin/support'),
          fetch('/api/super-admin/subscribers')
        ]);
        if (ticketsRes.ok) {
          const ticketsData = await ticketsRes.json();
          setTickets(ticketsData);
        }
        if (subsRes.ok) {
          const subsData = await subsRes.json();
          setSubscribers(subsData);
        }
      } catch (e) {
        console.error("Failed to fetch support operations data", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredTickets = tickets.filter(t => activeTab === 'open' ? t.status === 'OPEN' : t.status === 'RESOLVED');

  const handleResolve = async () => {
    if (!selectedTicket || selectedTicket.status !== 'OPEN') return;
    setResolving(true);
    try {
      const res = await fetch('/api/super-admin/support', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedTicket.id })
      });
      if (res.ok) {
        setTickets((prev: any[]) => prev.map(t => t.id === selectedTicket.id ? { ...t, status: 'RESOLVED' } : t));
        setSelectedTicket({ ...selectedTicket, status: 'RESOLVED' });
      }
    } catch (e) {
      console.error("Failed to resolve ticket", e);
    } finally {
      setResolving(false);
    }
  };

  // Helper to parse and construct detailed fields for drawer
  const getTicketDetails = (ticket: any) => {
    const name = ticket.name || '';
    const email = ticket.email || '';
    const message = ticket.message || '';
    const category = ticket.category || 'Platform Support';

    // If structured database fields are already present, use them
    if (name || email || message) {
      return { name, email, message, category };
    }

    // Fallback logic: Try parsing the subject line if it is a contact submission
    if (ticket.subject && ticket.subject.startsWith('[Contact Form]')) {
      try {
        const raw = ticket.subject.substring(14).trim();
        const emailStart = raw.indexOf('(');
        const emailEnd = raw.indexOf(')');
        if (emailStart !== -1 && emailEnd !== -1) {
          const parsedName = raw.substring(0, emailStart).trim();
          const parsedEmail = raw.substring(emailStart + 1, emailEnd).trim();
          const rest = raw.substring(emailEnd + 1).trim();
          const parsedMessage = rest.startsWith(':') ? rest.substring(1).trim() : rest;
          return {
            name: parsedName,
            email: parsedEmail,
            message: parsedMessage,
            category: 'General Contact'
          };
        }
      } catch (e) {}
    }

    // Default return
    return {
      name: 'N/A',
      email: 'N/A',
      message: ticket.subject,
      category
    };
  };

  const selectedDetails = selectedTicket ? getTicketDetails(selectedTicket) : null;

  return (
    <div className="flex h-[calc(100vh-56px)] animate-in fade-in duration-500 relative overflow-hidden">
      
      {/* Left Panel - Support Queue */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Header */}
        <div className="p-6 shrink-0 border-b border-white/[0.05] flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white mb-1">Support Operations</h1>
            <p className="text-[13px] text-neutral-400">Manage tenant escalations, platform support tickets, and subscriber lists.</p>
          </div>
        </div>

        <div className="p-6">
           <div className="flex gap-6 border-b border-white/[0.05] mb-6 overflow-x-auto">
              <button onClick={() => { setActiveTab('open'); setSelectedTicket(null); }} className={`pb-3 text-[13px] font-medium transition-colors border-b-2 shrink-0 ${activeTab === 'open' ? 'border-white text-white' : 'border-transparent text-neutral-500 hover:text-white'}`}>
                Open Tickets ({tickets.filter(t => t.status === 'OPEN').length})
              </button>
              <button onClick={() => { setActiveTab('resolved'); setSelectedTicket(null); }} className={`pb-3 text-[13px] font-medium transition-colors border-b-2 shrink-0 ${activeTab === 'resolved' ? 'border-white text-white' : 'border-transparent text-neutral-500 hover:text-white'}`}>
                Resolved ({tickets.filter(t => t.status === 'RESOLVED').length})
              </button>
              <button onClick={() => { setActiveTab('subscribers'); setSelectedTicket(null); }} className={`pb-3 text-[13px] font-medium transition-colors border-b-2 shrink-0 ${activeTab === 'subscribers' ? 'border-white text-white' : 'border-transparent text-neutral-500 hover:text-white'}`}>
                Newsletter Subscribers ({subscribers.length})
              </button>
           </div>

           <div className="space-y-3">
              {loading ? (
                 <div className="text-[13px] text-neutral-500 p-4">Loading queue...</div>
              ) : activeTab === 'subscribers' ? (
                subscribers.length === 0 ? (
                  <div className="text-[13px] text-neutral-500 p-4">No subscribers found in database.</div>
                ) : (
                  subscribers.map(sub => (
                    <div key={sub.id || sub.email} className="p-4 rounded-xl border border-white/[0.05] bg-[#0a0a0a] hover:border-white/[0.1] transition-colors flex items-center justify-between group">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full border border-white/[0.05] bg-[#000000] flex items-center justify-center shrink-0">
                          <Mail className="w-4 h-4 text-indigo-400" />
                        </div>
                        <div>
                          <h3 className="text-[14px] font-medium text-white">{sub.email}</h3>
                          <div className="text-[11px] text-neutral-500 font-mono">
                            Active Subscriber
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1 text-[11px] text-neutral-500 font-mono">
                        <Clock className="w-3 h-3" /> {new Date(sub.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))
                )
              ) : filteredTickets.length === 0 ? (
                 <div className="text-[13px] text-neutral-500 p-4">No tickets in this queue.</div>
              ) : (
                filteredTickets.map(ticket => {
                  const isSelected = selectedTicket?.id === ticket.id;
                  const details = getTicketDetails(ticket);
                  return (
                    <div 
                      key={ticket.id} 
                      onClick={() => setSelectedTicket(ticket)}
                      className={`p-4 rounded-xl border transition-all flex items-center justify-between group cursor-pointer ${
                        isSelected 
                          ? 'border-indigo-500/50 bg-[#0d0d0d]' 
                          : 'border-white/[0.05] bg-[#0a0a0a] hover:border-white/[0.1]'
                      }`}
                    >
                       <div className="flex items-center gap-4 min-w-0">
                          <div className="w-10 h-10 rounded-full border border-white/[0.05] bg-[#000000] flex items-center justify-center shrink-0">
                             {ticket.status === 'OPEN' ? <LifeBuoy className="w-4 h-4 text-amber-500" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                               <span className="text-[10px] font-mono text-neutral-500 shrink-0">{ticket.id}</span>
                               <h3 className="text-[14px] font-medium text-white truncate max-w-[400px]">
                                 {details.name !== 'N/A' ? `[${details.category}] ${details.name}` : ticket.subject}
                               </h3>
                            </div>
                            <div className="text-[12px] text-neutral-400">
                               Tenant ID <span className="font-mono text-neutral-500">{ticket.tenantId}</span>
                            </div>
                          </div>
                       </div>
                       
                       <div className="flex items-center gap-6 shrink-0 ml-4">
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
                  );
                })
              )}
           </div>
        </div>
      </div>

      {/* Right Panel - Ticket Details Drawer */}
      {selectedTicket && selectedDetails && (
        <div className="w-96 border-l border-white/[0.05] bg-[#050505] flex flex-col shrink-0 h-full animate-in slide-in-from-right duration-300">
           {/* Drawer Header */}
           <div className="p-4 border-b border-white/[0.05] flex items-center justify-between">
              <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Ticket Details</span>
              <button 
                onClick={() => setSelectedTicket(null)}
                className="text-[10px] text-neutral-400 hover:text-white font-mono px-2 py-1 rounded bg-white/[0.05] transition-colors"
              >
                CLOSE
              </button>
           </div>

           {/* Drawer Body */}
           <div className="p-6 flex-1 overflow-y-auto space-y-6">
              <div>
                 <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-1.5">Ticket ID</div>
                 <div className="text-[12px] font-mono text-neutral-300 select-all">{selectedTicket.id}</div>
              </div>

              <div>
                 <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-1.5">Category</div>
                 <div className="text-[13px] text-white font-medium">{selectedDetails.category}</div>
              </div>

              <div>
                 <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-1.5">User / Name</div>
                 <div className="text-[13px] text-white font-medium">{selectedDetails.name}</div>
              </div>

              <div>
                 <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-1.5">Email Address</div>
                 <div className="text-[13px] text-indigo-400 font-mono select-all">{selectedDetails.email}</div>
              </div>

              <div>
                 <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-1.5">Tenant Association</div>
                 <div className="text-[13px] font-mono text-white">{selectedTicket.tenantId}</div>
              </div>

              <div>
                 <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-1.5">Submitted On</div>
                 <div className="text-[13px] text-white flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-neutral-500" /> {new Date(selectedTicket.createdAt).toLocaleString()}
                 </div>
              </div>

              <div>
                 <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-1.5">Priority / Status</div>
                 <div className="flex gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-widest uppercase ${
                      selectedTicket.priority === 'HIGH' ? 'bg-rose-500/10 text-rose-400' :
                      selectedTicket.priority === 'MEDIUM' ? 'bg-amber-500/10 text-amber-400' :
                      'bg-white/[0.05] text-neutral-400'
                    }`}>
                      {selectedTicket.priority}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-widest uppercase ${
                      selectedTicket.status === 'OPEN' ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
                    }`}>
                      {selectedTicket.status}
                    </span>
                 </div>
              </div>

              <div className="border-t border-white/[0.05] pt-6">
                 <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-2.5">Message / Description</div>
                 <div className="p-4 rounded-lg bg-black border border-white/[0.05] text-[13px] text-neutral-200 leading-relaxed font-sans whitespace-pre-wrap select-text break-words">
                    {selectedDetails.message}
                 </div>
              </div>
           </div>

           {/* Drawer Actions */}
           {selectedTicket.status === 'OPEN' && (
             <div className="p-4 border-t border-white/[0.05] bg-white/[0.01]">
                <button
                  disabled={resolving}
                  onClick={handleResolve}
                  className="w-full h-9 bg-emerald-500 hover:bg-emerald-400 disabled:bg-neutral-800 disabled:text-neutral-500 text-black text-[13px] font-medium rounded-md transition-colors flex items-center justify-center gap-1.5"
                >
                  {resolving ? 'Resolving...' : 'Mark as Resolved'}
                </button>
             </div>
           )}
        </div>
      )}
    </div>
  );
}
