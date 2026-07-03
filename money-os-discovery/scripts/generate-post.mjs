/**
 * Content Engine — automated blog post generation.
 *
 * Flow:
 *   1. Pick the highest-priority queued topic from content_topics (falls back
 *      to scripts/data/topic-backlog.json if the DB is unavailable).
 *   2. Generate the article in SEVERAL SMALL Groq calls — plan, intro, one
 *      call per section, then FAQ answers — instead of one big call. Each
 *      call is paced and retried against Groq's free-tier rate limits (see
 *      scripts/lib/rate-limit.mjs). A single post takes a few minutes this
 *      way; that's fine, we publish one every ~3 days.
 *   3. Assemble safe frontmatter + write src/content/blog/<slug>.mdx.
 *   4. Mark the topic published and record blog_posts + content_briefs rows.
 *
 * The OG/featured image is generated automatically at build time by the Visual
 * Engine — nothing to do here.
 *
 * Flags:
 *   --dry-run   Show the topic that WOULD be written; no API calls, no write.
 *
 * Usage: npm run content:generate   (or  npm run content:plan  for dry-run)
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect, PROJECT_ROOT } from './lib/growth.mjs';
import { parseJson, hasApiKey, getModel } from './lib/llm.mjs';
import { generateStage } from './lib/rate-limit.mjs';
import { submitUrls } from './lib/indexnow.mjs';
import {
  BLOG_CATEGORIES, slugify, readingTime, buildFrontmatter, writeBlogPost, blogFileExists, normalizeTypography,
} from './lib/content.mjs';

const DRY_RUN = process.argv.includes('--dry-run');

// Shared house style, prepended to every stage call so each small call still
// produces on-brand, anti-slop, specific writing.
const HOUSE_STYLE = `You are the senior content writer for Money OS, a free financial command center for freelancers, agencies, startups, and small teams (expense tracking, category budgets with alerts, multi-client tagging, role-based team access, tax-ready reports).

Hard rules (content violating these will be rejected):
- NO AI-slop openers. Never start with "In today's...", "In the world of...", "When it comes to...", "Managing X can be challenging", or any generic hedge.
- Answer the question in the first two sentences, THEN expand. Inverted pyramid.
- Use concrete numbers and real, specific examples (named tools, dollar figures, percentages). No vague ranges where a number is possible.
- State clear positions and honest recommendations, including who a thing is NOT for.
- No fabricated statistics. If you cite a stat without a real source, don't include it.
- No padding transitions ("Now that we've covered..."). Let headings do the work.
- Second person ("you") for instructional content. Confident, plain, no jargon.
- Where natural, link to Money OS pages using FULL markdown link syntax [link text](/path) — NEVER bare brackets like [/docs/budgets] with no parenthesized URL. Valid paths: /use-cases/expense-tracker-freelancers, /use-cases/freelancers, /use-cases/agencies, /use-cases/startups, /docs/budgets, /docs/managing-transactions, /blog/what-is-burn-rate, /blog/freelancer-expense-categories. Only link when relevant, at most 2-3 links total across the whole article.
- Use plain ASCII punctuation: a regular hyphen "-", not "‑" (non-breaking hyphen) or em/en dashes. Use straight quotes ' and ", not curly quotes.`;

function planPrompt(topic) {
  return `Plan a blog post for this topic. Do not write the article yet.

Title: ${topic.title}
Primary keyword: ${topic.primaryKeyword}
Audience: ${topic.audience}
Category (must be exactly this): ${topic.category}

Return ONLY a JSON object:
{
  "title": "final SEO title, <= 65 chars, naturally includes the keyword",
  "description": "meta description, <= 155 chars, includes keyword, has a benefit",
  "keywords": ["5-7 relevant keyword phrases including the primary keyword"],
  "sections": ["3 to 5 H2 section headings that fully answer the topic, in order"],
  "faqQuestions": ["3 to 5 FAQ questions a reader would actually ask, distinct from the section headings"]
}`;
}

function introPrompt(plan) {
  return `Write ONLY the opening paragraph (100-180 words, no heading) for this article. It must answer the core question in the first two sentences per house style.

Title: ${plan.title}
Full section list (for context, do not repeat their content): ${plan.sections.join(' / ')}

Return plain markdown text only — no JSON, no heading, just the paragraph(s).`;
}

function sectionPrompt(plan, sectionHeading, sectionIndex) {
  return `Write ONLY the body content for ONE section of this article (200-350 words). Do not repeat the H2 heading itself — just the content that goes under it. Do not restate the intro.

Article title: ${plan.title}
This section's heading: "${sectionHeading}" (section ${sectionIndex + 1} of ${plan.sections.length})
All section headings in the article (for context, so you don't repeat other sections' content): ${plan.sections.join(' / ')}

Return plain markdown text only — no JSON, no H2 heading line, just the section body (paragraphs, and a short list or table if genuinely useful).`;
}

function faqPrompt(plan) {
  return `Write direct 2-4 sentence answers for each of these FAQ questions about "${plan.title}".

Questions:
${plan.faqQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Return ONLY a JSON object: {"faq": [{"question": "...", "answer": "..."}, ...]} with one entry per question above, in the same order.`;
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

/** Generate the full article as a sequence of small, paced, retried calls. */
async function generateArticle(topic) {
  console.log(`Stage 1/4: planning...`);
  const planRaw = await generateStage('plan', {
    system: HOUSE_STYLE, prompt: planPrompt(topic), maxTokens: 900, temperature: 0.6, json: true,
  });
  const plan = parseJson(planRaw);
  if (!Array.isArray(plan.sections) || plan.sections.length < 2) {
    throw new Error('Plan stage returned too few sections; aborting.');
  }
  if (!Array.isArray(plan.faqQuestions) || plan.faqQuestions.length < 1) {
    plan.faqQuestions = [`What is ${topic.primaryKeyword}?`];
  }
  console.log(`  -> "${plan.title}" — ${plan.sections.length} sections, ${plan.faqQuestions.length} FAQs`);

  console.log(`Stage 2/4: writing intro...`);
  const intro = await generateStage('intro', {
    system: HOUSE_STYLE, prompt: introPrompt(plan), maxTokens: 550, temperature: 0.7,
  });

  console.log(`Stage 3/4: writing ${plan.sections.length} sections (paced, one at a time)...`);
  const sectionBodies = [];
  for (let i = 0; i < plan.sections.length; i++) {
    const heading = plan.sections[i];
    console.log(`  - section ${i + 1}/${plan.sections.length}: "${heading}"`);
    const body = await generateStage(`section-${i + 1}`, {
      system: HOUSE_STYLE, prompt: sectionPrompt(plan, heading, i), maxTokens: 900, temperature: 0.7,
    });
    sectionBodies.push({ heading, body: body.trim() });
  }

  console.log(`Stage 4/4: writing FAQ answers...`);
  const faqRaw = await generateStage('faq', {
    system: HOUSE_STYLE, prompt: faqPrompt(plan), maxTokens: 1300, temperature: 0.6, json: true,
  });
  const { faq } = parseJson(faqRaw);

  // Assemble the final markdown from the pieces.
  const parts = [intro.trim(), ''];
  for (const s of sectionBodies) {
    parts.push(`## ${s.heading}`, '', s.body, '');
  }
  parts.push('## FAQ', '');
  for (const item of faq) {
    parts.push(`### ${item.question}`, '', item.answer, '');
  }
  const body_markdown = normalizeTypography(parts.join('\n').trim());
  const normalizedFaq = faq.map((item) => ({
    question: normalizeTypography(item.question),
    answer: normalizeTypography(item.answer),
  }));

  return {
    title: normalizeTypography(plan.title),
    description: normalizeTypography(plan.description),
    keywords: plan.keywords,
    faq: normalizedFaq,
    body_markdown,
  };
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

  console.log(`Generating article (starting with ${getModel()}, rotates through the key pool on rate limits) — paced, ~2-4 minutes...`);
  const startedAt = Date.now();
  const post = await generateArticle(topic);
  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  console.log(`Generation complete in ${elapsedSec}s.`);

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

  const publishedUrl = `${(process.env.PUBLIC_SITE_URL || 'https://discover.moneyos.webasthetic.in').replace(/\/$/, '')}/blog/${slug}`;
  const indexResult = await submitUrls([publishedUrl]);
  console.log(
    indexResult.ok
      ? `✓ IndexNow: notified Bing/Yandex of ${publishedUrl}`
      : `! IndexNow: submission skipped or failed (non-fatal) — ${indexResult.error ?? indexResult.status ?? 'unknown'}`
  );

  if (client) await client.close();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Generation failed:', err.message);
  process.exit(1);
});
