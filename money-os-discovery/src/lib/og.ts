/**
 * Visual Engine — programmatic Open Graph / featured image generation.
 *
 * Renders branded 1200×630 PNG cards at BUILD TIME with Satori (HTML/CSS → SVG)
 * + resvg (SVG → PNG). No external API, no runtime compute, no per-image cost —
 * which is exactly what the free-tier + scale constraint requires. Every page
 * and every blog post gets a unique, on-brand social card automatically.
 */
import fs from 'node:fs';
import path from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const FONT_DIR = path.resolve(process.cwd(), 'src/assets/fonts');

function font(file: string) {
  return fs.readFileSync(path.join(FONT_DIR, file));
}

// Loaded once per build. Geist is the Money OS brand typeface (matches the
// main product), so social cards read as the same company.
const fonts = [
  { name: 'Geist', data: font('Geist-Regular.ttf'), weight: 400 as const, style: 'normal' as const },
  { name: 'Geist', data: font('Geist-SemiBold.ttf'), weight: 600 as const, style: 'normal' as const },
  { name: 'Geist', data: font('Geist-Bold.ttf'), weight: 700 as const, style: 'normal' as const },
];

export interface OgOptions {
  /** Large headline. */
  title: string;
  /** Small uppercase label above the title (e.g. "Documentation", "Blog"). */
  eyebrow?: string;
  /** Bottom-left context line. Defaults to the product domain. */
  footer?: string;
}

/** Satori uses a React-element-shaped object tree; we build it without JSX. */
function el(type: string, style: Record<string, unknown>, children?: unknown): any {
  return { type, props: { style, ...(children !== undefined ? { children } : {}) } };
}

export async function renderOgImage({
  title,
  eyebrow = 'Money OS',
  footer = 'discover.moneyos.webasthetic.in',
}: OgOptions): Promise<Buffer> {
  // Keep the headline from overflowing the card.
  const headline = title.length > 90 ? title.slice(0, 87).trimEnd() + '…' : title;

  const tree = el(
    'div',
    {
      width: '1200px',
      height: '630px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      backgroundColor: '#000000',
      padding: '72px',
      fontFamily: 'Geist',
      // Subtle top hairline accent, consistent with the site's border language.
      borderTop: '6px solid #ffffff',
    },
    [
      // Top row: logo lockup + eyebrow
      el(
        'div',
        { display: 'flex', alignItems: 'center', gap: '16px' },
        [
          el(
            'div',
            {
              width: '44px',
              height: '44px',
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#000000',
              fontSize: '26px',
              fontWeight: 700,
            },
            'M'
          ),
          el(
            'div',
            { color: '#a3a3a3', fontSize: '24px', fontWeight: 600, letterSpacing: '-0.5px' },
            'Money OS'
          ),
          eyebrow && eyebrow !== 'Money OS'
            ? el(
                'div',
                {
                  marginLeft: '8px',
                  padding: '6px 14px',
                  border: '1px solid #262626',
                  borderRadius: '999px',
                  color: '#737373',
                  fontSize: '18px',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                },
                eyebrow
              )
            : '',
        ]
      ),

      // Headline
      el(
        'div',
        {
          display: 'flex',
          color: '#f5f5f5',
          fontSize: headline.length > 55 ? '60px' : '72px',
          fontWeight: 700,
          lineHeight: 1.08,
          letterSpacing: '-2px',
          maxWidth: '1000px',
        },
        headline
      ),

      // Footer
      el(
        'div',
        { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
        [
          el('div', { color: '#525252', fontSize: '22px', fontWeight: 500 }, footer),
          el('div', { color: '#525252', fontSize: '22px', fontWeight: 500 }, 'Free · No credit card'),
        ]
      ),
    ]
  );

  const svg = await satori(tree, { width: 1200, height: 630, fonts });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } })
    .render()
    .asPng();
  return Buffer.from(png);
}
