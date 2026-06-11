import React from 'react';
import { connectGrowthDb } from '@/lib/db';
import { addSocialProfile, deleteSocialProfile } from '@/app/actions/social';
import { Trash2, Plus, ExternalLink } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function SocialMetadataCRUD() {
  const { db } = await connectGrowthDb();
  let profiles: any[] = [];

  if (db) {
    profiles = await db.collection('social_profiles').find({}).toArray();
  }

  return (
    <div className="p-6 sm:p-8 max-w-[1024px] mx-auto font-sans">
      <div className="mb-10">
        <h1 className="text-[32px] font-semibold text-[#ededed] tracking-tight leading-tight">Social Metadata</h1>
        <p className="text-[14px] text-[#a1a1aa] mt-2 leading-relaxed">Manage Money OS official social platforms tracked in the Growth DB.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Form */}
        <div className="lg:col-span-1">
          <div className="p-6 rounded-xl border border-[#262626] bg-[#0a0a0a]">
            <h2 className="text-[14px] font-medium text-[#ededed] mb-4 uppercase tracking-wider">Add Profile</h2>
            <form action={addSocialProfile} className="space-y-4">
              <div>
                <label className="block text-[11px] uppercase tracking-wider font-medium text-[#525252] mb-1">Platform</label>
                <select name="platform" required className="w-full h-9 px-3 text-[13px] rounded-md border border-[#262626] bg-[#000000] text-[#ededed] focus:ring-1 focus:ring-[#ededed] focus:outline-none">
                  <option value="LinkedIn">LinkedIn</option>
                  <option value="X">X (Twitter)</option>
                  <option value="GitHub">GitHub</option>
                  <option value="YouTube">YouTube</option>
                  <option value="ProductHunt">Product Hunt</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider font-medium text-[#525252] mb-1">Profile URL</label>
                <input name="url" type="url" required placeholder="https://..." className="w-full h-9 px-3 text-[13px] rounded-md border border-[#262626] bg-[#000000] text-[#ededed] focus:ring-1 focus:ring-[#ededed] focus:outline-none" />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider font-medium text-[#525252] mb-1">Username / Handle</label>
                <input name="username" type="text" required placeholder="@MoneyOSHQ" className="w-full h-9 px-3 text-[13px] rounded-md border border-[#262626] bg-[#000000] text-[#ededed] focus:ring-1 focus:ring-[#ededed] focus:outline-none" />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider font-medium text-[#525252] mb-1">Followers Count</label>
                <input name="followers" type="number" defaultValue="0" min="0" className="w-full h-9 px-3 text-[13px] rounded-md border border-[#262626] bg-[#000000] text-[#ededed] focus:ring-1 focus:ring-[#ededed] focus:outline-none" />
              </div>
              <div className="flex items-center gap-2 mt-2">
                <input name="verified" type="checkbox" id="verified" className="rounded border-[#262626] bg-[#000000] text-emerald-500 focus:ring-emerald-500" />
                <label htmlFor="verified" className="text-[13px] text-[#a1a1aa]">Verified Badge</label>
              </div>
              <button type="submit" className="mt-4 w-full bg-[#ededed] text-black rounded-md px-4 py-2 text-[13px] font-medium hover:bg-white transition-colors flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" />
                Add Profile
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: List */}
        <div className="lg:col-span-2">
          <div className="border border-[#262626] bg-[#0a0a0a] rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#262626]">
                  <th className="p-4 text-[11px] uppercase tracking-wider font-medium text-[#525252]">Platform</th>
                  <th className="p-4 text-[11px] uppercase tracking-wider font-medium text-[#525252]">Handle</th>
                  <th className="p-4 text-[11px] uppercase tracking-wider font-medium text-[#525252] text-right">Followers</th>
                  <th className="p-4 text-[11px] uppercase tracking-wider font-medium text-[#525252] text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {profiles.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-[13px] text-[#525252]">No social profiles tracked yet.</td>
                  </tr>
                ) : (
                  profiles.map(p => (
                    <tr key={p._id.toString()} className="border-b border-[#262626] last:border-0 hover:bg-[#000000] transition-colors">
                      <td className="p-4 text-[13px] font-medium text-[#ededed] flex items-center gap-2">
                        {p.platform}
                        {p.verified && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                      </td>
                      <td className="p-4 text-[13px] text-[#a1a1aa]">
                        <a href={p.url} target="_blank" rel="noopener noreferrer" className="hover:text-white flex items-center gap-1">
                          {p.username} <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                      <td className="p-4 text-[13px] text-[#ededed] tabular-nums font-mono text-right">{p.followers}</td>
                      <td className="p-4 text-right">
                        <form action={async () => {
                          'use server';
                          await deleteSocialProfile(p.platform);
                        }}>
                          <button type="submit" className="text-[#525252] hover:text-rose-400 transition-colors">
                            <Trash2 className="w-4 h-4 ml-auto" />
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}

// Temporary inline import until lucide-react is fully synced or handled by standard imports if CheckCircle2 missing
import { CheckCircle2 } from 'lucide-react';
