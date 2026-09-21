import React from 'react';
import { connectGrowthDb } from '@/lib/db';
import { addDirectory, markSubmitted, approveSubmission, rejectSubmission, deleteDirectory } from '@/app/actions/directories';
import { Plus, Trash2, ExternalLink, CheckCircle2, XCircle, Send } from 'lucide-react';
import { Select } from '@/components/ui/Select';

export const dynamic = 'force-dynamic';

export default async function DirectoriesCRM() {
  const { db } = await connectGrowthDb();
  let directories: any[] = [];
  const submissionsByDirectory: Record<string, any> = {};

  if (db) {
    directories = await db.collection('directories').find({}).sort({ authority: -1 }).toArray();
    const submissions = await db.collection('directory_submissions').find({}).sort({ submittedAt: -1 }).toArray();
    // Latest submission per directory name.
    for (const s of submissions) {
      if (!submissionsByDirectory[s.directoryName]) submissionsByDirectory[s.directoryName] = s;
    }
  }

  const statusColor: Record<string, string> = {
    planned: 'text-[#525252]',
    submitted: 'text-amber-400',
    approved: 'text-emerald-400',
    rejected: 'text-rose-400',
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 w-full font-sans">
      <div className="mb-10">
        <h1 className="text-[32px] font-semibold text-[#ededed] tracking-tight leading-tight">Directory Submissions CRM</h1>
        <p className="text-[14px] text-[#a1a1aa] mt-2 leading-relaxed">
          Track every directory submission and its resulting backlink from the Growth DB — a distribution CRM, not a spreadsheet.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Add directory */}
        <div className="lg:col-span-1">
          <div className="p-6 rounded-xl border border-[#262626] bg-[#0a0a0a]">
            <h2 className="text-[14px] font-medium text-[#ededed] mb-4 uppercase tracking-wider">Add Directory</h2>
            <form action={addDirectory} className="space-y-4">
              <div>
                <label className="block text-[11px] uppercase tracking-wider font-medium text-[#525252] mb-1">Name</label>
                <input name="name" type="text" required placeholder="e.g. AlternativeTo" className="w-full h-9 px-3 text-[13px] rounded-md border border-[#262626] bg-[#000000] text-[#ededed] focus:ring-1 focus:ring-[#ededed] focus:outline-none" />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider font-medium text-[#525252] mb-1">URL</label>
                <input name="url" type="url" required placeholder="https://..." className="w-full h-9 px-3 text-[13px] rounded-md border border-[#262626] bg-[#000000] text-[#ededed] focus:ring-1 focus:ring-[#ededed] focus:outline-none" />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider font-medium text-[#525252] mb-1">Authority (0-100)</label>
                <input name="authority" type="number" min="0" max="100" defaultValue="50" className="w-full h-9 px-3 text-[13px] rounded-md border border-[#262626] bg-[#000000] text-[#ededed] focus:ring-1 focus:ring-[#ededed] focus:outline-none" />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider font-medium text-[#525252] mb-1">Tier</label>
                <Select name="tier" defaultValue="2" className="w-full h-9 px-3 text-[13px] rounded-md border border-[#262626] bg-[#000000] text-[#ededed] focus:ring-1 focus:ring-[#ededed] focus:outline-none">
                  <option value="1">Tier 1</option>
                  <option value="2">Tier 2</option>
                </Select>
              </div>
              <button type="submit" className="mt-4 w-full bg-[#ededed] text-black rounded-md px-4 py-2 text-[13px] font-medium hover:bg-white transition-colors flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" />
                Add Directory
              </button>
            </form>
          </div>
        </div>

        {/* Directory list + workflow */}
        <div className="lg:col-span-3">
          <div className="border border-[#262626] bg-[#0a0a0a] rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#262626]">
                  <th className="p-4 text-[11px] uppercase tracking-wider font-medium text-[#525252]">Directory</th>
                  <th className="p-4 text-[11px] uppercase tracking-wider font-medium text-[#525252]">Authority</th>
                  <th className="p-4 text-[11px] uppercase tracking-wider font-medium text-[#525252]">Status</th>
                  <th className="p-4 text-[11px] uppercase tracking-wider font-medium text-[#525252] text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {directories.length === 0 ? (
                  <tr><td colSpan={4} className="p-8 text-center text-[13px] text-[#525252]">No directories tracked yet.</td></tr>
                ) : (
                  directories.map((d) => {
                    const submission = submissionsByDirectory[d.name];
                    return (
                      <tr key={d.name} className="border-b border-[#262626] last:border-0 hover:bg-[#000000] transition-colors">
                        <td className="p-4 text-[13px] font-medium text-[#ededed]">
                          <a href={d.url} target="_blank" rel="noopener noreferrer" className="hover:text-white flex items-center gap-1.5">
                            {d.name} <ExternalLink className="w-3 h-3 text-[#525252]" />
                          </a>
                        </td>
                        <td className="p-4 text-[13px] text-[#a1a1aa] tabular-nums font-mono">{d.authority}</td>
                        <td className="p-4 text-[13px]">
                          <span className={statusColor[d.status] ?? 'text-[#525252]'}>{d.status}</span>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {d.status === 'planned' && (
                              <form action={markSubmitted}>
                                <input type="hidden" name="directoryId" value={d._id.toString()} />
                                <input type="hidden" name="directoryName" value={d.name} />
                                <button type="submit" className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-md border border-[#262626] text-[#a1a1aa] hover:text-white hover:border-[#404040] transition-colors">
                                  <Send className="w-3 h-3" /> Mark Submitted
                                </button>
                              </form>
                            )}
                            {d.status === 'submitted' && submission && (
                              <>
                                <form action={approveSubmission} className="flex items-center gap-1">
                                  <input type="hidden" name="submissionId" value={submission._id.toString()} />
                                  <input type="hidden" name="directoryName" value={d.name} />
                                  <input name="backlinkUrl" type="url" placeholder="backlink URL" className="h-8 px-2 text-[12px] rounded-md border border-[#262626] bg-[#000000] text-[#ededed] w-36 focus:ring-1 focus:ring-[#ededed] focus:outline-none" />
                                  <button type="submit" className="inline-flex items-center gap-1 text-[12px] px-2 py-1.5 rounded-md text-emerald-400 hover:bg-emerald-400/10 transition-colors">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  </button>
                                </form>
                                <form action={rejectSubmission}>
                                  <input type="hidden" name="submissionId" value={submission._id.toString()} />
                                  <input type="hidden" name="directoryName" value={d.name} />
                                  <button type="submit" className="inline-flex items-center gap-1 text-[12px] px-2 py-1.5 rounded-md text-rose-400 hover:bg-rose-400/10 transition-colors">
                                    <XCircle className="w-3.5 h-3.5" />
                                  </button>
                                </form>
                              </>
                            )}
                            <form action={async () => { 'use server'; await deleteDirectory(d.name); }}>
                              <button type="submit" className="text-[#525252] hover:text-rose-400 transition-colors p-1">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
