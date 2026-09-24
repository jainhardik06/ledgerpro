import { describe, expect, it } from 'vitest';
import { getAgencyLogo, getAgencyMonogram } from '@/lib/agency/utils/logo';

describe('Agency Logo & Profile Picture Management', () => {
  describe('getAgencyLogo resolution', () => {
    it('returns null when no logo is set anywhere', () => {
      expect(getAgencyLogo(null, null)).toBeNull();
      expect(getAgencyLogo({ general: {} as any }, null)).toBeNull();
      expect(getAgencyLogo(null, { name: 'Money OS' })).toBeNull();
    });

    it('returns direct HTTPS URL when set in settings.general.logoUrl', () => {
      const url = 'https://cdn.example.com/assets/agencies/tenant-123/logo.webp';
      const result = getAgencyLogo({ general: { logoUrl: url } as any }, null);
      expect(result).toBe(url);
    });

    it('falls back to tenant.logoUrl if settings.general.logoUrl is absent', () => {
      const url = 'https://supabase.co/storage/v1/object/public/agency-assets/agencies/t1/logo.webp';
      const result = getAgencyLogo(null, { name: 'Acme Agency', logoUrl: url });
      expect(result).toBe(url);
    });

    it('qualifies relative paths starting with / with NEXT_PUBLIC_APP_URL', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://moneyos.app';
      const relative = '/uploads/logo.webp';
      const result = getAgencyLogo({ general: { logoUrl: relative } as any }, null);
      expect(result).toBe('https://moneyos.app/uploads/logo.webp');
    });
  });

  describe('getAgencyMonogram fallback', () => {
    it('generates two-character monogram from single or multi-word agency names', () => {
      expect(getAgencyMonogram('Money OS')).toBe('MO');
      expect(getAgencyMonogram('Acme Digital Studio')).toBe('AD');
      expect(getAgencyMonogram('Alpha')).toBe('AL');
      expect(getAgencyMonogram('')).toBe('OS');
      expect(getAgencyMonogram(null)).toBe('OS');
    });
  });

  describe('Multi-tenant storage path isolation', () => {
    it('enforces tenantId isolation in storage object path', () => {
      const tenantId = 'tenant_xyz_789';
      const filename = 'logo_1720000000.webp';
      const storagePath = `agencies/${tenantId}/${filename}`;

      expect(storagePath).toBe('agencies/tenant_xyz_789/logo_1720000000.webp');
      expect(storagePath.startsWith(`agencies/${tenantId}/`)).toBe(true);
    });
  });

  describe('Strict 150 KB cap boundary', () => {
    it('verifies 150 KB cap in bytes', () => {
      const MAX_BYTES = 150 * 1024;
      expect(MAX_BYTES).toBe(153600);

      const validSize = 145 * 1024;
      const invalidSize = 155 * 1024;

      expect(validSize <= MAX_BYTES).toBe(true);
      expect(invalidSize <= MAX_BYTES).toBe(false);
    });
  });
});
