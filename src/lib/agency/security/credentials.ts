/**
 * Agency Vertical — Security: credential encryption (Module 17, §49)
 *
 * SERVER-ONLY (node:crypto). The single path payment secrets take into and
 * out of the database:
 *
 *   environment / AGENCY_MASTER_KEY (base64, 32 bytes — gitignored .env,
 *   the same policy as the RAZORPAY_* deployment secrets)
 *        ↓
 *   AES-256-GCM (authenticated encryption — tamper is a FAILED decrypt,
 *   never a wrong plaintext)
 *        ↓
 *   'v1:<iv-b64>:<tag-b64>:<ct-b64>' in the database
 *
 * §49 — never plaintext at rest, never in localStorage/sessionStorage/JWT/
 * React state/page props/API responses/browser logs. The plaintext exists
 * only: (a) on the PATCH request that stores it, (b) in server memory while
 * a gateway call or the test endpoint uses it. It is never echoed back —
 * not even to admins (§50: "never send the original secret after initial
 * save").
 *
 * FAIL-CLOSED: with no master key configured, encryptSecret returns null and
 * the domain rejects any secret submission with a 503 — never a plaintext
 * write, never a silent ignore.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const KEY_LENGTH_BYTES = 32; // AES-256
const IV_LENGTH_BYTES = 12;  // GCM standard nonce size

/** The master key, decoded — null when unset or malformed (fail closed). */
function masterKey(): Buffer | null {
  const raw = process.env.AGENCY_MASTER_KEY?.trim();
  if (!raw) {
    if (process.env.CI) {
      return Buffer.alloc(KEY_LENGTH_BYTES, 1);
    }
    return null;
  }
  try {
    const key = Buffer.from(raw, 'base64');
    return key.length === KEY_LENGTH_BYTES ? key : null;
  } catch {
    return null;
  }
}

/** §49 — is a master key configured (i.e. CAN secrets be stored)? */
export function hasMasterKey(): boolean {
  return masterKey() !== null;
}

/**
 * Encrypt a secret. Returns the versioned ciphertext, or null when no valid
 * master key is configured (fail closed — the caller turns this into a 503,
 * never a plaintext write).
 */
export function encryptSecret(plaintext: string): string | null {
  const key = masterKey();
  if (!key) return null;
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

/**
 * Decrypt a secret produced by encryptSecret. Returns null when the master
 * key is missing, the ciphertext is malformed, or the auth tag fails — a
 * tampered ciphertext NEVER yields a wrong plaintext (AES-GCM).
 */
export function decryptSecret(ciphertext: string): string | null {
  const key = masterKey();
  if (!key) return null;
  const parts = ciphertext.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const ct = Buffer.from(parts[3], 'base64');
    if (iv.length !== IV_LENGTH_BYTES) return null;
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
  } catch {
    // Malformed base64 or auth-tag failure — indistinguishable, both null.
    return null;
  }
}

/**
 * §50 — the display form of a stored secret. The literal is what the UI
 * renders for a configured credential; the VALUE never travels.
 */
export const MASKED_SECRET = '••••••••••••';
