import React from 'react';

export default function TermsOfServicePage() {
  return (
    <div className="w-full pt-24 sm:pt-24 sm:pt-32 pb-24 px-4 sm:px-6">
      <main className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-semibold text-white mb-2 tracking-tight">Terms of Service</h1>
        <p className="text-[14px] text-neutral-500 mb-8">Last Updated: June 8, 2026</p>

        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-6">
          Welcome to Money OS. By accessing our platform, creating a workspace, or authenticating via login, you agree to be bound by these Terms of Service.
        </p>

        <h2 className="text-lg font-medium text-white mt-10 mb-4 pb-2 border-b border-white/[0.05]">1. Free Beta Availability</h2>
        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-4">
          Money OS is currently in an active Beta testing phase and is provided entirely <strong>free of charge</strong>. 
        </p>
        <ul className="list-disc list-inside space-y-2 text-[14.5px] text-neutral-300 mb-6 pl-4">
          <li><strong>Billing Structures:</strong> Product billing schemas (Free, Starter, Enterprise) exist in our codebase configuration but are mock structures. No transaction fees, subscription cards, or checkout requirements are integrated or processed.</li>
        </ul>

        <h2 className="text-lg font-medium text-white mt-10 mb-4 pb-2 border-b border-white/[0.05]">2. Account Security & Credentials</h2>
        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-4">
          Authentication uses stateless JSON Web Tokens (JWT) mapped to secure, HttpOnly browser session parameters.
        </p>
        <ul className="list-disc list-inside space-y-2 text-[14.5px] text-neutral-300 mb-6 pl-4">
          <li><strong>Access Safeguards:</strong> You are fully responsible for maintaining secure passwords and protecting the active session context. Money OS is not responsible for credential loss, database breaches caused by weak pass-codes, or shared user tokens.</li>
          <li><strong>Invitations:</strong> Workspace administrators have the capability to invite additional team members and delegate access roles (<code>USER</code> or <code>TENANT_ADMIN</code>) which determine write permissions over ledger records.</li>
        </ul>

        <h2 className="text-lg font-medium text-white mt-10 mb-4 pb-2 border-b border-white/[0.05]">3. Intended Usage & API Guidelines</h2>
        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-4">
          You agree not to bypass authentication gateways, spam contact APIs, or trigger automatic payload scriptings against our endpoints. We reserve the right to lock or terminate user credentials and restrict workspace status parameters for actions threatening database integrity.
        </p>

        <h2 className="text-lg font-medium text-white mt-10 mb-4 pb-2 border-b border-white/[0.05]">4. Limitation of Liability</h2>
        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-4">
          Money OS is provided "as is" without warranty. We do not guarantee calculations, audit trail logs, or tax-isolated reporting matrices are fit for government filings. You are solely responsible for verifying the accuracy of ledger inputs, recurring transaction intervals, and currency ledger representations.
        </p>

        <h2 className="text-lg font-medium text-white mt-10 mb-4 pb-2 border-b border-white/[0.05]">5. Contact Us</h2>
        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-4">
          For inquiries or notices regarding these terms, contact platform operations at <a href="mailto:moneyos@webasthetic.in" className="text-indigo-400 hover:underline">moneyos@webasthetic.in</a>.
        </p>
      </main>
    </div>
  );
}
