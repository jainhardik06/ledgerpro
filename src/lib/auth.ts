import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

const JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production' && !process.env.CI) {
      throw new Error('[FATAL] JWT_SECRET environment variable is not set. Refusing to start in production without a secure secret.');
    }
    // Development or CI placeholder
    console.warn('[WARNING] JWT_SECRET is not set. Using an automated placeholder. Set JWT_SECRET in production.');
    return 'ci_dev_placeholder_set_JWT_SECRET_in_env_securely';
  }
  return secret;
})();

export interface TokenPayload {
  userId: string;
  username: string;
  role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'USER';
  tenantId?: string;
  impersonatedBy?: string;
}

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export async function getSessionUser(): Promise<TokenPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    
    if (!token) return null;
    
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}
