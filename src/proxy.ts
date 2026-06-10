import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const ua = request.headers.get('user-agent') || '';
  
  if (ua.match(/GPTBot|ClaudeBot|PerplexityBot|CCBot|Bingbot|Googlebot/i)) {
    // Fire and forget to internal tracking endpoint to avoid blocking the response
    fetch(`${request.nextUrl.origin}/api/internal/bot-track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        userAgent: ua, 
        path: request.nextUrl.pathname 
      })
    }).catch(() => {
      // Silently ignore errors
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/internal (to avoid infinite loops)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api/internal|_next/static|_next/image|favicon.ico).*)',
  ],
};
