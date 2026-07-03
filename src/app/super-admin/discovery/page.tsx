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
  Clock,
  TrendingUp,
  DollarSign,
  Zap,
  Target,
  Rocket,
  BarChart2,
  Tag,
  AlertCircle,
  ExternalLink
} from 'lucide-react';

export const dynamic = 'force-dynamic';

const DISCOVERY_SITE_URL = 'https://discover.moneyos.webasthetic.in';

/** Live HTTP check with a short timeout — used to verify the discovery site
 * and its SEO/AI-discovery surface (sitemap, robots.txt, llms.txt) are
 * actually reachable in production, not just "code exists". */
async function checkUrl(url: string, timeoutMs = 4000): Promise<{ ok: boolean; status: number | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal, cache: 'no-store' });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: null };
  } finally {
    clearTimeout(timer);
  }
}

function StatCard({ icon: Icon, label, value, accent }: { icon: any, label: string, value: string | number, accent?: string }) {
  return (
    <div className="p-6 rounded-xl border border-[#262626] bg-[#000000]">
      <div className={`flex items-center gap-2 mb-4 ${accent ?? 'text-[#a1a1aa]'}`}>
        <Icon className="w-4 h-4" />
        <span className="text-[13px] font-medium text-[#a1a1aa]">{label}</span>
      </div>
      <div className="text-[32px] font-semibold text-[#ededed] tabular-nums font-mono leading-none tracking-tighter">{value}</div>
    </div>
  );
}

function SectionHeader({ title, href, linkLabel }: { title: string, href?: string, linkLabel?: string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-[11px] font-medium text-[#525252] uppercase tracking-wider">{title}</h2>
      {href && <a href={href} className="text-[12px] text-blue-400 hover:underline">{linkLabel ?? 'Manage →'}</a>}
    </div>
  );
}

export default async function DiscoveryDashboard() {
  const { db } = await connectGrowthDb();

  // --- State ---
  let dbConnected = false;

  // Infrastructure
  let discoveryDeployed = false;
  let sitemapStatus: { ok: boolean; status: number | null } = { ok: false, status: null };
  let robotsStatus: { ok: boolean; status: number | null } = { ok: false, status: null };
  let llmsStatus: { ok: boolean; status: number | null } = { ok: false, status: null };

  // Live-check the deployed discovery site's SEO/AI-discovery surface. Runs
  // in parallel with the DB fetch below since it's independent I/O.
  const liveChecksPromise = Promise.all([
    checkUrl(DISCOVERY_SITE_URL + '/'),
    checkUrl(DISCOVERY_SITE_URL + '/sitemap-index.xml'),
    checkUrl(DISCOVERY_SITE_URL + '/robots.txt'),
    checkUrl(DISCOVERY_SITE_URL + '/llms.txt'),
  ]);

  // Directories
  let totalTargets = 0, dirSubmitted = 0, dirApproved = 0, dirRejected = 0;

  // Backlinks
  let totalBacklinks = 0, activeBacklinks = 0, doFollowBacklinks = 0;
  let recentBacklinks: any[] = [];

  // Content
  let docsCount = 0, seoPagesCount = 0, blogCount = 0, comparisonsCount = 0;
  let blogPostDetails: any[] = [];

  // Keywords
  let totalKeywords = 0, rankedKeywords = 0;
  let topKeywords: any[] = [];

  // AI Crawlers
  let gptBotHits = 0, claudeBotHits = 0, perplexityHits = 0, geminiHits = 0, copilotHits = 0;

  // Social
  let socialProfiles: any[] = [];

  // Product Hunt
  let phAssets: any[] = [];

  // Monetization
  let totalAdUnits = 0, activeAdUnits = 0;
  let totalAffiliateLinks = 0, activeAffiliateLinks = 0;
  let last30DaysEarningsUsd = 0;
  let last30DaysConversions = 0;

  // Content Engine
  let totalTopics = 0, backlogTopics = 0, writingTopics = 0, doneTopics = 0;
  let totalBriefs = 0, approvedBriefs = 0;
  let topTopics: any[] = [];

  if (db) {
    dbConnected = true;
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [
        _totalTargets, _dirSubmitted, _dirApproved, _dirRejected,
        _totalBacklinks, _activeBacklinks, _doFollowBacklinks, _recentBacklinks,
        _docsCount, _seoPagesCount, _blogCount, _comparisonsCount,
        _totalKeywords, _rankedKeywords, _topKeywords,
        _gptBot, _claudeBot, _perplexity, _gemini, _copilot,
        _socialProfiles,
        _phAssets,
        _totalAdUnits, _activeAdUnits,
        _totalAffiliateLinks, _activeAffiliateLinks,
        _adPerfResult, _convResult,
        _totalTopics, _backlogTopics, _writingTopics, _doneTopics,
        _totalBriefs, _approvedBriefs, _topTopics
      ] = await Promise.all([
        // Directories
        db.collection('directories').countDocuments(),
        db.collection('directory_submissions').countDocuments({ status: 'Pending' }),
        db.collection('directory_submissions').countDocuments({ status: 'Approved' }),
        db.collection('directory_submissions').countDocuments({ status: 'Rejected' }),

        // Backlinks
        db.collection('backlinks').countDocuments(),
        db.collection('backlinks').countDocuments({ status: 'Active' }),
        db.collection('backlinks').countDocuments({ status: 'Active', isDoFollow: true }),
        db.collection('backlinks').find({ status: 'Active' }).sort({ discoveredAt: -1 }).limit(5).toArray(),

        // Content counts
        db.collection('docs_pages').countDocuments(),
        db.collection('seo_pages').countDocuments({ status: 'Published' }),
        db.collection('blog_posts').countDocuments({ status: 'Published' }),
        db.collection('seo_pages').countDocuments({ category: 'comparison' }),

        // Keywords
        db.collection('keyword_targets').countDocuments(),
        db.collection('keyword_targets').countDocuments({ currentRank: { $lte: 10 } }),
        db.collection('keyword_targets').find({}).sort({ currentRank: 1 }).limit(5).toArray(),

        // AI Crawlers
        db.collection('crawler_visits').countDocuments({ botFamily: 'GPTBot' }),
        db.collection('crawler_visits').countDocuments({ botFamily: 'Claude' }),
        db.collection('crawler_visits').countDocuments({ botFamily: 'Perplexity' }),
        db.collection('crawler_visits').countDocuments({ botFamily: 'Gemini' }),
        db.collection('crawler_visits').countDocuments({ botFamily: 'Copilot' }),

        // Social
        db.collection('social_profiles').find({}).toArray(),

        // Product Hunt
        db.collection('product_hunt_assets').find({}).sort({ launchDate: -1 }).limit(3).toArray(),

        // Monetization
        db.collection('ad_units').countDocuments(),
        db.collection('ad_units').countDocuments({ isActive: true }),
        db.collection('affiliate_links').countDocuments(),
        db.collection('affiliate_links').countDocuments({ isActive: true }),
        db.collection('ad_performance').aggregate([
          { $match: { fetchedAt: { $gte: thirtyDaysAgo } } },
          { $group: { _id: null, total: { $sum: '$estimatedEarningsUsd' } } }
        ]).toArray(),
        db.collection('affiliate_conversions').countDocuments({ convertedAt: { $gte: thirtyDaysAgo }, verificationStatus: 'Confirmed' }),

        // Content Engine
        db.collection('content_topics').countDocuments(),
        db.collection('content_topics').countDocuments({ status: 'Backlog' }),
        db.collection('content_topics').countDocuments({ status: 'Writing' }),
        db.collection('content_topics').countDocuments({ status: 'Done' }),
        db.collection('content_briefs').countDocuments(),
        db.collection('content_briefs').countDocuments({ status: 'Approved' }),
        db.collection('content_topics').find({ status: { $in: ['Backlog', 'Planning'] } }).sort({ score: -1 }).limit(5).toArray(),
      ]);

      totalTargets = _totalTargets; dirSubmitted = _dirSubmitted; dirApproved = _dirApproved; dirRejected = _dirRejected;
      totalBacklinks = _totalBacklinks; activeBacklinks = _activeBacklinks; doFollowBacklinks = _doFollowBacklinks;
      recentBacklinks = _recentBacklinks;
      docsCount = _docsCount; seoPagesCount = _seoPagesCount; blogCount = _blogCount; comparisonsCount = _comparisonsCount;
      totalKeywords = _totalKeywords; rankedKeywords = _rankedKeywords; topKeywords = _topKeywords;
      gptBotHits = _gptBot; claudeBotHits = _claudeBot; perplexityHits = _perplexity; geminiHits = _gemini; copilotHits = _copilot;
      socialProfiles = _socialProfiles;
      phAssets = _phAssets;
      totalAdUnits = _totalAdUnits; activeAdUnits = _activeAdUnits;
      totalAffiliateLinks = _totalAffiliateLinks; activeAffiliateLinks = _activeAffiliateLinks;
      last30DaysEarningsUsd = _adPerfResult[0]?.total ?? 0;
      last30DaysConversions = _convResult;
      totalTopics = _totalTopics; backlogTopics = _backlogTopics; writingTopics = _writingTopics; doneTopics = _doneTopics;
      totalBriefs = _totalBriefs; approvedBriefs = _approvedBriefs;
      topTopics = _topTopics;

      // Content Intelligence — real per-post data from the content engine's
      // maintenance scripts (sync-content-performance.mjs, detect-stale-
      // content.mjs, and the indexnow/gsc status generate-post.mjs records
      // at publish time). Nothing here is computed live in the dashboard;
      // it's all previously-synced real data, kept fast to load.
      blogPostDetails = await db.collection('blog_posts')
        .find({})
        .sort({ published_at: -1 })
        .limit(20)
        .project({ slug: 1, title: 1, pageviews_90d: 1, needs_refresh: 1, age_months: 1, indexnow_status: 1, gsc_indexing_status: 1, published_at: 1 })
        .toArray();
    } catch (e) {
      console.error('[DiscoveryDashboard] Error fetching growth stats:', e);
    }
  }

  try {
    const [homeCheck, sitemapCheck, robotsCheck, llmsCheck] = await liveChecksPromise;
    discoveryDeployed = homeCheck.ok;
    sitemapStatus = sitemapCheck;
    robotsStatus = robotsCheck;
    llmsStatus = llmsCheck;
  } catch (e) {
    console.error('[DiscoveryDashboard] Error running live site checks:', e);
  }

  const totalCrawlerHits = gptBotHits + claudeBotHits + perplexityHits + geminiHits + copilotHits;
  const phDraft = phAssets.find(a => a.status === 'Draft');

  // Launch checklist — computed entirely from real data fetched above, no
  // fabricated fields. Each item is either verifiably true or honestly false.
  const launchChecklist = [
    { label: 'Discovery site live', done: discoveryDeployed },
    { label: 'Sitemap reachable', done: sitemapStatus.ok },
    { label: 'robots.txt reachable', done: robotsStatus.ok },
    { label: 'llms.txt reachable', done: llmsStatus.ok },
    { label: `Docs published (${docsCount})`, done: docsCount > 0 },
    { label: `Blog posts published (${blogCount})`, done: blogCount > 0 },
    { label: `Directories submitted (${dirSubmitted}/${totalTargets})`, done: dirSubmitted > 0 },
    { label: `Backlinks earned (${totalBacklinks})`, done: totalBacklinks > 0 },
    { label: `AI crawler visits recorded (${totalCrawlerHits})`, done: totalCrawlerHits > 0 },
    { label: `Ad monetization active (${activeAdUnits}/${totalAdUnits})`, done: activeAdUnits > 0 },
  ];

  return (
    <div className="p-6 sm:p-8 max-w-[1280px] mx-auto font-sans">

      {/* Header */}
      <div className="mb-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium text-[#525252] uppercase tracking-wider mb-2">Platform Console</p>
          <h1 className="text-[32px] font-semibold text-[#ededed] tracking-tight leading-tight">Discovery Intelligence Center</h1>
          <p className="text-[14px] text-[#a1a1aa] mt-1.5 leading-relaxed max-w-xl">Centralized operations for the Money OS growth ecosystem. Directories, backlinks, content, AI discovery, and monetization in one place.</p>
        </div>
        <a href="/super-admin/discovery" className="bg-transparent border border-[#262626] rounded-md px-4 py-2 text-[13px] font-medium text-[#ededed] hover:bg-[#0a0a0a] transition-colors duration-150 ease-out flex items-center gap-2 w-max focus:outline-none focus:ring-1 focus:ring-[#ededed] focus:ring-offset-1 focus:ring-offset-black">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Data
        </a>
      </div>

      {/* ─── SECTION 1: INFRASTRUCTURE ─── */}
      <SectionHeader title="Infrastructure" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <div className="p-5 rounded-xl border border-[#262626] bg-[#0a0a0a] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="w-4 h-4 text-[#a1a1aa]" />
            <span className="text-[13px] font-medium text-[#ededed]">Growth Database</span>
          </div>
          {dbConnected ? (
            <span className="text-[11px] text-emerald-400 font-medium uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" /> Connected
            </span>
          ) : (
            <span className="text-[11px] text-rose-400 font-medium uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block" /> Offline
            </span>
          )}
        </div>
        <div className="p-5 rounded-xl border border-[#262626] bg-[#0a0a0a] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Layout className="w-4 h-4 text-[#a1a1aa]" />
            <span className="text-[13px] font-medium text-[#ededed]">Astro Discovery Site</span>
          </div>
          {discoveryDeployed ? (
            <span className="text-[11px] text-emerald-400 font-medium uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" /> Live
            </span>
          ) : (
            <span className="text-[11px] text-amber-400 font-medium uppercase tracking-wider">Awaiting Deploy</span>
          )}
        </div>
        <div className="p-5 rounded-xl border border-[#262626] bg-[#0a0a0a] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Search className="w-4 h-4 text-[#a1a1aa]" />
            <span className="text-[13px] font-medium text-[#ededed]">SEO Index Status</span>
          </div>
          <span className="text-[11px] text-[#525252] font-medium uppercase tracking-wider">Not Configured</span>
        </div>
      </div>

      {/* ─── SECTION 1B: PUBLISHING & DISTRIBUTION STATUS ─── */}
      <SectionHeader title="Publishing & Distribution Status" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        {[
          { label: 'Sitemap', status: sitemapStatus, href: DISCOVERY_SITE_URL + '/sitemap-index.xml' },
          { label: 'robots.txt (AI crawlers)', status: robotsStatus, href: DISCOVERY_SITE_URL + '/robots.txt' },
          { label: 'llms.txt', status: llmsStatus, href: DISCOVERY_SITE_URL + '/llms.txt' },
        ].map((item) => (
          <a
            key={item.label}
            href={item.href}
            target="_blank"
            rel="noreferrer"
            className="p-5 rounded-xl border border-[#262626] bg-[#0a0a0a] flex items-center justify-between hover:border-[#404040] transition-colors"
          >
            <div className="flex items-center gap-3">
              <FileText className="w-4 h-4 text-[#a1a1aa]" />
              <span className="text-[13px] font-medium text-[#ededed]">{item.label}</span>
            </div>
            {item.status.ok ? (
              <span className="text-[11px] text-emerald-400 font-medium uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" /> {item.status.status}
              </span>
            ) : (
              <span className="text-[11px] text-rose-400 font-medium uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block" /> {item.status.status ?? 'Unreachable'}
              </span>
            )}
          </a>
        ))}
      </div>

      {/* ─── SECTION 1C: LAUNCH CHECKLIST ─── */}
      <SectionHeader title="Launch Checklist" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-10">
        {launchChecklist.map((item) => (
          <div key={item.label} className="flex items-center gap-3 px-4 py-3 rounded-lg border border-[#262626] bg-[#0a0a0a]">
            {item.done ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-[#525252] shrink-0" />
            )}
            <span className={`text-[13px] ${item.done ? 'text-[#ededed]' : 'text-[#737373]'}`}>{item.label}</span>
          </div>
        ))}
      </div>

      {/* ─── SECTION 2: DIRECTORIES ─── */}
      <SectionHeader title="Directory Tracking" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-10">
        <StatCard icon={Globe} label="Total Targets" value={totalTargets} />
        <StatCard icon={Clock} label="Pending" value={dirSubmitted} />
        <StatCard icon={CheckCircle2} label="Approved" value={dirApproved} />
        <StatCard icon={XCircle} label="Rejected" value={dirRejected} />
        <StatCard icon={LinkIcon} label="Backlinks Earned" value={totalBacklinks} />
      </div>

      {/* ─── SECTION 3: BACKLINKS ─── */}
      <SectionHeader title="Backlink Intelligence" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <StatCard icon={LinkIcon} label="Total Backlinks" value={totalBacklinks} />
        <StatCard icon={Activity} label="Active Links" value={activeBacklinks} />
        <StatCard icon={TrendingUp} label="DoFollow Links" value={doFollowBacklinks} />
      </div>
      <div className="border border-[#262626] bg-[#0a0a0a] rounded-xl overflow-hidden mb-10">
        <div className="px-5 py-3.5 border-b border-[#262626]">
          <span className="text-[11px] font-medium text-[#525252] uppercase tracking-wider">Recent Acquisitions</span>
        </div>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[#262626]">
              <th className="px-5 py-3 text-[11px] uppercase tracking-wider font-medium text-[#525252]">Source URL</th>
              <th className="px-5 py-3 text-[11px] uppercase tracking-wider font-medium text-[#525252]">Anchor Text</th>
              <th className="px-5 py-3 text-[11px] uppercase tracking-wider font-medium text-[#525252]">Type</th>
              <th className="px-5 py-3 text-[11px] uppercase tracking-wider font-medium text-[#525252] text-right">Discovered</th>
            </tr>
          </thead>
          <tbody>
            {recentBacklinks.length === 0 ? (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-[13px] text-[#525252]">No backlinks tracked yet. Approve a directory submission to start.</td></tr>
            ) : (
              recentBacklinks.map((b) => (
                <tr key={b._id.toString()} className="border-b border-[#262626] last:border-0 hover:bg-[#111] transition-colors">
                  <td className="px-5 py-3.5 text-[13px] text-blue-400 max-w-[200px] truncate"><a href={b.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1">{b.sourceUrl}<ExternalLink className="w-3 h-3 shrink-0" /></a></td>
                  <td className="px-5 py-3.5 text-[13px] text-[#a1a1aa]">{b.anchorText || '—'}</td>
                  <td className="px-5 py-3.5"><span className={`text-[11px] font-medium uppercase tracking-wider px-2 py-0.5 rounded ${b.isDoFollow ? 'bg-emerald-500/10 text-emerald-400' : 'bg-[#262626] text-[#525252]'}`}>{b.isDoFollow ? 'DoFollow' : 'NoFollow'}</span></td>
                  <td className="px-5 py-3.5 text-[13px] text-[#525252] text-right tabular-nums">{b.discoveredAt ? new Date(b.discoveredAt).toLocaleDateString() : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ─── SECTION 4: SEO PAGES ─── */}
      <SectionHeader title="SEO Pages" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        <StatCard icon={FileText} label="Docs Pages" value={docsCount} />
        <StatCard icon={Search} label="SEO Pages Live" value={seoPagesCount} />
        <StatCard icon={BookOpen} label="Blog Posts" value={blogCount} />
        <StatCard icon={Activity} label="Comparisons" value={comparisonsCount} />
      </div>

      {/* ─── SECTION 4B: CONTENT INTELLIGENCE ─── */}
      <SectionHeader title="Content Intelligence" />
      <div className="border border-[#262626] bg-[#0a0a0a] rounded-xl overflow-hidden mb-10">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[#262626]">
              <th className="px-5 py-3 text-[11px] uppercase tracking-wider font-medium text-[#525252]">Post</th>
              <th className="px-5 py-3 text-[11px] uppercase tracking-wider font-medium text-[#525252]">Views (90d)</th>
              <th className="px-5 py-3 text-[11px] uppercase tracking-wider font-medium text-[#525252]">Age</th>
              <th className="px-5 py-3 text-[11px] uppercase tracking-wider font-medium text-[#525252]">IndexNow</th>
              <th className="px-5 py-3 text-[11px] uppercase tracking-wider font-medium text-[#525252]">Google Indexing</th>
            </tr>
          </thead>
          <tbody>
            {blogPostDetails.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-[13px] text-[#525252]">No blog posts yet.</td></tr>
            ) : (
              blogPostDetails.map((p) => (
                <tr key={p.slug} className="border-b border-[#262626] last:border-0">
                  <td className="px-5 py-3 text-[13px] text-[#ededed]">
                    {p.title}
                    {p.needs_refresh && <span className="ml-2 text-[10px] text-amber-400 uppercase tracking-wider">Needs refresh</span>}
                  </td>
                  <td className="px-5 py-3 text-[13px] text-[#a1a1aa] tabular-nums font-mono">{p.pageviews_90d ?? '—'}</td>
                  <td className="px-5 py-3 text-[13px] text-[#a1a1aa]">{p.age_months != null ? `${p.age_months}mo` : '—'}</td>
                  <td className="px-5 py-3 text-[13px]">
                    <span className={p.indexnow_status === 'submitted' ? 'text-emerald-400' : 'text-[#525252]'}>{p.indexnow_status ?? 'not synced'}</span>
                  </td>
                  <td className="px-5 py-3 text-[13px]">
                    <span className={p.gsc_indexing_status === 'submitted' ? 'text-emerald-400' : 'text-[#525252]'}>{p.gsc_indexing_status ?? 'not synced'}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ─── SECTION 5: KEYWORDS ─── */}
      <SectionHeader title="Keyword Targets" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <StatCard icon={Target} label="Keywords Tracked" value={totalKeywords} />
        <StatCard icon={TrendingUp} label="Ranking Top 10" value={rankedKeywords} />
      </div>
      <div className="border border-[#262626] bg-[#0a0a0a] rounded-xl overflow-hidden mb-10">
        <div className="px-5 py-3.5 border-b border-[#262626]">
          <span className="text-[11px] font-medium text-[#525252] uppercase tracking-wider">Top Keywords by Rank</span>
        </div>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[#262626]">
              <th className="px-5 py-3 text-[11px] uppercase tracking-wider font-medium text-[#525252]">Keyword</th>
              <th className="px-5 py-3 text-[11px] uppercase tracking-wider font-medium text-[#525252] text-right">Volume</th>
              <th className="px-5 py-3 text-[11px] uppercase tracking-wider font-medium text-[#525252] text-right">Difficulty</th>
              <th className="px-5 py-3 text-[11px] uppercase tracking-wider font-medium text-[#525252] text-right">Rank</th>
            </tr>
          </thead>
          <tbody>
            {topKeywords.length === 0 ? (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-[13px] text-[#525252]">No keywords tracked yet.</td></tr>
            ) : (
              topKeywords.map((k) => (
                <tr key={k._id.toString()} className="border-b border-[#262626] last:border-0 hover:bg-[#111] transition-colors">
                  <td className="px-5 py-3.5 text-[13px] font-medium text-[#ededed]">{k.keyword}</td>
                  <td className="px-5 py-3.5 text-[13px] text-[#a1a1aa] tabular-nums text-right">{k.searchVolume?.toLocaleString() ?? '—'}</td>
                  <td className="px-5 py-3.5 text-right"><span className={`text-[11px] font-medium uppercase tracking-wider px-2 py-0.5 rounded tabular-nums ${k.difficulty < 30 ? 'bg-emerald-500/10 text-emerald-400' : k.difficulty < 60 ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400'}`}>{k.difficulty ?? '—'}</span></td>
                  <td className="px-5 py-3.5 text-[13px] text-[#ededed] tabular-nums font-mono text-right">{k.currentRank ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ─── SECTION 6: DOCS ─── */}
      <SectionHeader title="Documentation Engine" href="/super-admin/discovery/docs" linkLabel="Manage Docs →" />
      <div className="p-5 rounded-xl border border-[#262626] bg-[#0a0a0a] mb-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div>
            <div className="text-[11px] font-medium text-[#525252] uppercase tracking-wider mb-2">Published Docs</div>
            <div className="text-[28px] font-semibold text-[#ededed] tabular-nums font-mono tracking-tighter">{docsCount}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-[#525252] uppercase tracking-wider mb-2">Target (v1)</div>
            <div className="text-[28px] font-semibold text-[#ededed] tabular-nums font-mono tracking-tighter">10</div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-[#525252] uppercase tracking-wider mb-2">Future Target</div>
            <div className="text-[28px] font-semibold text-[#ededed] tabular-nums font-mono tracking-tighter">500+</div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-[#525252] uppercase tracking-wider mb-2">Search Index</div>
            <div className="text-[11px] text-amber-400 font-medium uppercase tracking-wider mt-1">Pagefind — Pending</div>
          </div>
        </div>
      </div>

      {/* ─── SECTION 7: BLOGS ─── */}
      <SectionHeader title="Blog Engine" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        <StatCard icon={FileText} label="Published Posts" value={blogCount} />
        <StatCard icon={TrendingUp} label="Target (Month 1)" value={10} />
        <StatCard icon={Zap} label="AI Pipeline" value="Manual" />
        <StatCard icon={BarChart2} label="Avg. Reading Time" value="—" />
      </div>

      {/* ─── SECTION 8: AI CRAWLERS ─── */}
      <SectionHeader title="AI Crawler Penetration" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
        <StatCard icon={Bot} label="GPTBot" value={gptBotHits} />
        <StatCard icon={Bot} label="ClaudeBot" value={claudeBotHits} />
        <StatCard icon={Bot} label="PerplexityBot" value={perplexityHits} />
        <StatCard icon={Bot} label="Googlebot/Gemini" value={geminiHits} />
        <StatCard icon={Bot} label="BingBot/Copilot" value={copilotHits} />
      </div>
      <div className="p-5 rounded-xl border border-[#262626] bg-[#0a0a0a] mb-10 flex items-center gap-4">
        <div className="text-[32px] font-semibold text-[#ededed] tabular-nums font-mono tracking-tighter">{totalCrawlerHits}</div>
        <div>
          <div className="text-[13px] font-medium text-[#ededed]">Total AI Crawler Visits</div>
          <div className="text-[13px] text-[#525252]">TTL window: 90 days. Auto-purged by MongoDB TTL index.</div>
        </div>
      </div>

      {/* ─── SECTION 9: SOCIAL PROFILES ─── */}
      <SectionHeader title="Social Infrastructure" href="/super-admin/discovery/social" linkLabel="Manage Profiles →" />
      <div className="border border-[#262626] bg-[#0a0a0a] rounded-xl overflow-hidden mb-10">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[#262626]">
              <th className="px-5 py-3 text-[11px] uppercase tracking-wider font-medium text-[#525252]">Platform</th>
              <th className="px-5 py-3 text-[11px] uppercase tracking-wider font-medium text-[#525252]">Handle</th>
              <th className="px-5 py-3 text-[11px] uppercase tracking-wider font-medium text-[#525252]">Status</th>
              <th className="px-5 py-3 text-[11px] uppercase tracking-wider font-medium text-[#525252] text-right">Followers</th>
            </tr>
          </thead>
          <tbody>
            {socialProfiles.length === 0 ? (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-[13px] text-[#525252]">No social profiles configured. Add them to build credibility signals.</td></tr>
            ) : (
              socialProfiles.map(p => (
                <tr key={p._id.toString()} className="border-b border-[#262626] last:border-0 hover:bg-[#111] transition-colors">
                  <td className="px-5 py-3.5 text-[13px] font-medium text-[#ededed]"><a href={p.profileUrl} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1">{p.platform}<ExternalLink className="w-3 h-3" /></a></td>
                  <td className="px-5 py-3.5 text-[13px] text-[#a1a1aa] font-mono">{p.handle || '—'}</td>
                  <td className="px-5 py-3.5"><span className={`text-[11px] font-medium uppercase tracking-wider px-2 py-0.5 rounded ${p.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-[#262626] text-[#a1a1aa]'}`}>{p.status}</span></td>
                  <td className="px-5 py-3.5 text-[13px] text-[#ededed] tabular-nums font-mono text-right">{p.followersCount ?? 0}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ─── SECTION 10: PRODUCT HUNT ─── */}
      <SectionHeader title="Product Hunt Infrastructure" />
      <div className="border border-[#262626] bg-[#0a0a0a] rounded-xl overflow-hidden mb-10">
        {phAssets.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Rocket className="w-8 h-8 text-[#262626] mx-auto mb-3" />
            <p className="text-[13px] text-[#525252] mb-1">No launch campaigns configured yet.</p>
            <p className="text-[12px] text-[#525252]">Launch assets live in the <code className="font-mono text-[#a1a1aa]">product_hunt_assets</code> Growth DB collection.</p>
          </div>
        ) : (
          <>
            <div className="px-5 py-3.5 border-b border-[#262626]">
              <span className="text-[11px] font-medium text-[#525252] uppercase tracking-wider">Launch Campaigns</span>
            </div>
            {phAssets.map((asset) => (
              <div key={asset._id.toString()} className="px-5 py-4 border-b border-[#262626] last:border-0 flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-medium text-[#ededed]">{asset.tagline || 'Untitled Campaign'}</div>
                  <div className="text-[12px] text-[#525252] mt-0.5">Launch: {asset.launchDate ? new Date(asset.launchDate).toLocaleDateString() : 'TBD'}</div>
                </div>
                <span className={`text-[11px] font-medium uppercase tracking-wider px-2 py-0.5 rounded ${asset.status === 'Launched' ? 'bg-emerald-500/10 text-emerald-400' : asset.status === 'Scheduled' ? 'bg-blue-500/10 text-blue-400' : 'bg-[#262626] text-[#a1a1aa]'}`}>{asset.status}</span>
              </div>
            ))}
          </>
        )}
        <div className="px-5 py-4 border-t border-[#262626] grid grid-cols-2 sm:grid-cols-4 gap-4 bg-[#000000]">
          {[
            { label: 'Tagline', done: !!phDraft?.tagline },
            { label: 'Description', done: !!phDraft?.description },
            { label: 'Video', done: !!phDraft?.videoUrl },
            { label: 'Gallery Images', done: (phDraft?.images?.length ?? 0) >= 3 },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2">
              {item.done ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 text-[#525252] shrink-0" />}
              <span className="text-[12px] text-[#a1a1aa]">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── SECTION 11: MONETIZATION ─── */}
      <SectionHeader title="Monetization Engine" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <div className="p-5 rounded-xl border border-[#262626] bg-[#000000]">
          <div className="flex items-center gap-2 mb-3 text-[#a1a1aa]"><DollarSign className="w-4 h-4" /><span className="text-[13px] font-medium">Ad Revenue (30d)</span></div>
          <div className="text-[28px] font-semibold text-[#ededed] tabular-nums font-mono tracking-tighter">${last30DaysEarningsUsd.toFixed(2)}</div>
        </div>
        <div className="p-5 rounded-xl border border-[#262626] bg-[#000000]">
          <div className="flex items-center gap-2 mb-3 text-[#a1a1aa]"><Zap className="w-4 h-4" /><span className="text-[13px] font-medium">Active Ad Units</span></div>
          <div className="text-[28px] font-semibold text-[#ededed] tabular-nums font-mono tracking-tighter">{activeAdUnits}<span className="text-[16px] text-[#525252]">/{totalAdUnits}</span></div>
        </div>
        <div className="p-5 rounded-xl border border-[#262626] bg-[#000000]">
          <div className="flex items-center gap-2 mb-3 text-[#a1a1aa]"><Tag className="w-4 h-4" /><span className="text-[13px] font-medium">Affiliate Links</span></div>
          <div className="text-[28px] font-semibold text-[#ededed] tabular-nums font-mono tracking-tighter">{activeAffiliateLinks}<span className="text-[16px] text-[#525252]">/{totalAffiliateLinks}</span></div>
        </div>
        <div className="p-5 rounded-xl border border-[#262626] bg-[#000000]">
          <div className="flex items-center gap-2 mb-3 text-[#a1a1aa]"><CheckCircle2 className="w-4 h-4" /><span className="text-[13px] font-medium">Conversions (30d)</span></div>
          <div className="text-[28px] font-semibold text-[#ededed] tabular-nums font-mono tracking-tighter">{last30DaysConversions}</div>
        </div>
      </div>
      <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 mb-10 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[13px] text-amber-400/80 leading-relaxed"><strong className="text-amber-400">UX Rule</strong>: Docs and landing pages are ad-free. Blog posts carry max 2 contextual ads. Comparisons carry max 1. Ads are placed after content — never before.</p>
      </div>

      {/* ─── SECTION 12: CONTENT ENGINE ─── */}
      <SectionHeader title="Content Engine" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <StatCard icon={Zap} label="Topics Discovered" value={totalTopics} />
        <StatCard icon={Clock} label="In Backlog" value={backlogTopics} />
        <StatCard icon={FileText} label="Being Written" value={writingTopics} />
        <StatCard icon={CheckCircle2} label="Published" value={doneTopics} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <StatCard icon={FileText} label="Total Briefs" value={totalBriefs} />
        <StatCard icon={CheckCircle2} label="Approved Briefs" value={approvedBriefs} />
      </div>
      <div className="border border-[#262626] bg-[#0a0a0a] rounded-xl overflow-hidden mb-10">
        <div className="px-5 py-3.5 border-b border-[#262626]">
          <span className="text-[11px] font-medium text-[#525252] uppercase tracking-wider">Top Backlog Topics by Score</span>
        </div>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[#262626]">
              <th className="px-5 py-3 text-[11px] uppercase tracking-wider font-medium text-[#525252]">Topic</th>
              <th className="px-5 py-3 text-[11px] uppercase tracking-wider font-medium text-[#525252] text-right">Score</th>
              <th className="px-5 py-3 text-[11px] uppercase tracking-wider font-medium text-[#525252] text-right">Est. Volume</th>
              <th className="px-5 py-3 text-[11px] uppercase tracking-wider font-medium text-[#525252] text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {topTopics.length === 0 ? (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-[13px] text-[#525252]">No topics in the content pipeline yet.</td></tr>
            ) : (
              topTopics.map((t) => (
                <tr key={t._id.toString()} className="border-b border-[#262626] last:border-0 hover:bg-[#111] transition-colors">
                  <td className="px-5 py-3.5 text-[13px] font-medium text-[#ededed] max-w-[240px] truncate">{t.topic}</td>
                  <td className="px-5 py-3.5 text-[13px] text-[#ededed] tabular-nums font-mono text-right">{t.score ?? '—'}</td>
                  <td className="px-5 py-3.5 text-[13px] text-[#a1a1aa] tabular-nums text-right">{t.searchVolumeEstimate?.toLocaleString() ?? '—'}</td>
                  <td className="px-5 py-3.5 text-right"><span className="text-[11px] font-medium uppercase tracking-wider px-2 py-0.5 rounded bg-[#262626] text-[#a1a1aa]">{t.status}</span></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
