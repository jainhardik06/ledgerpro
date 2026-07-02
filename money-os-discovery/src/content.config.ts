import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Reusable schema for SEO and Discovery content
const baseContentSchema = z.object({
  title: z.string().max(100, "Title must be 100 characters or less."),
  description: z.string().max(200, "Description should be concise for SEO."),
  keywords: z.array(z.string()).optional(),
  category: z.string().optional(),
  author: z.string().default('Money OS Team'),
  publishDate: z.date(),
  updatedDate: z.date().optional(),
  status: z.enum(['draft', 'scheduled', 'published']).default('draft'),
  
  // Future proofing for AI structured data
  faq: z.array(
    z.object({
      question: z.string(),
      answer: z.string(),
    })
  ).optional(),
  
  // Explicit JSON-LD schema injection payload
  schema: z.record(z.string(), z.any()).optional(),
});

// 1. Documentation Collection
const docsCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/docs" }),
  schema: baseContentSchema.extend({
    sidebarPosition: z.number().optional(),
    relatedPages: z.array(z.string()).optional(),
  }),
});

// 2. Blog Collection
const blogCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }),
  schema: baseContentSchema.extend({
    coverImage: z.string().optional(),
    readingTime: z.number().optional(),
  }),
});

// 3. Changelog Collection
const changelogCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/changelog" }),
  schema: baseContentSchema.extend({
    version: z.string().optional(),
    features: z.array(z.string()).optional(),
    fixes: z.array(z.string()).optional(),
  }),
});

// 4. Comparisons Collection (e.g. Money OS vs X)
const comparisonsCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/comparisons" }),
  schema: baseContentSchema.extend({
    competitorName: z.string(),
    competitorLogo: z.string().optional(),
    winner: z.enum(['money-os', 'competitor', 'tie']).default('money-os'),
    featureMatrix: z.array(
      z.object({
        feature: z.string(),
        moneyOsHas: z.boolean(),
        competitorHas: z.boolean(),
        notes: z.string().optional()
      })
    ).optional(),
  }),
});

// Note: Use-case pages are implemented as standalone routes in
// src/pages/use-cases/*.astro (driven by src/data/use-cases.ts), not as an MDX
// collection — so there is no `use-cases` content collection here.

// 5. Resources Collection (tools, templates, calculators, guides)
const resourcesCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/resources" }),
  schema: baseContentSchema.extend({
    resourceType: z.enum(['tool', 'template', 'calculator', 'guide', 'checklist']),
    downloadUrl: z.string().optional(),
    externalUrl: z.string().optional(),
    isFree: z.boolean().default(true),
    tags: z.array(z.string()).optional(),
  }),
});

export const collections = {
  docs: docsCollection,
  blog: blogCollection,
  changelog: changelogCollection,
  comparisons: comparisonsCollection,
  resources: resourcesCollection,
};
