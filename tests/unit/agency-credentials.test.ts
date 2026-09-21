/**
 * Module 17 (Sprint 17C / §49–§51) — Unit: the AES-256-GCM credential layer.
 *
 * Pure crypto tests (node:crypto + env only — no db, no React). Pins:
 *   - round-trip: encrypt → decrypt returns the exact plaintext
 *   - fail-closed: no/malformed AGENCY_MASTER_KEY ⇒ encryptSecret null and
 *     decryptSecret null — never a plaintext write, never a wrong plaintext
 *   - tamper: a flipped ciphertext OR auth-tag character ⇒ null (AES-GCM —
 *     authenticated encryption)
 *   - wrong master key ⇒ null (the tag fails under a different key)
 *   - format: 'v1:<iv>:<tag>:<ct>' — versioned, 4 parts, and the plaintext
 *     never appears in the stored form
 *   - fresh IV per encryption: identical plaintexts encrypt differently
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  encryptSecret, decryptSecret, hasMasterKey, MASKED_SECRET,
} from '@/lib/agency/security/credentials';

const KEY_A = Buffer.alloc(32, 0x61).toString('base64'); // 'aaaa…' ×32
const KEY_B = Buffer.alloc(32, 0x62).toString('base64'); // 'bbbb…' ×32
const SHORT_KEY = Buffer.alloc(31, 0x61).toString('base64'); // 31 bytes — malformed

let savedKey: string | undefined;

beforeEach(() => {
  savedKey = process.env.AGENCY_MASTER_KEY;
});

afterEach(() => {
  if (savedKey === undefined) delete process.env.AGENCY_MASTER_KEY;
  else process.env.AGENCY_MASTER_KEY = savedKey;
});

describe('Module 17 §49 — master key resolution (fail closed)', () => {
  it('no key configured ⇒ hasMasterKey false, encrypt null, decrypt null', () => {
    delete process.env.AGENCY_MASTER_KEY;
    expect(hasMasterKey()).toBe(false);
    expect(encryptSecret('plaintext')).toBeNull();
    expect(decryptSecret('v1:aaaa:bbbb:cccc')).toBeNull();
  });

  it('blank / malformed / wrong-length keys are treated as absent', () => {
    process.env.AGENCY_MASTER_KEY = '   ';
    expect(hasMasterKey()).toBe(false);
    process.env.AGENCY_MASTER_KEY = 'not-base64-!!!';
    expect(hasMasterKey()).toBe(false);
    process.env.AGENCY_MASTER_KEY = SHORT_KEY;
    expect(hasMasterKey()).toBe(false);
    expect(encryptSecret('plaintext')).toBeNull();
  });

  it('a valid 32-byte base64 key arms the layer', () => {
    process.env.AGENCY_MASTER_KEY = KEY_A;
    expect(hasMasterKey()).toBe(true);
  });
});

describe('Module 17 §49 — AES-256-GCM round-trip', () => {
  it('encrypt → decrypt returns the exact plaintext', () => {
    process.env.AGENCY_MASTER_KEY = KEY_A;
    const ct = encryptSecret('rzp_live_secret_key_value');
    expect(ct).not.toBeNull();
    expect(decryptSecret(ct!)).toBe('rzp_live_secret_key_value');
  });

  it('round-trips arbitrary bytes (whitespace, unicode, long values)', () => {
    process.env.AGENCY_MASTER_KEY = KEY_A;
    for (const plain of [' whsec_ with spaces ', 'whsec_पैसा💰', 'x'.repeat(500), '\n\t"quoted"']) {
      const ct = encryptSecret(plain);
      expect(ct).not.toBeNull();
      expect(decryptSecret(ct!)).toBe(plain);
    }
  });

  it('ciphertext is versioned 4-part v1 format and carries no plaintext', () => {
    process.env.AGENCY_MASTER_KEY = KEY_A;
    const plain = 'super-secret-value-123';
    const ct = encryptSecret(plain)!;
    expect(ct).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(ct.startsWith('v1:')).toBe(true);
    expect(ct.split(':')).toHaveLength(4);
    expect(ct).not.toContain(plain);
  });

  it('uses a fresh IV per encryption — identical plaintexts differ at rest', () => {
    process.env.AGENCY_MASTER_KEY = KEY_A;
    const a = encryptSecret('same-plaintext')!;
    const b = encryptSecret('same-plaintext')!;
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('same-plaintext');
    expect(decryptSecret(b)).toBe('same-plaintext');
  });

  it('decrypts under the key that encrypted, and ONLY under it', () => {
    process.env.AGENCY_MASTER_KEY = KEY_A;
    const ct = encryptSecret('tenant-secret')!;
    process.env.AGENCY_MASTER_KEY = KEY_B;
    expect(decryptSecret(ct)).toBeNull(); // wrong key ⇒ auth-tag failure ⇒ null
    process.env.AGENCY_MASTER_KEY = KEY_A;
    expect(decryptSecret(ct)).toBe('tenant-secret');
  });
});

describe('Module 17 §49 — tamper resistance (authenticated encryption)', () => {
  it('a flipped ciphertext character ⇒ null, never a wrong plaintext', () => {
    process.env.AGENCY_MASTER_KEY = KEY_A;
    const ct = encryptSecret('value-one')!;
    const parts = ct.split(':');
    // Flip one character in the ciphertext body.
    parts[3] = parts[3].startsWith('A') ? `B${parts[3].slice(1)}` : `A${parts[3].slice(1)}`;
    expect(decryptSecret(parts.join(':'))).toBeNull();
  });

  it('a flipped auth-tag character ⇒ null', () => {
    process.env.AGENCY_MASTER_KEY = KEY_A;
    const ct = encryptSecret('value-two')!;
    const parts = ct.split(':');
    parts[2] = parts[2].startsWith('A') ? `B${parts[2].slice(1)}` : `A${parts[2].slice(1)}`;
    expect(decryptSecret(parts.join(':'))).toBeNull();
  });

  it('malformed ciphertexts of every shape ⇒ null', () => {
    process.env.AGENCY_MASTER_KEY = KEY_A;
    for (const bad of [
      '', 'plaintext', 'v1:only-one-part', 'v2:aaaa:bbbb:cccc',
      'v1::::', 'v1:!!:bb:cc', // invalid base64 in the iv slot
    ]) {
      expect(decryptSecret(bad)).toBeNull();
    }
  });
});

describe('Module 17 §50 — the masked display form', () => {
  it('the mask is a dot run, not a placeholder that could be mistaken for a value', () => {
    expect(MASKED_SECRET).toMatch(/^•+$/);
    expect(MASKED_SECRET.length).toBeGreaterThanOrEqual(8);
  });
});
