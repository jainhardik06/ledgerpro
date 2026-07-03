import type { MetadataRoute } from 'next';

const routes = [
  '',
  '/about',
  '/accessibility',
  '/blog',
  '/changelog',
  '/contact',
  '/contact-support',
  '/cookie-policy',
  '/docs',
  '/dpa',
  '/faq',
  '/features/audit-logs',
  '/features/budgets',
  '/features/expense-tracking',
  '/features/recurring-transactions',
  '/features/reports',
  '/features/teams',
  '/guides',
  '/privacy',
  '/refund-policy',
  '/security',
  '/status',
  '/support',
  '/support/getting-started',
  '/terms',
  '/use-cases/agencies',
  '/use-cases/freelancers',
  '/use-cases/small-businesses',
  '/use-cases/student-clubs',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.startsWith('http')
    ? process.env.NEXT_PUBLIC_APP_URL
    : `https://${process.env.NEXT_PUBLIC_APP_URL || 'ledger.webasthetic.in'}`;
  const now = new Date();

  return routes.map(route => ({
    url: `${baseUrl}${route}`,
    lastModified: now,
    changeFrequency: route === '' ? 'weekly' : 'monthly',
    priority: route === '' ? 1 : 0.7,
  }));
}
