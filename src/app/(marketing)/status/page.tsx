import React from 'react';
import { CheckCircle2, Activity } from 'lucide-react';

export default function StatusPage() {
  return (
    <div className="flex flex-col items-center pb-24 min-h-screen bg-[#000000]">
      <section className="w-full pt-32 pb-16 px-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-semibold tracking-tight text-white mb-8 animate-in">System Status</h1>
          
          <div className="p-6 rounded-xl border border-emerald-500/30 bg-[#0a0a0a] flex items-center gap-4 mb-12 shadow-2xl shadow-emerald-900/10">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            <div>
              <h2 className="text-xl font-medium text-white">All Systems Operational</h2>
              <p className="text-[14px] text-neutral-400 mt-1">Last updated: Just now</p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-medium text-white mb-4">Core Services</h3>
            
            {[
              { name: 'API Gateway', uptime: '99.99%' },
              { name: 'Database Cluster', uptime: '100.00%' },
              { name: 'Authentication (JWT)', uptime: '100.00%' },
              { name: 'Dashboard Frontend', uptime: '99.99%' },
              { name: 'Recurring Jobs Worker', uptime: '100.00%' },
            ].map((service, i) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-lg border border-white/[0.05] bg-[#0a0a0a]">
                <div className="flex items-center gap-3">
                  <Activity className="w-4 h-4 text-emerald-500" />
                  <span className="text-[14px] font-medium text-white">{service.name}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-[12px] text-neutral-500 font-mono">{service.uptime}</span>
                  <span className="text-[12px] text-emerald-400 font-medium">Operational</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 pt-8 border-t border-white/[0.05]">
            <h3 className="text-lg font-medium text-white mb-4">Past Incidents</h3>
            <p className="text-[14px] text-neutral-400">No incidents reported in the last 90 days.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
