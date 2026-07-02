import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://moneyos.webasthetic.in';

  return {
    rules: {
      // Kept in sync with the bot patterns detected in src/proxy.ts and the
      // allow-list in money-os-discovery/public/robots.txt.
      userAgent: [
        'Googlebot', 'Bingbot', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
        'ClaudeBot', 'Claude-Web', 'anthropic-ai', 'PerplexityBot',
        'Google-Extended', 'CCBot', 'Applebot-Extended',
      ],
      allow: '/',
      // Was '/superadmin/' (no hyphen) — never matched the real route
      // (/super-admin/), so the actual admin dashboard was never excluded
      // from crawling. Fixed to match the real path.
      disallow: ['/dashboard/', '/admin/', '/super-admin/', '/api/auth/', '/api/internal/'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
