import { NextRequest, NextResponse } from 'next/server';
import { createLog } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { userAgent, path } = await req.json();

    if (!userAgent) {
      return NextResponse.json({ error: 'Missing userAgent' }, { status: 400 });
    }

    // Determine the bot name
    let botName = 'UnknownBot';
    if (userAgent.includes('GPTBot')) botName = 'GPTBot';
    else if (userAgent.includes('ClaudeBot')) botName = 'ClaudeBot';
    else if (userAgent.includes('PerplexityBot')) botName = 'PerplexityBot';
    else if (userAgent.includes('CCBot')) botName = 'CCBot';
    else if (userAgent.includes('Bingbot')) botName = 'BingBot';
    else if (userAgent.includes('Googlebot')) botName = 'GoogleBot';

    // Log the crawl as a system log using username 'SYSTEM' or 'AI_CRAWLER'
    await createLog(
      'SYSTEM',
      'AI_CRAWLER',
      `${botName} crawled path: ${path}`,
      'global',
      '127.0.0.1' // or extract from req
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to track bot' }, { status: 500 });
  }
}
