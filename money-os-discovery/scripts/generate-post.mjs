/**
 * Content Engine — automated blog post generation.
 *
 * Flow:
 *   1. Pick the highest-priority queued topic from content_topics (falls back
 *      to scripts/data/topic-backlog.json if the DB is unavailable).
 *   2. Generate a complete, quality-standard-compliant article with Groq.
 *   3. Assemble safe frontmatter + write src/content/blog/<slug>.mdx.
 *   4. Mark the topic published and record blog_posts + content_briefs rows.
 *
 * The OG/featured image is generated automatically at build time by the Visual
 * Engine — nothing to do here.
 *
 * Flags:
 *   --dry-run   Show the topic that WOULD be written; no API call, no write.
 *
 * Usage: npm run content:generate   (or  npm run content:plan  for dry-run)
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect, PROJECT_ROOT } from './lib/growth.mjs';
import { complete, parseJson, hasApiKey, getModel } from './lib/llm.mjs';
import {
  BLOG_CATEGORIES, slugify, readingTime, buildFrontmatter, writeBlogPost, blogFileExists,
} from './lib/content.mjs';

const DRY_RUN = process.argv.includes('--dry-run');

const SYSTEM = `You are the senior content writer for Money OS, a free financial command center for freelancers, agencies, startups, and small teams (expense tracking, category budgets with alerts, multi-client tagging, role-based team access, tax-ready reports). You write genuinely useful, specific, honest finance articles.

Hard rules (the content will be rejected if violated):
- NO AI-slop openers. Never start with "In today's...", "In the world of...", "When it comes to...", "Managing X can be challenging", or any generic hedge.
- Answer the question in the first two sentences, THEN expand. Inverted pyramid.
- Use concrete numbers and real, specific examples (named tools, dollar figures, percentages). No vague ranges where a number is possible.
- State clear positions and honest recommendations, including who a thing is NOT for.
- No fabricated statistics. If you cite a stat without a real source, don't include it.
- No padding transitions ("Now that we've covered..."). Let headings do the work.
- Second person ("you") for instructional content. Confident, plain, no jargon.
- Where natural, link to Money OS pages with relative URLs: /use-cases/expense-tracker-freelancers, /use-cases/freelancers, /use-cases/agencies, /use-cases/startups, /docs/budgets, /docs/managing-transactions, /blog/what-is-burn-rate, /blog/freelancer-expense-categories. Only link when relevant.
- Add a brief disclaimer line at the end for any tax/financial-advice content.
- Do NOT include an H1 (the page renders the title). Start the body with the opening paragraph. Use ## for sections.
- End the body with a "## FAQ" section using ### for each question.`;

function userPrompt(topic) {
  return `Write a complete blog post for this topic.

Title: ${topic.title}
Primary keyword: ${topic.primaryKeyword}
Audience: ${topic.audience}
Category (must be exactly this): ${topic.category}

Return ONLY a JSON object with these keys:
{
  "title": "final SEO title, <= 65 chars, naturally includes the keyword",
  "description": "meta description, <= 155 chars, includes keyword, has a benefit",
  "keywords": ["5-7 relevant keyword phrases including the primary keyword"],
  "faq": [{"question": "...", "answer": "2-4 sentence direct answer"}, ... 3 to 5 items],
  "body_markdown": "the full article in Markdown, 1000-1800 words, starting with the opening paragraph (no H1), using ## sections, ending with a '## FAQ' section whose questions match the faq array"
}

The faq array and the FAQ section in body_markdown must contain the same questions and answers.`;
}

async function pickTopicFromDb(db) {
  const topic = await db
    .collection('content_topics')
    .find({ status: 'queued' })
    .sort({ priority: -1 })
    .limit(10)
    .toArray();
  // Skip any whose slug already exists as a file (defensive).
  for (const t of topic) {
    if (!blogFileExists(slugify(t.title))) return t;
  }
  return null;
}

function pickTopicFromBacklog() {
  const file = path.join(PROJECT_ROOT, 'scripts', 'data', 'topic-backlog.json');
  const backlog = JSON.parse(fs.readFileSync(file, 'utf8')).sort((a, b) => b.priority - a.priority);
  return backlog.find((t) => !blogFileExists(slugify(t.title))) ?? null;
}

async function main() {
  let client = null;
  let db = null;
  try {
    ({ client, db } = await connect());
  } catch (e) {
    console.warn(`! Growth DB unavailable (${e.message}); using local backlog.`);
  }

  const topic = db ? (await pickTopicFromDb(db)) ?? pickTopicFromBacklog() : pickTopicFromBacklog();

  if (!topic) {
    console.log('No queued topics left to write. Add more to content_topics / topic-backlog.json.');
    if (client) await client.close();
    return;
  }

  console.log(`Topic: "${topic.title}"  [${topic.category}, kw: ${topic.primaryKeyword}]`);

  if (DRY_RUN) {
    console.log('Dry run — no article generated. This is the topic that would be written next.');
    if (client) await client.close();
    return;
  }

  if (!hasApiKey()) {
    console.error('GROQ_API_KEY is not set. Set it to generate articles (or use --dry-run).');
    if (client) await client.close();
    process.exit(1);
  }

  console.log(`Generating article with Groq (${getModel()})...`);
  const raw = await complete({ system: SYSTEM, prompt: userPrompt(topic), maxTokens: 6000, temperature: 0.7, json: true });
  const post = parseJson(raw);

  // Validate + normalize.
  const category = BLOG_CATEGORIES.includes(topic.category) ? topic.category : 'freelance-finance';
  const slug = slugify(post.title || topic.title);
  if (blogFileExists(slug)) {
    console.error(`A post with slug "${slug}" already exists. Aborting to avoid overwrite.`);
    if (client) await client.close();
    process.exit(1);
  }
  const body = String(post.body_markdown || '').trim();
  if (body.length < 400) throw new Error('Generated body is too short; aborting.');

  const frontmatter = buildFrontmatter({
    title: post.title || topic.title,
    description: String(post.description || '').slice(0, 200),
    keywords: Array.isArray(post.keywords) ? post.keywords.slice(0, 8) : [topic.primaryKeyword],
    category,
    author: 'Money OS Team',
    publishDate: new Date(),
    status: 'published',
    readingTime: readingTime(body),
    faq: Array.isArray(post.faq) ? post.faq : undefined,
  });

  const file = writeBlogPost(slug, frontmatter, body);
  console.log(`✓ Wrote ${path.relative(PROJECT_ROOT, file)}  (${readingTime(body)} min read)`);

  // Update the Growth DB.
  if (db) {
    const now = new Date();
    await db.collection('content_topics').updateOne(
      { primaryKeyword: topic.primaryKeyword },
      { $set: { status: 'published', slug, published_at: now } },
    );
    await db.collection('blog_posts').updateOne(
      { slug },
      { $set: { slug, title: post.title || topic.title, category, primaryKeyword: topic.primaryKeyword, status: 'published', published_at: now, source: 'content-engine' }, $setOnInsert: { created_at: now } },
      { upsert: true },
    );
    await db.collection('content_briefs').insertOne({
      slug, title: post.title || topic.title, keyword: topic.primaryKeyword,
      category, faq: post.faq ?? [], generated_at: now, model: getModel(),
    });
    console.log('✓ Growth DB updated (topic published, blog_posts + content_briefs recorded).');
  }

  if (client) await client.close();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Generation failed:', err.message);
  process.exit(1);
});
