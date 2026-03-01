export function sendError(res, status, code, message, details) {
  return res.status(status).json({
    error: message,
    code,
    message,
    details: details || null,
    requestId: res.locals.requestId || null,
  });
}

export function sendNotFound(res, message = 'Route not found.') {
  return sendError(res, 404, 'NOT_FOUND', message);
}
