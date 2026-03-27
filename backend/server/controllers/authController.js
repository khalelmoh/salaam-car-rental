import { z } from 'zod';
import { pool } from '../db/pool.js';
import { logAudit } from '../services/auditService.js';
import {
  clearSessionCookie,
  makeId,
  makeToken,
  hashResetToken,
  sanitizeUser,
  setSessionCookie,
  hashPassword,
  verifyPassword,
  SESSION_TTL_HOURS,
} from '../services/security.js';
import { sendError } from '../services/http.js';
import { isSmtpConfigured, sendPasswordResetEmail } from '../services/mailer.js';

const profileSchema = z.object({
  username: z.string().min(1).optional(),
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
  title: z.string().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

const LOGIN_RATE_LIMIT_WINDOW_MS = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 60_000);
const LOGIN_RATE_LIMIT_MAX_REQUESTS = Number(process.env.LOGIN_RATE_LIMIT_MAX_REQUESTS || 30);
const LOGIN_ATTEMPT_WINDOW_MS = Number(process.env.LOGIN_ATTEMPT_WINDOW_MS || 15 * 60_000);
const LOGIN_MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS || 10);
const LOGIN_LOCKOUT_MS = Number(process.env.LOGIN_LOCKOUT_MS || 15 * 60_000);
const PASSWORD_RESET_TOKEN_TTL_MINUTES = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || 30);

const ipRateWindow = new Map();
const loginAttempts = new Map();

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || 'unknown';
}

function checkIpRateLimit(ip) {
  const now = Date.now();
  const state = ipRateWindow.get(ip);
  if (!state || now - state.windowStart > LOGIN_RATE_LIMIT_WINDOW_MS) {
    ipRateWindow.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  state.count += 1;
  return state.count > LOGIN_RATE_LIMIT_MAX_REQUESTS;
}

function getAttemptKey(ip, identifier) {
  return `${ip}|${String(identifier || '').toLowerCase()}`;
}

function getLockStatus(key) {
  const state = loginAttempts.get(key);
  if (!state) return { locked: false, retryAfterSeconds: 0 };
  const now = Date.now();
  if (state.lockedUntil && state.lockedUntil > now) {
    return { locked: true, retryAfterSeconds: Math.ceil((state.lockedUntil - now) / 1000) };
  }
  return { locked: false, retryAfterSeconds: 0 };
}

function recordFailedLogin(key) {
  const now = Date.now();
  const state = loginAttempts.get(key);
  if (!state || now - state.windowStart > LOGIN_ATTEMPT_WINDOW_MS) {
    loginAttempts.set(key, { windowStart: now, count: 1, lockedUntil: 0 });
    return;
  }
  state.count += 1;
  if (state.count >= LOGIN_MAX_ATTEMPTS) {
    state.lockedUntil = now + LOGIN_LOCKOUT_MS;
  }
}

function clearFailedLogin(key) {
  loginAttempts.delete(key);
}

async function findUserByIdentifier(identifier) {
  const { rows } = await pool.query(
    `SELECT u.*, r.name AS role_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE LOWER(u.email) = LOWER($1) OR LOWER(COALESCE(u.username, '')) = LOWER($1)
     ORDER BY CASE WHEN LOWER(u.email) = LOWER($1) THEN 0 ELSE 1 END, u.created_at ASC
     LIMIT 1`,
    [identifier]
  );
  return rows[0] || null;
}

export async function health(_req, res) {
  res.json({ status: 'ok' });
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    const ip = getClientIp(req);

    if (checkIpRateLimit(ip)) {
      return sendError(res, 429, 'AUTH_RATE_LIMITED', 'Too many login requests. Please try again shortly.');
    }

    if (!email || !password) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Field "email" and "password" are required.');
    }

    const key = getAttemptKey(ip, email);
    const lock = getLockStatus(key);
    if (lock.locked) {
      return sendError(res, 429, 'AUTH_LOCKED', 'Too many failed login attempts. Try again later.', {
        retryAfterSeconds: lock.retryAfterSeconds,
      });
    }

    const user = await findUserByIdentifier(String(email));
    if (!user) {
      recordFailedLogin(key);
      return sendError(res, 401, 'AUTH_INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    const validPassword = await verifyPassword(String(password), user.password_hash);
    if (!validPassword) {
      recordFailedLogin(key);
      return sendError(res, 401, 'AUTH_INVALID_CREDENTIALS', 'Invalid email or password.');
    }
    clearFailedLogin(key);

    if (!String(user.password_hash || '').startsWith('$2')) {
      const upgraded = await hashPassword(String(password));
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [upgraded, user.id]);
      user.password_hash = upgraded;
    }

    const token = makeToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);
    await pool.query(
      'INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3::timestamptz)',
      [token, user.id, expiresAt.toISOString()]
    );
    setSessionCookie(res, token, expiresAt);

    await logAudit({ userId: user.id, action: 'login', entity: 'auth', entityId: user.id });

    res.json({
      token,
      user: sanitizeUser(user),
      expiresAt: expiresAt.getTime(),
    });
  } catch (error) {
    next(error);
  }
}

export async function me(req, res) {
  res.json({ user: req.auth.user });
}

export async function logout(req, res, next) {
  try {
    await pool.query('DELETE FROM sessions WHERE token = $1', [req.auth.token]);
    clearSessionCookie(res);
    await logAudit({ userId: req.auth.userId, action: 'logout', entity: 'auth', entityId: req.auth.userId });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(req, res, next) {
  try {
    const parsed = profileSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid profile payload.');
    }

    const payload = parsed.data;
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.auth.userId]);
    if (!rows[0]) return sendError(res, 404, 'USER_NOT_FOUND', 'User not found.');

    const user = rows[0];
    if (req.auth.mustChangePassword && !payload.newPassword) {
      return sendError(
        res,
        400,
        'AUTH_PASSWORD_ROTATION_REQUIRED',
        'You must set a new password before continuing.'
      );
    }

    let mustChangePassword = Boolean(user.must_change_password);
    if (payload.newPassword) {
      const ok = await verifyPassword(payload.currentPassword || '', user.password_hash);
      if (!ok) return sendError(res, 400, 'AUTH_INVALID_PASSWORD', 'Current password is invalid.');
      user.password_hash = await hashPassword(payload.newPassword);
      mustChangePassword = false;
    }

    user.username = payload.username ?? user.username;
    user.email = payload.email ? payload.email.toLowerCase() : user.email;
    user.name = payload.name ?? user.name;
    user.title = payload.title ?? user.title;

    await pool.query(
      `UPDATE users
       SET username = $1, email = $2, name = $3, title = $4, password_hash = $5, must_change_password = $6
       WHERE id = $7`,
      [user.username, user.email, user.name, user.title, user.password_hash, mustChangePassword, user.id]
    );

    const joined = await pool.query(
      `SELECT u.id, u.username, u.email, u.name, u.title, u.must_change_password, r.name AS role_name
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
      [user.id]
    );

    await logAudit({ userId: req.auth.userId, action: 'profile_update', entity: 'user', entityId: user.id });
    res.json({ user: sanitizeUser(joined.rows[0]) });
  } catch (error) {
    next(error);
  }
}

export async function forgotPassword(req, res, next) {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid forgot password payload.');
    }

    const email = String(parsed.data.email).toLowerCase();
    const user = await findUserByIdentifier(email);

    // Always return success to prevent user enumeration.
    const genericResponse = {
      success: true,
      message: 'If the account exists, a password reset link has been generated.',
    };

    if (!user) {
      return res.json(genericResponse);
    }

    const resetToken = makeToken();
    const tokenHash = hashResetToken(resetToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000);

    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1 OR expires_at < NOW() OR used_at IS NOT NULL', [user.id]);
    await pool.query(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4::timestamptz)`,
      [makeId('PRT'), user.id, tokenHash, expiresAt.toISOString()]
    );

    await logAudit({ userId: user.id, action: 'password_reset_requested', entity: 'auth', entityId: user.id });

    const appBase = process.env.APP_BASE_URL || process.env.CORS_ORIGIN || 'http://localhost:5173';
    const resetUrl = `${String(appBase).replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(resetToken)}`;
    const smtpConfigured = isSmtpConfigured();
    let emailDelivered = false;

    if (smtpConfigured) {
      try {
        await sendPasswordResetEmail({
          to: user.email,
          resetUrl,
          expiresMinutes: PASSWORD_RESET_TOKEN_TTL_MINUTES,
        });
        emailDelivered = true;
      } catch (error) {
        await logAudit({
          userId: user.id,
          action: 'password_reset_email_failed',
          entity: 'auth',
          entityId: user.id,
          details: { error: String(error instanceof Error ? error.message : error) },
        });
      }
    }

    if (process.env.NODE_ENV !== 'production' && !emailDelivered) {
      return res.json({
        ...genericResponse,
        resetToken,
        resetUrl,
        expiresAt: expiresAt.toISOString(),
      });
    }

    return res.json(genericResponse);
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(req, res, next) {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid reset password payload.');
    }

    const tokenHash = hashResetToken(parsed.data.token);
    const { rows } = await pool.query(
      `SELECT prt.id, prt.user_id
       FROM password_reset_tokens prt
       WHERE prt.token_hash = $1
         AND prt.used_at IS NULL
         AND prt.expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );

    if (!rows[0]) {
      return sendError(res, 400, 'AUTH_INVALID_RESET_TOKEN', 'Reset token is invalid or expired.');
    }

    const resetRow = rows[0];
    const newPasswordHash = await hashPassword(parsed.data.newPassword);

    await pool.query('BEGIN');
    try {
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newPasswordHash, resetRow.user_id]);
      await pool.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [resetRow.id]);
      await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND id <> $2', [resetRow.user_id, resetRow.id]);
      await pool.query('DELETE FROM sessions WHERE user_id = $1', [resetRow.user_id]);
      await logAudit({ userId: resetRow.user_id, action: 'password_reset_completed', entity: 'auth', entityId: resetRow.user_id });
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }

    res.json({ success: true, message: 'Password has been reset successfully.' });
  } catch (error) {
    next(error);
  }
}
