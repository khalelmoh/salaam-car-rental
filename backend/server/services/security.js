import { randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcrypt';

export const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 12);

export function makeId(prefix) {
  return `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function makeToken() {
  return randomUUID();
}

export function sanitizeUser(row) {
  return {
    id: row.id,
    username: row.username || '',
    email: row.email,
    role: row.role_name,
    name: row.name,
    title: row.title || '',
  };
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
