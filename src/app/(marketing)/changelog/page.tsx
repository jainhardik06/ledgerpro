import React from 'react';

export default function ChangelogPage() {
  const logs = [
    {
      date: 'October 24, 2026',
      version: 'v2.4.0',
      title: 'Massive Marketing Redesign & Structural Re-architecture',
      content: 'We completely overhauled the public-facing marketing presence, deploying 20 bespoke pages with tailored abstract UI components. In addition, the application routing was split into isolated /login and /dashboard segments for greater security and modularity.',
      type: 'Major'
    },
    {
      date: 'September 12, 2026',
      version: 'v2.3.1',
      title: 'Strict Tenant Isolation Enforcement',
      content: 'Migrated all remaining raw database queries to utilize the safeObjectId helper, ensuring mathematically proven tenant isolation across all endpoints. Implemented robust JWT validation.',
      type: 'Security'
    },
    {
      date: 'August 05, 2026',
      version: 'v2.2.0',
      title: 'New Dashboard Component Library',
      content: 'Ripped out legacy bloated CSS gradients and replaced them with a brutally minimalist, strict monochrome component library utilizing tabular numbers for financial data.',
      type: 'Design'
    }
  ];

  return (
    <div className="flex flex-col items-center pb-24">
      <section className="w-full pt-32 pb-16 px-6 border-b border-white/[0.05]">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-white mb-4 animate-in">Changelog</h1>
          <p className="text-lg text-neutral-400 font-medium animate-in" style={{ animationDelay: '100ms' }}>
            New updates and improvements to Money OS.
          </p>
        </div>
      </section>

      <section className="w-full py-16 px-6 max-w-3xl mx-auto">
        <div className="space-y-16 relative before:absolute before:inset-0 before:ml-4 md:before:ml-[120px] before:-translate-x-px before:h-full before:w-0.5 before:bg-white/[0.05]">
          {logs.map((log, i) => (
            <div key={i} className="relative flex flex-col md:flex-row gap-8 md:gap-16">
              {/* Date Marker */}
              <div className="md:w-[120px] shrink-0 pt-1 relative">
                <div className="absolute left-4 md:left-[120px] top-2 w-3 h-3 -translate-x-[5px] rounded-full border-2 border-[#000000] bg-neutral-400 z-10" />
                <div className="text-[13px] font-medium text-neutral-500 pl-10 md:pl-0 md:text-right">{log.date}</div>
              </div>
              
              {/* Content */}
              <div className="flex-1 bg-[#0a0a0a] border border-white/[0.05] p-8 rounded-2xl shadow-xl ml-10 md:ml-0">
                <div className="flex items-center gap-3 mb-4">
                  <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-white/[0.05] text-neutral-300 border border-white/[0.05]">{log.version}</span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">{log.type}</span>
                </div>
                <h3 className="text-xl font-semibold text-white mb-4">{log.title}</h3>
                <p className="text-[14px] text-neutral-400 leading-relaxed">{log.content}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
