import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { router } from './routes/api.js';
import { attachRequestContext } from './middleware/requestContext.js';
import { sendError, sendNotFound } from './services/http.js';

function isLoopbackOrigin(origin) {
  try {
    const parsed = new URL(origin);
    const host = String(parsed.hostname || '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

export function createApp() {
  const app = express();
  const allowLoopbackCors = String(process.env.ALLOW_LOCALHOST_CORS || 'true').toLowerCase() !== 'false';
  const allowedOrigins = String(process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        if (allowLoopbackCors && isLoopbackOrigin(origin)) return callback(null, true);
        const corsError = new Error('CORS origin blocked.');
        corsError.statusCode = 403;
        return callback(corsError);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['x-request-id'],
    })
  );
  app.use(attachRequestContext);
  morgan.token('request-id', (req) => req.requestId || '-');
  app.use(
    morgan((tokens, req, res) =>
      JSON.stringify({
        ts: new Date().toISOString(),
        requestId: tokens['request-id'](req, res),
        method: tokens.method(req, res),
        url: tokens.url(req, res),
        status: Number(tokens.status(req, res) || 0),
        durationMs: Number(tokens['response-time'](req, res) || 0),
        contentLength: Number(tokens.res(req, res, 'content-length') || 0),
      })
    )
  );
  app.use(express.json({ limit: '1mb' }));

  app.use(router);

  app.use((_req, res) => {
    sendNotFound(res, 'Route not found.');
  });

  app.use((error, _req, res, _next) => {
    const message = error instanceof Error ? error.message : 'Unexpected server error.';
    const statusCode = Number(error?.statusCode || 500);
    sendError(res, statusCode, statusCode === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR', message);
  });

  return app;
}
