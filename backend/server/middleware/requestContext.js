import { randomUUID } from 'node:crypto';

export function attachRequestContext(req, res, next) {
  const incoming = String(req.headers['x-request-id'] || '').trim();
  const requestId = incoming || randomUUID();
  res.locals.requestId = requestId;
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}
