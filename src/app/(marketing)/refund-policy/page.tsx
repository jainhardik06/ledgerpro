import React from 'react';

export default function RefundPolicyPage() {
  return (
    <div className="w-full pt-32 pb-24 px-6">
      <main className="max-w-3xl mx-auto prose prose-invert prose-neutral">
        <h1 className="text-3xl font-semibold text-white mb-2 tracking-tight">Refund Policy</h1>
        <p className="text-[14px] text-neutral-500 mb-8">Last Updated: October 24, 2026</p>

        <p>We want you to be completely satisfied with Money OS. Because we offer a 14-day free trial on all paid plans, our refund policy is strict.</p>

        <h2 className="text-xl font-semibold text-white mt-8 mb-4">14-Day Free Trial</h2>
        <p>You have 14 days to test the Pro and Team tiers without being charged. If you cancel before the trial ends, your card will not be charged.</p>

        <h2 className="text-xl font-semibold text-white mt-8 mb-4">Monthly Subscriptions</h2>
        <p>We do not offer refunds for monthly subscriptions. You may cancel at any time, and you will retain access to your paid features until the end of your current billing cycle.</p>

        <h2 className="text-xl font-semibold text-white mt-8 mb-4">Annual Subscriptions</h2>
        <p>For annual subscriptions, we offer a 7-day money-back guarantee after the initial charge. After 7 days, annual subscriptions are strictly non-refundable.</p>
      </main>
    </div>
  );
}
