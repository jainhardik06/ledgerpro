import React from 'react';

export default function PrivacyPolicyPage() {
  return (
    <div className="w-full pt-32 pb-24 px-6">
      <main className="max-w-3xl mx-auto prose prose-invert prose-neutral">
        <h1 className="text-3xl font-semibold text-white mb-2 tracking-tight">Privacy Policy</h1>
        <p className="text-[14px] text-neutral-500 mb-8">Last Updated: October 24, 2026</p>

        <p>This Privacy Policy describes how Money OS ("we", "us", or "our") collects, uses, and discloses your personal information when you use our web application.</p>

        <h2 className="text-xl font-semibold text-white mt-8 mb-4">1. Information We Collect</h2>
        <p>We strictly minimize the data we collect. We collect:</p>
        <ul>
          <li><strong>Account Information:</strong> Email address and name used for authentication.</li>
          <li><strong>Financial Data:</strong> Transactions, account names, and budgets you explicitly input into your workspace.</li>
          <li><strong>Usage Data:</strong> Anonymized interaction logs to ensure application security and performance.</li>
        </ul>

        <h2 className="text-xl font-semibold text-white mt-8 mb-4">2. How We Use Your Information</h2>
        <p>Your financial data is yours. We do not sell, rent, or share your transactional data with third-party marketers or advertisers. We use your data strictly to:</p>
        <ul>
          <li>Provide the core ledger and budgeting functionality.</li>
          <li>Ensure security and prevent fraud via Audit Logs.</li>
          <li>Process subscription payments (via our payment processor, Stripe).</li>
        </ul>

        <h2 className="text-xl font-semibold text-white mt-8 mb-4">3. Data Isolation</h2>
        <p>We employ strict multi-tenant architecture. Your organization's data is logically isolated from all other organizations. No cross-tenant queries are permitted under any circumstances.</p>

        <h2 className="text-xl font-semibold text-white mt-8 mb-4">4. Contact Us</h2>
        <p>If you have any questions about this Privacy Policy, please contact us at privacy@moneyos.com.</p>
      </main>
    </div>
  );
}
