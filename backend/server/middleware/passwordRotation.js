import { sendError } from '../services/http.js';

const ALLOWED_PATHS = new Set([
  '/auth/me',
  '/auth/logout',
  '/auth/profile',
]);

export function enforcePasswordRotation(req, res, next) {
  if (!req.auth?.mustChangePassword) {
    return next();
  }

  if (ALLOWED_PATHS.has(req.path)) {
    return next();
  }

  return sendError(
    res,
    403,
    'AUTH_PASSWORD_ROTATION_REQUIRED',
    'Password rotation is required before accessing this resource.'
  );
}
