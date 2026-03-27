import { createApp } from '../backend/server/app.js';
import { initializeBackend } from '../backend/server/startup.js';

const app = createApp();
let initPromise;

function ensureApiPrefix(req) {
  const rawUrl = String(req.url || '/');
  if (rawUrl === '/api' || rawUrl.startsWith('/api/')) {
    return;
  }
  req.url = rawUrl.startsWith('/') ? `/api${rawUrl}` : `/api/${rawUrl}`;
}

async function ensureInitialized() {
  if (!initPromise) {
    initPromise = initializeBackend().catch((error) => {
      initPromise = null;
      throw error;
    });
  }
  await initPromise;
}

export default async function handler(req, res) {
  try {
    // Some serverless runtimes pass function-local paths (e.g. /auth/login)
    // while app routes are registered as /api/*.
    ensureApiPrefix(req);
    await ensureInitialized();
    return app(req, res);
  } catch (error) {
    console.error('API initialization failed:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'INTERNAL_ERROR',
        message: 'Backend initialization failed. Check database and server environment variables.',
      })
    );
  }
}
