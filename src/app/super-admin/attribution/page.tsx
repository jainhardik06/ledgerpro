import React from 'react';
import { connectDb } from '@/lib/db';

export const metadata = {
  title: 'Attribution Audit | Money OS',
};

export default async function AttributionPage() {
  let tenants: any[] = [];
  try {
    const { db } = await connectDb();
    // Fetch all tenants to see attribution
    if (db) {
      tenants = await db.collection('tenants')
        .find({})
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray();
    }
  } catch (e) {
    console.error('Failed to fetch tenants for attribution', e);
  }

  const attributedTenants = tenants.filter(t => t.utm);
  const organicTenants = tenants.filter(t => !t.utm);

  return (
    <div className="p-8 max-w-[1600px] mx-auto text-zinc-100 min-h-screen font-sans">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">Attribution Verification</h1>
          <p className="text-zinc-400">Inspect the exact UTM data captured during the last 100 tenant signups.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-zinc-400 text-sm mb-2">Total Workspaces (Last 100)</h3>
          <p className="text-3xl font-bold text-white">{tenants.length}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 border-l-4 border-l-emerald-500">
          <h3 className="text-zinc-400 text-sm mb-2">UTM Attributed</h3>
          <p className="text-3xl font-bold text-white">{attributedTenants.length}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 border-l-4 border-l-zinc-500">
          <h3 className="text-zinc-400 text-sm mb-2">Organic / Direct</h3>
          <p className="text-3xl font-bold text-white">{organicTenants.length}</p>
        </div>
      </div>

      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-400">
            <thead className="text-xs text-zinc-500 uppercase bg-zinc-950/50">
              <tr>
                <th className="px-4 py-3 border-b border-zinc-800">Date</th>
                <th className="px-4 py-3 border-b border-zinc-800">Tenant Name</th>
                <th className="px-4 py-3 border-b border-zinc-800">Source</th>
                <th className="px-4 py-3 border-b border-zinc-800">Medium</th>
                <th className="px-4 py-3 border-b border-zinc-800">Campaign</th>
                <th className="px-4 py-3 border-b border-zinc-800">Term</th>
                <th className="px-4 py-3 border-b border-zinc-800">Content</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {tenants.map((tenant: any) => (
                <tr key={tenant._id.toString()} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-zinc-300">
                    {new Date(tenant.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 font-medium text-white">
                    {tenant.name}
                  </td>
                  {tenant.utm ? (
                    <>
                      <td className="px-4 py-3 text-emerald-400 font-medium">{tenant.utm.source || '-'}</td>
                      <td className="px-4 py-3 text-zinc-300">{tenant.utm.medium || '-'}</td>
                      <td className="px-4 py-3 text-zinc-300">{tenant.utm.campaign || '-'}</td>
                      <td className="px-4 py-3 text-zinc-300">{tenant.utm.term || '-'}</td>
                      <td className="px-4 py-3 text-zinc-300">{tenant.utm.content || '-'}</td>
                    </>
                  ) : (
                    <td colSpan={5} className="px-4 py-3 text-zinc-500 italic text-center">
                      Organic / Direct (No UTM tags captured)
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
