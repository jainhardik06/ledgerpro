import { NextResponse } from 'next/server';
import type { NextRequest, NextFetchEvent } from 'next/server';

/**
 * Single edge proxy for the whole app. Two responsibilities:
 *
 * 1. Security headers (CSP, HSTS, X-Frame-Options, etc.) on every response.
 * 2. AI/search crawler telemetry — robots.ts explicitly welcomes GPTBot,
 *    ClaudeBot, PerplexityBot, Googlebot, Bingbot, CCBot, and OAI-SearchBot,
 *    and /super-admin/discovery reads visit counts from the Growth DB's
 *    `crawler_visits` collection, but nothing ever wrote to it. This detects
 *    those crawlers and pings /api/internal/bot-track (a Node.js API route,
 *    since this edge proxy can't use the native mongodb driver directly),
 *    which does the actual DB write.
 *
 * This file replaces two files that previously existed side by side and
 * silently conflicted: a root-level `proxy.ts` with the CSP logic (which
 * Next.js never actually loads once a `src/` directory is in use — it was
 * dead code, the security headers below were NOT being applied in
 * production) and this file with only bot tracking (missing the
 * `botFamily` field the tracking endpoint requires, and not using
 * `waitUntil`, so the fetch could be dropped before completing on Edge).
 */

const BOT_PATTERNS: Array<{ pattern: RegExp; family: string }> = [
  { pattern: /GPTBot|OAI-SearchBot|ChatGPT-User/i, family: 'GPTBot' },
  { pattern: /ClaudeBot|Claude-Web|anthropic-ai/i, family: 'Claude' },
  { pattern: /PerplexityBot/i, family: 'Perplexity' },
  { pattern: /Google-Extended|Gemini/i, family: 'Gemini' },
  { pattern: /Bingbot|BingPreview|Copilot/i, family: 'Copilot' },
  { pattern: /Googlebot/i, family: 'Googlebot' },
  { pattern: /CCBot/i, family: 'CCBot' },
  { pattern: /Applebot/i, family: 'Applebot' },
];

function detectBot(userAgent: string): string | null {
  for (const { pattern, family } of BOT_PATTERNS) {
    if (pattern.test(userAgent)) return family;
  }
  return null;
}

export function proxy(request: NextRequest, event: NextFetchEvent) {
  const isDev = process.env.NODE_ENV === 'development';

  // ── 1. Crawler telemetry (fire-and-forget, never blocks the response) ──
  const userAgent = request.headers.get('user-agent') || '';
  const botFamily = detectBot(userAgent);
  if (botFamily) {
    const trackUrl = new URL('/api/internal/bot-track', request.nextUrl.origin);
    event.waitUntil(
      fetch(trackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botFamily,
          userAgent,
          path: request.nextUrl.pathname,
          ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
        }),
      }).catch(() => {
        // Telemetry must never affect a crawler's ability to read the page.
      })
    );
  }

  // ── 2. Security headers ──
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://us.i.posthog.com https://us-assets.i.posthog.com${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://www.googletagmanager.com https://upload.wikimedia.org https://*.supabase.co https://*.amazonaws.com https://*.r2.cloudflarestorage.com https://*.r2.dev https:",
    "font-src 'self' data:",
    "connect-src 'self' https://www.googletagmanager.com https://us.i.posthog.com https://us-assets.i.posthog.com https://www.google-analytics.com https://*.supabase.co",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');

  const response = NextResponse.next();
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (!isDev) {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }

  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api/internal|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
