import React from 'react';

export default function PrivacyPolicyPage() {
  return (
    <div className="w-full pt-24 sm:pt-24 sm:pt-32 pb-24 px-4 sm:px-6">
      <main className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-semibold text-white mb-2 tracking-tight">Privacy Policy</h1>
        <p className="text-[14px] text-neutral-500 mb-8">Last Updated: June 8, 2026</p>

        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-6">
          This Privacy Policy describes how Money OS ("we", "us", or "our") collects, uses, and protects your information. Money OS is a financial operating system designed to manage and track business ledgers.
        </p>

        <h2 className="text-lg font-medium text-white mt-10 mb-4 pb-2 border-b border-white/[0.05]">1. Data Minimization & Collection</h2>
        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-4">
          We process only the data explicitly entered into the platform by authenticated users. Our database schema stores:
        </p>
        <ul className="list-disc list-inside space-y-2 text-[14.5px] text-neutral-300 mb-6 pl-4">
          <li><strong>Authentication Metadata:</strong> Username and email addresses for user creation and login validation.</li>
          <li><strong>Financial Records:</strong> Transaction logs (amounts, types, references), client names, budget categories, and recurring transaction schedules.</li>
          <li><strong>Support Queries:</strong> Sender name, email address, priority level, and ticket descriptions entered through our contact system.</li>
        </ul>

        <h2 className="text-lg font-medium text-white mt-10 mb-4 pb-2 border-b border-white/[0.05]">2. System Architecture & Tenant Isolation</h2>
        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-4">
          Security is built directly into our codebase. All data is logical-partitioned using a dedicated <code>tenantId</code> model. 
        </p>
        <ul className="list-disc list-inside space-y-2 text-[14.5px] text-neutral-300 mb-6 pl-4">
          <li><strong>Logical Segregation:</strong> Database queries strictly scope results to your specific workspace ID. There is no multi-tenant query crossover.</li>
          <li><strong>Super Admin Oversight:</strong> Authorized administrative accounts access diagnostic analytics, support tickets, and subscriber collections.</li>
        </ul>

        <h2 className="text-lg font-medium text-white mt-10 mb-4 pb-2 border-b border-white/[0.05]">3. Authentication & Browser Cookies</h2>
        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-4">
          We do not deploy marketing track-pixels, Google Ads scripts, or social sharing identifiers. The application uses only:
        </p>
        <ul className="list-disc list-inside space-y-2 text-[14.5px] text-neutral-300 mb-6 pl-4">
          <li><strong>Session Cookies:</strong> A secure, <code>HttpOnly</code> browser cookie storing a stateless JWT token. This cookie is strictly necessary to verify user credentials on API operations.</li>
        </ul>

        <h2 className="text-lg font-medium text-white mt-10 mb-4 pb-2 border-b border-white/[0.05]">4. Audit & Security Logging</h2>
        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-4">
          To comply with financial tracking demands, critical actions (such as logins, login failures, ledger updates, and setting alterations) are recorded in an immutable security log table.
        </p>

        <h2 className="text-lg font-medium text-white mt-10 mb-4 pb-2 border-b border-white/[0.05]">5. Contact Us</h2>
        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-4">
          For any data protection requests or privacy inquiries, contact platform operations directly at <a href="mailto:moneyos@webasthetic.in" className="text-indigo-400 hover:underline">moneyos@webasthetic.in</a>.
        </p>
      </main>
    </div>
  );
}
