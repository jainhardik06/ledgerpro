import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://moneyos.webasthetic.in';

  return {
    rules: {
      userAgent: ['Googlebot', 'Bingbot', 'GPTBot', 'ClaudeBot', 'PerplexityBot', 'CCBot', 'OAI-SearchBot'],
      allow: '/',
      disallow: ['/dashboard/', '/admin/', '/superadmin/', '/api/auth/'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
