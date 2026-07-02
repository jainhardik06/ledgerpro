/**
 * Content helpers shared by the generation scripts: slugify, safe YAML
 * frontmatter assembly, reading-time, and MDX file writing.
 *
 * We assemble frontmatter ourselves (rather than trusting the model to emit
 * valid YAML) so a malformed quote can never break the Astro build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT } from './growth.mjs';

export const BLOG_DIR = path.join(PROJECT_ROOT, 'src', 'content', 'blog');

export const BLOG_CATEGORIES = [
  'expense-tracking',
  'budgeting',
  'freelance-finance',
  'agency-finance',
  'startup-finance',
  'tax-tips',
  'product-updates',
  'tools-and-resources',
];

export function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[''"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function readingTime(markdown) {
  const words = markdown.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 220));
}

/** YAML-escape a scalar string (double-quoted form). */
function yamlStr(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Build a frontmatter block from a plain object. Supports string, number,
 * boolean, string[] and an faq array of {question, answer}.
 */
export function buildFrontmatter(data) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    if (key === 'faq' && Array.isArray(value)) {
      lines.push('faq:');
      for (const item of value) {
        lines.push(`  - question: ${yamlStr(item.question)}`);
        lines.push(`    answer: ${yamlStr(item.answer)}`);
      }
      continue;
    }
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map(yamlStr).join(', ')}]`);
      continue;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      lines.push(`${key}: ${value}`);
      continue;
    }
    // Dates as YYYY-MM-DD (unquoted so Astro's zod date coercion works).
    if (value instanceof Date) {
      lines.push(`${key}: ${value.toISOString().slice(0, 10)}`);
      continue;
    }
    lines.push(`${key}: ${yamlStr(value)}`);
  }
  lines.push('---');
  return lines.join('\n');
}

export function blogFileExists(slug) {
  return fs.existsSync(path.join(BLOG_DIR, `${slug}.mdx`));
}

export function writeBlogPost(slug, frontmatter, body) {
  fs.mkdirSync(BLOG_DIR, { recursive: true });
  const file = path.join(BLOG_DIR, `${slug}.mdx`);
  fs.writeFileSync(file, `${frontmatter}\n\n${body.trim()}\n`, 'utf8');
  return file;
}
