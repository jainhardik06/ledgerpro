// @ts-check
import { defineConfig } from 'astro/config';

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  // Canonical production URL — drives sitemap, RSS, canonical tags, OG image URLs.
  site: 'https://discovermoneyos.webasthetic.in',

  // Static-first (SSG). Individual routes opt into on-demand rendering with
  // `export const prerender = false` (currently only the affiliate redirect).
  output: 'static',
  adapter: vercel(),

  integrations: [
    mdx(),
    sitemap({
      // Surface human pages; exclude machine/utility routes from the sitemap.
      filter: (page) => !page.includes('/go/'),
      changefreq: 'weekly',
      priority: 0.7,
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
  },
});
