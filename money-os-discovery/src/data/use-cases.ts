/**
 * Manifest of the programmatic use-case pages.
 *
 * The pages themselves live in `src/pages/use-cases/*.astro` (each rendered via
 * UseCaseLayout). This manifest is the single source of truth for the use-cases
 * INDEX grid and the build-time OG image factory, so titles never drift.
 *
 * To add a use case: create the `.astro` page, then add one row here.
 */
export interface UseCaseEntry {
  slug: string;
  audience: string;
  /** Headline used on the OG card. */
  ogTitle: string;
  /** One-line summary for the index grid. */
  blurb: string;
  /** Grouping for the index page. */
  group: 'Audience' | 'Keyword';
}

export const useCases: UseCaseEntry[] = [
  // ── Tier 1: audience pages ──
  { slug: 'freelancers', audience: 'Freelancers', ogTitle: 'Your freelance finances. Finally organized.', blurb: 'Track deductible expenses, set budgets that hold, and generate a tax-ready report in seconds.', group: 'Audience' },
  { slug: 'agencies', audience: 'Agencies', ogTitle: 'Run agency finances without the spreadsheet chaos.', blurb: 'Multi-client expense tracking, per-client profitability, and team financial visibility.', group: 'Audience' },
  { slug: 'startups', audience: 'Startups', ogTitle: 'Know your runway. Control your burn.', blurb: 'Real-time expense tracking and budget monitoring for early-stage founders — no CFO required.', group: 'Audience' },
  { slug: 'creators', audience: 'Creators', ogTitle: 'Your creator business deserves real financial visibility.', blurb: 'Track ad revenue, brand deals, affiliate income, and course sales alongside every expense.', group: 'Audience' },
  { slug: 'student-clubs', audience: 'Student Clubs', ogTitle: 'Transparent fund management for campus organizations.', blurb: 'Track dues, event expenses, and allocations with full committee visibility.', group: 'Audience' },
  { slug: 'small-businesses', audience: 'Small Businesses', ogTitle: 'Small business finances. Clean, fast, always current.', blurb: 'Ditch the spreadsheet. Track expenses, hold budgets, hand your accountant a complete record.', group: 'Audience' },

  // ── Tier 2: keyword-intent pages ──
  { slug: 'expense-tracker-freelancers', audience: 'Freelancers', ogTitle: 'The expense tracker built for how freelancers work.', blurb: 'Import your bank CSV, categorize in seconds, export a tax-ready report. No subscription.', group: 'Keyword' },
  { slug: 'budget-tracker-freelancers', audience: 'Freelancers', ogTitle: 'Set your freelance budget. Stick to it.', blurb: 'Category budgets, overspend alerts, and real-time budget-vs-actual for freelancers.', group: 'Keyword' },
  { slug: 'expense-tracker-agencies', audience: 'Agencies', ogTitle: 'Track agency expenses across every client.', blurb: 'Tag transactions to clients, flag reimbursables, and generate per-client billing summaries.', group: 'Keyword' },
  { slug: 'budget-tracker-agencies', audience: 'Agencies', ogTitle: 'Agency budgets that prevent scope creep.', blurb: 'Project and overhead budgets with real-time client spend and margin analysis.', group: 'Keyword' },
  { slug: 'club-finance-management', audience: 'Clubs & Organizations', ogTitle: 'Club finances that every member can trust.', blurb: 'Transparent fund tracking, event budgets, and a complete year-end financial record.', group: 'Keyword' },
  { slug: 'team-expense-management', audience: 'Teams', ogTitle: 'Team expenses. One workspace. Zero chaos.', blurb: 'Role-based access, direct expense logging, and a real-time team-wide picture.', group: 'Keyword' },
  { slug: 'subscription-tracker', audience: 'Freelancers & Small Teams', ogTitle: 'Every subscription, tracked automatically.', blurb: 'Set up recurring expenses once — Money OS logs them on schedule, no surprise renewals.', group: 'Keyword' },
  { slug: 'nonprofit-expense-tracking', audience: 'Nonprofits & Community Organizations', ogTitle: 'Financial transparency your board can see.', blurb: 'Restricted-fund accounts, board-level viewer access, and audit-ready reports.', group: 'Keyword' },
];
