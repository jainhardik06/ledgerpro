import React from 'react';

export default function RefundPolicyPage() {
  return (
    <div className="w-full pt-24 sm:pt-24 sm:pt-32 pb-24 px-4 sm:px-6">
      <main className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-semibold text-white mb-2 tracking-tight">Refund Policy</h1>
        <p className="text-[14px] text-neutral-500 mb-8">Last Updated: June 8, 2026</p>

        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-6">
          Money OS is currently in an active Beta testing phase and is <strong>100% free</strong> for all onboarded organizations.
        </p>

        <h2 className="text-lg font-medium text-white mt-10 mb-4 pb-2 border-b border-white/[0.05]">1. Free Beta Tier Status</h2>
        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-4">
          All workspace options, budget tools, team invites, and ledger features are fully unlocked and accessible at zero financial cost.
        </p>
        <ul className="list-disc list-inside space-y-2 text-[14.5px] text-neutral-300 mb-6 pl-4">
          <li><strong>No Billing Integrations:</strong> Credit card entry fields, Stripe API checkouts, PayPal connections, or banking charge protocols are completely absent from the operational codebase.</li>
          <li><strong>Zero Charging:</strong> Because we process no financial payments or active subscription collections, there are no refund procedures or billing disputes applicable.</li>
        </ul>

        <h2 className="text-lg font-medium text-white mt-10 mb-4 pb-2 border-b border-white/[0.05]">2. Commercial Plans Notification</h2>
        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-4">
          In the future, should commercial subscription models or billing modules be integrated, all active beta users will be notified well in advance with clear upgrade prompts. Accounts will never be auto-enrolled into premium paid options.
        </p>

        <h2 className="text-lg font-medium text-white mt-10 mb-4 pb-2 border-b border-white/[0.05]">3. Support Queries</h2>
        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-4">
          If you have questions about the beta terms or plan configurations, reach out to our team at <a href="mailto:moneyos@webasthetic.in" className="text-indigo-400 hover:underline">moneyos@webasthetic.in</a>.
        </p>
      </main>
    </div>
  );
}
