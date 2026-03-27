import { pool } from '../db/pool.js';
import { clearSessionCookie, SESSION_COOKIE_NAME, sanitizeUser } from '../services/security.js';
import { sendError } from '../services/http.js';

function readSessionCookie(req) {
  const cookieHeader = String(req.headers.cookie || '');
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName !== SESSION_COOKIE_NAME) continue;
    try {
      return decodeURIComponent(rest.join('=') || '');
    } catch {
      return null;
    }
  }
  return null;
}

export async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const bearerToken = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const cookieToken = readSessionCookie(req);
    const token = bearerToken || cookieToken;

    if (!token) {
      return sendError(res, 401, 'AUTH_MISSING_TOKEN', 'Missing session token.');
    }

    const { rows } = await pool.query(
      `SELECT s.token, s.expires_at, u.id, u.username, u.email, u.name, u.title, u.must_change_password, r.name AS role_name
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN roles r ON r.id = u.role_id
       WHERE s.token = $1`,
      [token]
    );

    if (rows.length === 0) {
      return sendError(res, 401, 'AUTH_INVALID_SESSION', 'Invalid session.');
    }

    const session = rows[0];
    if (new Date(session.expires_at).getTime() <= Date.now()) {
      await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
      if (cookieToken === token) {
        clearSessionCookie(res);
      }
      return sendError(res, 401, 'AUTH_SESSION_EXPIRED', 'Session expired.');
    }

    const user = sanitizeUser(session);
    req.auth = {
      token,
      userId: session.id,
      role: session.role_name,
      mustChangePassword: Boolean(session.must_change_password),
      user,
    };
    next();
  } catch (error) {
    next(error);
  }
}
