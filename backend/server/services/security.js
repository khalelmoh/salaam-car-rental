import { createHash, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcrypt';

export const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 12);
export const SESSION_COOKIE_NAME = String(process.env.SESSION_COOKIE_NAME || 'salaam_session');

export function makeId(prefix) {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  return `${prefix}-${suffix}`;
}

export function makeToken() {
  return randomUUID();
}

export function hashResetToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export function sanitizeUser(row) {
  return {
    id: row.id,
    username: row.username || '',
    email: row.email,
    role: row.role_name,
    name: row.name,
    title: row.title || '',
    mustChangePassword: Boolean(row.must_change_password),
  };
}

function resolveCookieSecure() {
  if (String(process.env.COOKIE_SECURE || '').toLowerCase() === 'true') return true;
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

function sessionCookieBaseOptions() {
  return {
    httpOnly: true,
    secure: resolveCookieSecure(),
    sameSite: 'lax',
    path: '/',
  };
}

export function setSessionCookie(res, token, expiresAt) {
  res.cookie(SESSION_COOKIE_NAME, token, {
    ...sessionCookieBaseOptions(),
    expires: expiresAt,
  });
}

export function clearSessionCookie(res) {
  res.cookie(SESSION_COOKIE_NAME, '', {
    ...sessionCookieBaseOptions(),
    expires: new Date(0),
    maxAge: 0,
  });
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

function verifyLegacyScrypt(password, storedHash) {
  const [salt, key] = String(storedHash).split(':');
  if (!salt || !key) return false;
  const hashBuffer = Buffer.from(key, 'hex');
  const supplied = scryptSync(password, salt, 64);
  if (hashBuffer.length !== supplied.length) return false;
  return timingSafeEqual(hashBuffer, supplied);
}

export async function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
    return bcrypt.compare(password, storedHash);
  }
  return verifyLegacyScrypt(password, storedHash);
}
