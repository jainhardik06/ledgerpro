import React from 'react';
import { connectGrowthDb } from '@/lib/db';
import { 
  Activity, 
  Globe, 
  Link as LinkIcon, 
  RefreshCw, 
  FileText, 
  Database,
  Bot,
  Search,
  BookOpen,
  Layout,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function DiscoveryDashboard() {
  const { db } = await connectGrowthDb();
  
  // 1. Directory Tracking State
  let totalTargets = 0;
  let directoriesSubmitted = 0;
  let directoriesApproved = 0;
  let directoriesRejected = 0;
  let totalBacklinks = 0;

  // 2. Content Tracking State
  let docsCount = 0;
  let seoPagesCount = 0;
  let blogCount = 0;
  let comparisonsCount = 0;

  // 3. AI Discovery (Crawler) State
  let gptBotHits = 0;
  let claudeBotHits = 0;
  let perplexityHits = 0;
  let geminiHits = 0;
  let copilotHits = 0;

  // 4. Social Infrastructure
  let socialProfiles: any[] = [];

  let dbConnected = false;
  
  if (db) {
    dbConnected = true;
    try {
      // Execute all independent queries in parallel for instant page load
      const [
        _totalTargets,
        _dirSubmitted,
        _dirApproved,
        _dirRejected,
        _totalBacklinks,
        _docsCount,
        _seoPagesCount,
        _blogCount,
        _comparisonsCount,
        _gptBotHits,
        _claudeBotHits,
        _perplexityHits,
        _geminiHits,
        _copilotHits,
        _socialProfiles
      ] = await Promise.all([
        // Directories
        db.collection('directories').countDocuments(),
        db.collection('directory_submissions').countDocuments({ status: 'Pending' }),
        db.collection('directory_submissions').countDocuments({ status: 'Approved' }),
        db.collection('directory_submissions').countDocuments({ status: 'Rejected' }),
        db.collection('backlinks').countDocuments(),
        
        // Content
        db.collection('docs_pages').countDocuments(),
        db.collection('seo_pages').countDocuments(),
        db.collection('blog_posts').countDocuments(),
        db.collection('seo_pages').countDocuments({ category: 'comparison' }), // Example approximation

        // AI Crawlers
        db.collection('crawler_visits').countDocuments({ botFamily: 'GPTBot' }),
        db.collection('crawler_visits').countDocuments({ botFamily: 'Claude' }),
        db.collection('crawler_visits').countDocuments({ botFamily: 'Perplexity' }),
        db.collection('crawler_visits').countDocuments({ botFamily: 'Gemini' }),
        db.collection('crawler_visits').countDocuments({ botFamily: 'Copilot' }),
        
        // Social Profiles
        db.collection('social_profiles').find({}).toArray()
      ]);

      totalTargets = _totalTargets;
      directoriesSubmitted = _dirSubmitted;
      directoriesApproved = _dirApproved;
      directoriesRejected = _dirRejected;
      totalBacklinks = _totalBacklinks;

      docsCount = _docsCount;
      seoPagesCount = _seoPagesCount;
      blogCount = _blogCount;
      comparisonsCount = _comparisonsCount;

      gptBotHits = _gptBotHits;
      claudeBotHits = _claudeBotHits;
      perplexityHits = _perplexityHits;
      geminiHits = _geminiHits;
      copilotHits = _copilotHits;
      socialProfiles = _socialProfiles;
    } catch (e) {
      console.error('[DiscoveryDashboard] Error fetching growth stats:', e);
    }
  }

  return (
    <div className="p-6 sm:p-8 max-w-[1200px] mx-auto font-sans">
      
      {/* Header */}
      <div className="mb-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-semibold text-[#ededed] tracking-tight leading-tight">Discovery Intelligence Center</h1>
          <p className="text-[14px] text-[#a1a1aa] mt-2 leading-relaxed">Centralized operational tracking for SEO, directories, and AI crawlers.</p>
        </div>
        <button className="bg-transparent border border-[#262626] rounded-md px-4 py-2 text-[13px] font-medium text-[#ededed] hover:bg-[#0a0a0a] transition-colors duration-150 ease-out flex items-center gap-2 w-max focus:outline-none focus:ring-1 focus:ring-[#ededed] focus:ring-offset-1 focus:ring-offset-black">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Data
        </button>
      </div>

      {/* SECTION 1: Infrastructure */}
      <h2 className="text-[14px] font-medium text-[#ededed] mb-4 uppercase tracking-wider">Infrastructure Status</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
        <div className="p-6 rounded-xl border border-[#262626] bg-[#0a0a0a] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="w-4 h-4 text-[#a1a1aa]" />
            <span className="text-[13px] font-medium text-[#ededed]">Growth Database</span>
          </div>
          {dbConnected ? (
            <span className="text-[11px] text-emerald-400 font-medium uppercase tracking-wider flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div> Connected</span>
          ) : (
             <span className="text-[11px] text-rose-400 font-medium uppercase tracking-wider flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-rose-400"></div> Offline</span>
          )}
        </div>
        <div className="p-6 rounded-xl border border-[#262626] bg-[#0a0a0a] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Layout className="w-4 h-4 text-[#a1a1aa]" />
            <span className="text-[13px] font-medium text-[#ededed]">Astro Content Engine</span>
          </div>
          <span className="text-[11px] text-[#a1a1aa] font-medium uppercase tracking-wider">Awaiting Deployment</span>
        </div>
        <div className="p-6 rounded-xl border border-[#262626] bg-[#0a0a0a] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Search className="w-4 h-4 text-[#a1a1aa]" />
            <span className="text-[13px] font-medium text-[#ededed]">SEO Engine API</span>
          </div>
          <span className="text-[11px] text-[#525252] font-medium uppercase tracking-wider">Not Configured</span>
        </div>
      </div>

      {/* SECTION 1.5: Social Infrastructure */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[14px] font-medium text-[#ededed] uppercase tracking-wider">Social Infrastructure</h2>
        <a href="/super-admin/discovery/social" className="text-[12px] text-blue-400 hover:underline">Manage Profiles &rarr;</a>
      </div>
      <div className="border border-[#262626] bg-[#0a0a0a] rounded-xl overflow-hidden mb-12">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#262626] bg-[#000000]">
              <th className="p-4 text-[11px] uppercase tracking-wider font-medium text-[#525252]">Platform</th>
              <th className="p-4 text-[11px] uppercase tracking-wider font-medium text-[#525252]">Status</th>
              <th className="p-4 text-[11px] uppercase tracking-wider font-medium text-[#525252]">Created</th>
              <th className="p-4 text-[11px] uppercase tracking-wider font-medium text-[#525252] text-right">Followers</th>
            </tr>
          </thead>
          <tbody>
            {socialProfiles.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-6 text-center text-[13px] text-[#525252]">No official platforms configured. Add them to build legitimacy.</td>
              </tr>
            ) : (
              socialProfiles.map(p => (
                <tr key={p._id.toString()} className="border-b border-[#262626] last:border-0 hover:bg-[#000000] transition-colors">
                  <td className="p-4 text-[13px] font-medium text-[#ededed] flex items-center gap-2">
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1">{p.platform}</a>
                    {p.verified && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wider ${p.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-[#262626] text-[#a1a1aa]'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="p-4 text-[13px] text-[#a1a1aa]">{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td className="p-4 text-[13px] text-[#ededed] tabular-nums font-mono text-right">{p.followers}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* SECTION 2: Directory Tracking */}
      <h2 className="text-[14px] font-medium text-[#ededed] mb-4 uppercase tracking-wider">Directory Tracking</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 mb-12">
         <div className="p-6 rounded-xl border border-[#262626] bg-[#000000]">
           <div className="flex items-center gap-2 mb-4 text-[#a1a1aa]">
             <Globe className="w-4 h-4" />
             <span className="text-[13px] font-medium">Total Targets</span>
           </div>
           <div className="text-[32px] font-semibold text-[#ededed] tabular-nums font-mono leading-none tracking-tighter">{totalTargets}</div>
         </div>
         <div className="p-6 rounded-xl border border-[#262626] bg-[#000000]">
           <div className="flex items-center gap-2 mb-4 text-[#a1a1aa]">
             <Clock className="w-4 h-4" />
             <span className="text-[13px] font-medium">Submitted</span>
           </div>
           <div className="text-[32px] font-semibold text-[#ededed] tabular-nums font-mono leading-none tracking-tighter">{directoriesSubmitted}</div>
         </div>
         <div className="p-6 rounded-xl border border-[#262626] bg-[#000000]">
           <div className="flex items-center gap-2 mb-4 text-[#a1a1aa]">
             <CheckCircle2 className="w-4 h-4" />
             <span className="text-[13px] font-medium">Approved</span>
           </div>
           <div className="text-[32px] font-semibold text-[#ededed] tabular-nums font-mono leading-none tracking-tighter">{directoriesApproved}</div>
         </div>
         <div className="p-6 rounded-xl border border-[#262626] bg-[#000000]">
           <div className="flex items-center gap-2 mb-4 text-[#a1a1aa]">
             <XCircle className="w-4 h-4" />
             <span className="text-[13px] font-medium">Rejected</span>
           </div>
           <div className="text-[32px] font-semibold text-[#ededed] tabular-nums font-mono leading-none tracking-tighter">{directoriesRejected}</div>
         </div>
         <div className="p-6 rounded-xl border border-[#262626] bg-[#000000]">
           <div className="flex items-center gap-2 mb-4 text-[#a1a1aa]">
             <LinkIcon className="w-4 h-4" />
             <span className="text-[13px] font-medium">Backlinks Earned</span>
           </div>
           <div className="text-[32px] font-semibold text-[#ededed] tabular-nums font-mono leading-none tracking-tighter">{totalBacklinks}</div>
         </div>
      </div>

      {/* SECTION 3: Content Tracking */}
      <h2 className="text-[14px] font-medium text-[#ededed] mb-4 uppercase tracking-wider">Content Footprint</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
         <div className="p-6 rounded-xl border border-[#262626] bg-[#000000]">
           <div className="flex items-center gap-2 mb-4 text-[#a1a1aa]">
             <BookOpen className="w-4 h-4" />
             <span className="text-[13px] font-medium">Docs Pages</span>
           </div>
           <div className="text-[32px] font-semibold text-[#ededed] tabular-nums font-mono leading-none tracking-tighter">{docsCount}</div>
         </div>
         <div className="p-6 rounded-xl border border-[#262626] bg-[#000000]">
           <div className="flex items-center gap-2 mb-4 text-[#a1a1aa]">
             <Search className="w-4 h-4" />
             <span className="text-[13px] font-medium">SEO Pages</span>
           </div>
           <div className="text-[32px] font-semibold text-[#ededed] tabular-nums font-mono leading-none tracking-tighter">{seoPagesCount}</div>
         </div>
         <div className="p-6 rounded-xl border border-[#262626] bg-[#000000]">
           <div className="flex items-center gap-2 mb-4 text-[#a1a1aa]">
             <FileText className="w-4 h-4" />
             <span className="text-[13px] font-medium">Blog Posts</span>
           </div>
           <div className="text-[32px] font-semibold text-[#ededed] tabular-nums font-mono leading-none tracking-tighter">{blogCount}</div>
         </div>
         <div className="p-6 rounded-xl border border-[#262626] bg-[#000000]">
           <div className="flex items-center gap-2 mb-4 text-[#a1a1aa]">
             <Activity className="w-4 h-4" />
             <span className="text-[13px] font-medium">Comparisons</span>
           </div>
           <div className="text-[32px] font-semibold text-[#ededed] tabular-nums font-mono leading-none tracking-tighter">{comparisonsCount}</div>
         </div>
      </div>

      {/* SECTION 4: AI Discovery */}
      <h2 className="text-[14px] font-medium text-[#ededed] mb-4 uppercase tracking-wider">AI Crawler Penetration</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
         <div className="p-6 rounded-xl border border-[#262626] bg-[#000000]">
           <div className="flex items-center gap-2 mb-4 text-[#a1a1aa]">
             <Bot className="w-4 h-4" />
             <span className="text-[13px] font-medium">GPTBot</span>
           </div>
           <div className="text-[32px] font-semibold text-[#ededed] tabular-nums font-mono leading-none tracking-tighter">{gptBotHits}</div>
         </div>
         <div className="p-6 rounded-xl border border-[#262626] bg-[#000000]">
           <div className="flex items-center gap-2 mb-4 text-[#a1a1aa]">
             <Bot className="w-4 h-4" />
             <span className="text-[13px] font-medium">ClaudeBot</span>
           </div>
           <div className="text-[32px] font-semibold text-[#ededed] tabular-nums font-mono leading-none tracking-tighter">{claudeBotHits}</div>
         </div>
         <div className="p-6 rounded-xl border border-[#262626] bg-[#000000]">
           <div className="flex items-center gap-2 mb-4 text-[#a1a1aa]">
             <Bot className="w-4 h-4" />
             <span className="text-[13px] font-medium">Perplexity</span>
           </div>
           <div className="text-[32px] font-semibold text-[#ededed] tabular-nums font-mono leading-none tracking-tighter">{perplexityHits}</div>
         </div>
         <div className="p-6 rounded-xl border border-[#262626] bg-[#000000]">
           <div className="flex items-center gap-2 mb-4 text-[#a1a1aa]">
             <Bot className="w-4 h-4" />
             <span className="text-[13px] font-medium">Gemini</span>
           </div>
           <div className="text-[32px] font-semibold text-[#ededed] tabular-nums font-mono leading-none tracking-tighter">{geminiHits}</div>
         </div>
         <div className="p-6 rounded-xl border border-[#262626] bg-[#000000]">
           <div className="flex items-center gap-2 mb-4 text-[#a1a1aa]">
             <Bot className="w-4 h-4" />
             <span className="text-[13px] font-medium">Copilot</span>
           </div>
           <div className="text-[32px] font-semibold text-[#ededed] tabular-nums font-mono leading-none tracking-tighter">{copilotHits}</div>
         </div>
      </div>

    </div>
  );
}
