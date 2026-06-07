import React from 'react';

export default function DPAPage() {
  return (
    <div className="w-full pt-32 pb-24 px-6">
      <main className="max-w-3xl mx-auto prose prose-invert prose-neutral">
        <h1 className="text-3xl font-semibold text-white mb-2 tracking-tight">Data Processing Agreement</h1>
        <p className="text-[14px] text-neutral-500 mb-8">Last Updated: October 24, 2026</p>

        <p>This Data Processing Agreement ("DPA") forms part of the Terms of Service. It regulates the processing of personal data by Money OS on behalf of the customer.</p>

        <h2 className="text-xl font-semibold text-white mt-8 mb-4">Role of the Parties</h2>
        <p>Under GDPR and other applicable privacy frameworks, the Customer is the Data Controller and Money OS is the Data Processor concerning financial data inputted into the system.</p>

        <h2 className="text-xl font-semibold text-white mt-8 mb-4">Subprocessors</h2>
        <p>We use strict, heavily vetted infrastructure partners (such as AWS and MongoDB Atlas) to store and process data. We maintain a list of active subprocessors that can be requested at any time.</p>

        <h2 className="text-xl font-semibold text-white mt-8 mb-4">Data Deletion</h2>
        <p>Upon termination of your account, you have the right to request full erasure of your tenant data. We will permanently wipe your isolated ledger within 30 days of the request.</p>
      </main>
    </div>
  );
}
