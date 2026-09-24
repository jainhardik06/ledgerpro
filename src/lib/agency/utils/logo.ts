import type { AgencySettings, PublicAgencySettings } from '../types/agency-settings';
import type { Tenant } from '@/lib/db';

/**
 * Resolves an agency logo URL safely across components, ensuring fully-qualified
 * URL format for automated PDF render engines (puppeteer, react-pdf, html2canvas)
 * without broken image exceptions.
 *
 * @param settings Public or internal agency settings (optional)
 * @param tenant Tenant object with agencySettings or direct logoUrl (optional)
 * @returns Fully qualified logo URL or null if unset
 */
export function getAgencyLogo(
  settings?: Pick<PublicAgencySettings, 'general'> | AgencySettings | null,
  tenant?: (Pick<Tenant, 'agencySettings' | 'name'> & { logoUrl?: string }) | null
): string | null {
  const candidate =
    settings?.general?.logoUrl ||
    tenant?.agencySettings?.general?.logoUrl ||
    tenant?.logoUrl;

  if (!candidate || typeof candidate !== 'string') {
    return null;
  }

  const trimmed = candidate.trim();
  if (!trimmed) {
    return null;
  }

  // If already absolute (http / https), return directly
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // If relative path starting with '/', resolve with NEXT_PUBLIC_APP_URL or window.location
  if (trimmed.startsWith('/')) {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (typeof window !== 'undefined' ? window.location.origin : '');

    if (baseUrl) {
      return `${baseUrl.replace(/\/+$/, '')}${trimmed}`;
    }
  }

  return trimmed;
}

/**
 * Derives a clean agency initial or monogram for fallback avatar displays.
 */
export function getAgencyMonogram(name?: string | null): string {
  if (!name || !name.trim()) return 'OS';
  const clean = name.trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return clean.substring(0, 2).toUpperCase();
}
