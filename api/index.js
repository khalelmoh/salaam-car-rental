import { createApp } from '../backend/server/app.js';
import { initializeBackend } from '../backend/server/startup.js';

const app = createApp();
let initPromise;

function ensureApiPrefix(req) {
  const rawUrl = String(req.url || '/');
  const parsed = new URL(rawUrl, 'http://localhost');

  // Vercel can route only /api to the function in some project setups.
  // Frontend can pass the intended Express path through ?__path=...
  const proxiedPath = parsed.searchParams.get('__path');
  if (proxiedPath) {
    const normalized = proxiedPath.startsWith('/') ? proxiedPath : `/${proxiedPath}`;
    req.url = normalized === '/api' || normalized.startsWith('/api/')
      ? normalized
      : `/api${normalized}`;
    return;
  }

  const pathname = parsed.pathname || '/';
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return;
  }
  req.url = pathname.startsWith('/') ? `/api${pathname}` : `/api/${pathname}`;
  if (parsed.search) {
    req.url += parsed.search;
  }
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
