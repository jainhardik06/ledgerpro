import React from 'react';

export default function DPAPage() {
  return (
    <div className="w-full pt-32 pb-24 px-6">
      <main className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-semibold text-white mb-2 tracking-tight">Data Processing Agreement</h1>
        <p className="text-[14px] text-neutral-500 mb-8">Last Updated: June 8, 2026</p>

        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-6">
          This Data Processing Agreement ("DPA") governs the processing of organizational financial records and user metadata in connection with Money OS.
        </p>

        <h2 className="text-lg font-medium text-white mt-10 mb-4 pb-2 border-b border-white/[0.05]">1. Processing Roles</h2>
        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-4">
          Under GDPR, CCPA, and associated data preservation rules, the roles of the parties are defined as follows:
        </p>
        <ul className="list-disc list-inside space-y-2 text-[14.5px] text-neutral-300 mb-6 pl-4">
          <li><strong>The Customer (You):</strong> Acts as the Data Controller, maintaining ultimate ownership and sovereignty over transaction entries, clients, and budget logs.</li>
          <li><strong>Money OS:</strong> Acts as the Data Processor, maintaining database clusters, indexing logs, and executing user queries strictly on behalf of the Controller.</li>
        </ul>

        <h2 className="text-lg font-medium text-white mt-10 mb-4 pb-2 border-b border-white/[0.05]">2. Technical Security & Logical Isolation</h2>
        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-4">
          Processor enforces security configurations directly inside the operational data handlers:
        </p>
        <ul className="list-disc list-inside space-y-2 text-[14.5px] text-neutral-300 mb-6 pl-4">
          <li><strong>Workspace Partitioning:</strong> All ledger transactions are bounded to a unique tenant identifier. No cross-tenant database lookups are allowed by the platform's controllers.</li>
          <li><strong>Security Records:</strong> Authentication logs, including IP metadata or login success codes, are locked to detect credential attacks.</li>
        </ul>

        <h2 className="text-lg font-medium text-white mt-10 mb-4 pb-2 border-b border-white/[0.05]">3. Authorized Subprocessors</h2>
        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-4">
          To provide the ledger engine, we utilize infrastructure partners:
        </p>
        <ul className="list-disc list-inside space-y-2 text-[14.5px] text-neutral-300 mb-6 pl-4">
          <li><strong>Database Hosting:</strong> MongoDB Atlas (cloud database instances for transactional storage).</li>
          <li><strong>App Server Hosting:</strong> Vercel (application deployments and static page distribution).</li>
        </ul>

        <h2 className="text-lg font-medium text-white mt-10 mb-4 pb-2 border-b border-white/[0.05]">4. Tenant Deletion Request</h2>
        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-4">
          Upon request from the verified workspace administrator, we will purge all database entries tied to your <code>tenantId</code>, including transactions, clients, budgets, and invited team memberships. Requests are processed within 30 days. Contact us at <a href="mailto:moneyos@webasthetic.in" className="text-indigo-400 hover:underline">moneyos@webasthetic.in</a>.
        </p>
      </main>
    </div>
  );
}
