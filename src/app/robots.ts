import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.startsWith('http')
    ? process.env.NEXT_PUBLIC_APP_URL
    : `https://${process.env.NEXT_PUBLIC_APP_URL || 'ledger.webasthetic.in'}`;

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/super-admin', '/api'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
