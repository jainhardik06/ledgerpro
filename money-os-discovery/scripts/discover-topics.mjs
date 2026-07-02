/**
 * Topic Discovery Engine.
 *
 * Expands the content pipeline by generating new topic + keyword ideas with
 * Groq, scoring them, and inserting fresh rows into content_topics (status
 * "queued"). The generator (generate-post.mjs) then consumes them by priority.
 *
 * Seeds new ideas relative to what's already in the DB so it doesn't repeat
 * existing topics. No-ops gracefully without an API key.
 *
 * Usage: npm run growth:topics [-- --count=10]
 */
import { connect } from './lib/growth.mjs';
import { parseJson, hasApiKey } from './lib/llm.mjs';
import { generateStage } from './lib/rate-limit.mjs';
import { BLOG_CATEGORIES } from './lib/content.mjs';

const countArg = process.argv.find((a) => a.startsWith('--count='));
const COUNT = countArg ? Math.max(1, Math.min(25, parseInt(countArg.split('=')[1], 10))) : 10;

const SYSTEM = `You are an SEO content strategist for Money OS (free expense tracking, budgeting, and multi-client finance for freelancers, agencies, startups, small teams, and clubs). You find high-intent, low-competition blog topics that this product can rank for and that genuinely help the audience.`;

function prompt(existing) {
  return `Generate ${COUNT} NEW blog topic ideas for Money OS that are NOT in this list of existing keywords:
${existing.map((k) => `- ${k}`).join('\n')}

Favor topics with clear informational or commercial intent, realistic ranking difficulty for a new site (KD < 45), and a natural connection to expense tracking, budgeting, freelance/agency/startup finance, or taxes.

Each category must be one of: ${BLOG_CATEGORIES.join(', ')}.

Return ONLY a JSON object: {"topics": [{"title": "...", "primaryKeyword": "...", "category": "<one of the allowed>", "audience": "...", "searchVolume": <int estimate>, "difficulty": <int 1-100>, "priority": <int 1-100, higher = write sooner>}]}`;
}

async function main() {
  if (!hasApiKey()) {
    console.error('GROQ_API_KEY is not set; cannot discover topics. (The backlog still has topics to write.)');
    process.exit(1);
  }
  const { client, db } = await connect();
  try {
    const existing = (await db.collection('content_topics').find({}, { projection: { primaryKeyword: 1 } }).toArray())
      .map((d) => d.primaryKeyword);

    console.log(`Discovering ${COUNT} topics (avoiding ${existing.length} existing)...`);
    const raw = await generateStage('discover-topics', {
      system: SYSTEM, prompt: prompt(existing), maxTokens: 4000, temperature: 0.9, json: true,
    });
    const { topics } = parseJson(raw);

    let inserted = 0;
    for (const t of topics) {
      if (!t.primaryKeyword || !t.title) continue;
      const category = BLOG_CATEGORIES.includes(t.category) ? t.category : 'freelance-finance';
      const res = await db.collection('content_topics').updateOne(
        { primaryKeyword: t.primaryKeyword },
        {
          $setOnInsert: {
            title: t.title, primaryKeyword: t.primaryKeyword, category,
            audience: t.audience ?? 'General', searchVolume: t.searchVolume ?? null,
            difficulty: t.difficulty ?? null, priority: t.priority ?? 50,
            status: 'queued', source: 'discovery', created_at: new Date(),
          },
        },
        { upsert: true },
      );
      if (res.upsertedCount) inserted++;
    }
    console.log(`✓ Inserted ${inserted} new topics (duplicates skipped).`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Topic discovery failed:', err.message);
  process.exit(1);
});
