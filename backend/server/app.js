import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { router } from './routes/api.js';
import { attachRequestContext } from './middleware/requestContext.js';
import { sendError, sendNotFound } from './services/http.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((v) => v.trim()) : '*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
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
