import { pool } from '../db/pool.js';
import { sanitizeUser } from '../services/security.js';
import { sendError } from '../services/http.js';

export async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

    if (!token) {
      return sendError(res, 401, 'AUTH_MISSING_TOKEN', 'Missing bearer token.');
    }

    const { rows } = await pool.query(
      `SELECT s.token, s.expires_at, u.id, u.username, u.email, u.name, u.title, r.name AS role_name
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
      return sendError(res, 401, 'AUTH_SESSION_EXPIRED', 'Session expired.');
    }

    req.auth = {
      token,
      userId: session.id,
      role: session.role_name,
      user: sanitizeUser(session),
    };
    next();
  } catch (error) {
    next(error);
  }
}
