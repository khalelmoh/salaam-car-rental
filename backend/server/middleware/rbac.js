import { sendError } from '../services/http.js';

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.auth?.role) {
      return sendError(res, 401, 'AUTH_UNAUTHORIZED', 'Unauthorized.');
    }
    if (!allowedRoles.includes(req.auth.role)) {
      return sendError(res, 403, 'AUTH_FORBIDDEN', 'Forbidden.', { allowedRoles });
    }
    next();
  };
}
