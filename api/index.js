import { createApp } from '../backend/server/app.js';
import { initializeBackend } from '../backend/server/startup.js';

const app = createApp();
let initPromise;

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
