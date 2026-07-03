/**
 * SEO page inventory seed. Produces seo_pages records (url + type) for the
 * stable, programmatically-defined pages so the Discovery dashboard has a
 * complete picture. Blog/comparison/resource pages are registered by the
 * content engine as they publish.
 */
const SITE = 'https://discovermoneyos.webasthetic.in';

const useCaseSlugs = [
  'freelancers', 'agencies', 'startups', 'creators', 'student-clubs', 'small-businesses',
  'expense-tracker-freelancers', 'budget-tracker-freelancers', 'expense-tracker-agencies',
  'budget-tracker-agencies', 'club-finance-management', 'team-expense-management',
];

const docSlugs = [
  'introduction', 'creating-workspace', 'managing-transactions', 'budgets', 'reports',
  'clients', 'teams', 'audit-logs', 'security', 'faq',
];

export function useCasesSeed() {
  const now = new Date();
  const rows = [];
  rows.push({ url: `${SITE}/`, type: 'home', title: 'Money OS', indexed: false, updated_at: now });
  for (const s of useCaseSlugs) rows.push({ url: `${SITE}/use-cases/${s}`, type: 'use-case', slug: s, indexed: false, updated_at: now });
  for (const s of docSlugs) rows.push({ url: `${SITE}/docs/${s}`, type: 'doc', slug: s, indexed: false, updated_at: now });
  return rows;
}
