import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Module 1.26 test matrix — vitest configuration.
 *
 * Unit tests (tests/unit) cover the pure domain layer: metric owners,
 * profitability engine, health engine, receivable aging.
 * Integration tests (tests/integration) cover the dashboard query service,
 * date filtering, the Module 1.18 authorization chain (with @/lib/auth and
 * @/lib/db mocked), aggregation correctness, tenant-isolation security, and
 * the Module 1.27 cross-vertical regression.
 *
 * HTTP-level E2E (login → agency tenant → dashboard) lives in the existing
 * Bruno suite (tests/bruno) — see `npm run test:api`.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
  },
});
