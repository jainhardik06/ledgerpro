import React from 'react';

export default function TermsOfServicePage() {
  return (
    <div className="w-full pt-32 pb-24 px-6">
      <main className="max-w-3xl mx-auto prose prose-invert prose-neutral">
        <h1 className="text-3xl font-semibold text-white mb-2 tracking-tight">Terms of Service</h1>
        <p className="text-[14px] text-neutral-500 mb-8">Last Updated: October 24, 2026</p>

        <p>Welcome to Money OS. By accessing or using our application, you agree to be bound by these Terms of Service.</p>

        <h2 className="text-xl font-semibold text-white mt-8 mb-4">1. Acceptance of Terms</h2>
        <p>By creating a workspace or logging into Money OS, you acknowledge that you have read, understood, and agree to be bound by these terms.</p>

        <h2 className="text-xl font-semibold text-white mt-8 mb-4">2. Account Responsibilities</h2>
        <p>You are responsible for safeguarding your authentication credentials. Money OS is not liable for any loss or damage arising from your failure to comply with this security obligation.</p>

        <h2 className="text-xl font-semibold text-white mt-8 mb-4">3. Prohibited Use</h2>
        <p>You may not use Money OS to engage in illegal financial activities, money laundering, or the funding of illicit organizations. We reserve the right to terminate accounts that violate this clause immediately and without refund.</p>

        <h2 className="text-xl font-semibold text-white mt-8 mb-4">4. Limitation of Liability</h2>
        <p>Money OS is provided "as is". We do not guarantee absolute accuracy of financial data if user inputs are flawed. We are not responsible for tax liabilities or penalties incurred by your organization.</p>
      </main>
    </div>
  );
}
