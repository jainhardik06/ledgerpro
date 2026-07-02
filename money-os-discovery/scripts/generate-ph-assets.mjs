/**
 * Product Hunt asset generator — Visual Engine, reused for launch collateral.
 *
 * Produces the assets that are legitimately generateable from the brand
 * system alone (thumbnail, logo variants): pure brand marks, not screenshots
 * of the product. Renders with the exact same Satori + resvg pipeline as the
 * OG image engine (src/lib/og.ts) for pixel-perfect brand consistency.
 *
 * Deliberately does NOT produce the 4 PH gallery images. Those must be real
 * screenshots of the running, authenticated product with realistic data
 * (per docs/growthdocs/PRODUCT_HUNT_LAUNCH_KIT.md: "Real product
 * screenshots — not mockups"). No browser automation tool was available in
 * this environment to capture them, so they're a manual follow-up — see
 * OPERATIONS.md.
 *
 * Usage: node scripts/generate-ph-assets.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { PROJECT_ROOT, connect } from './lib/growth.mjs';

const FONT_DIR = path.join(PROJECT_ROOT, 'src', 'assets', 'fonts');
const OUT_DIR = path.join(PROJECT_ROOT, 'public', 'product-hunt');

function font(file) {
  return fs.readFileSync(path.join(FONT_DIR, file));
}

const fonts = [
  { name: 'Geist', data: font('Geist-Regular.ttf'), weight: 400, style: 'normal' },
  { name: 'Geist', data: font('Geist-SemiBold.ttf'), weight: 600, style: 'normal' },
  { name: 'Geist', data: font('Geist-Bold.ttf'), weight: 700, style: 'normal' },
];

function el(type, style, children) {
  return { type, props: { style, ...(children !== undefined ? { children } : {}) } };
}

// The real Money OS brand mark — same paths as BrandMark.astro / the root
// product's BrandMark.tsx.
function brandMarkSvg(size, color) {
  return {
    type: 'svg',
    props: {
      width: size,
      height: size,
      viewBox: '0 0 32 32',
      fill: 'none',
      style: { display: 'flex' },
      children: [
        { type: 'path', props: { d: 'M 6 11 L 16 21 L 26 11', stroke: color, strokeWidth: 3.2, strokeLinecap: 'round', strokeLinejoin: 'round' } },
        { type: 'path', props: { d: 'M 6 21 L 16 11 L 26 21', stroke: color, strokeWidth: 3.2, strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.5 } },
      ],
    },
  };
}

async function renderPng(tree, width, height) {
  const svg = await satori(tree, { width, height, fonts });
  return Resvg ? new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng() : null;
}

/** 240x240 PH thumbnail: brand mark + wordmark, per PRODUCT_HUNT_LAUNCH_KIT.md spec. */
async function generateThumbnail() {
  const tree = el(
    'div',
    {
      width: '240px', height: '240px', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000', gap: '18px',
    },
    [
      el('div', { display: 'flex', width: '96px', height: '96px', alignItems: 'center', justifyContent: 'center' }, brandMarkSvg(72, '#ffffff')),
      el('div', { display: 'flex', color: '#ededed', fontFamily: 'Geist', fontWeight: 700, fontSize: '26px', letterSpacing: '-0.5px' }, 'Money OS'),
    ]
  );
  return renderPng(tree, 240, 240);
}

/** Square logo variant on black, for avatars/profile photos (400x400). */
async function generateLogoSquare(size, bg, fg) {
  const tree = el(
    'div',
    { width: `${size}px`, height: `${size}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: bg },
    brandMarkSvg(Math.round(size * 0.45), fg)
  );
  return renderPng(tree, size, size);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('Generating Product Hunt thumbnail (240x240)...');
  const thumb = await generateThumbnail();
  fs.writeFileSync(path.join(OUT_DIR, 'thumbnail-240.png'), thumb);
  console.log(`  ✓ ${path.relative(PROJECT_ROOT, path.join(OUT_DIR, 'thumbnail-240.png'))}`);

  console.log('Generating logo variants...');
  const variants = [
    { file: 'logo-square-black-400.png', size: 400, bg: '#000000', fg: '#ffffff' },
    { file: 'logo-square-white-400.png', size: 400, bg: '#ffffff', fg: '#000000' },
    { file: 'logo-square-black-512.png', size: 512, bg: '#000000', fg: '#ffffff' },
  ];
  for (const v of variants) {
    const png = await generateLogoSquare(v.size, v.bg, v.fg);
    fs.writeFileSync(path.join(OUT_DIR, v.file), png);
    console.log(`  ✓ ${path.relative(PROJECT_ROOT, path.join(OUT_DIR, v.file))}`);
  }

  // Record what's genuinely ready vs what's still a manual follow-up, so the
  // Discovery dashboard's Product Hunt section reflects reality.
  try {
    const { client, db } = await connect();
    const now = new Date();
    await db.collection('product_hunt_assets').deleteMany({ source: 'generate-ph-assets' });
    await db.collection('product_hunt_assets').insertMany([
      { name: 'Thumbnail (240x240)', type: 'thumbnail', status: 'ready', path: '/product-hunt/thumbnail-240.png', source: 'generate-ph-assets', created_at: now },
      { name: 'Logo square black 400', type: 'logo', status: 'ready', path: '/product-hunt/logo-square-black-400.png', source: 'generate-ph-assets', created_at: now },
      { name: 'Logo square white 400', type: 'logo', status: 'ready', path: '/product-hunt/logo-square-white-400.png', source: 'generate-ph-assets', created_at: now },
      { name: 'Logo square black 512', type: 'logo', status: 'ready', path: '/product-hunt/logo-square-black-512.png', source: 'generate-ph-assets', created_at: now },
      { name: 'Gallery 1 — Dashboard view', type: 'gallery', status: 'needs-manual-screenshot', path: null, source: 'generate-ph-assets', created_at: now },
      { name: 'Gallery 2 — Transactions view', type: 'gallery', status: 'needs-manual-screenshot', path: null, source: 'generate-ph-assets', created_at: now },
      { name: 'Gallery 3 — Reports view', type: 'gallery', status: 'needs-manual-screenshot', path: null, source: 'generate-ph-assets', created_at: now },
      { name: 'Gallery 4 — Budget view', type: 'gallery', status: 'needs-manual-screenshot', path: null, source: 'generate-ph-assets', created_at: now },
    ]);
    console.log('✓ Growth DB updated (product_hunt_assets): 4 ready, 4 need a manual screenshot pass.');
    await client.close();
  } catch (e) {
    console.warn(`! Growth DB unavailable (${e.message}) — assets generated locally but not recorded.`);
  }

  console.log('\nDone. Gallery images (dashboard/transactions/reports/budget) still need real');
  console.log('screenshots of the live authenticated app — see OPERATIONS.md.');
}

main().catch((err) => {
  console.error('PH asset generation failed:', err.message);
  process.exit(1);
});
