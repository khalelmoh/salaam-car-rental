import { runMigrations } from './db/migrate.js';
import { pool } from './db/pool.js';
import { ensureAdminBootstrapPassword, seedFromLegacyIfEmpty } from './db/seed.js';
import { processBookingNotifications } from './controllers/systemController.js';
import { syncLedgerFromSources } from './services/accountingService.js';

async function waitForDatabaseReady({
  maxAttempts = Number(process.env.DB_CONNECT_MAX_ATTEMPTS || 30),
  baseDelayMs = Number(process.env.DB_CONNECT_BASE_DELAY_MS || 200),
  maxDelayMs = Number(process.env.DB_CONNECT_MAX_DELAY_MS || 2000),
} = {}) {
  let attempt = 0;
  let lastError = null;

  while (attempt < maxAttempts) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      lastError = error;
      attempt += 1;
      const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.min(attempt, 6));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const error = new Error(`Database not ready after ${maxAttempts} attempts.`);
  error.cause = lastError;
  throw error;
}

export async function initializeBackend() {
  await waitForDatabaseReady();
  await runMigrations();
  await seedFromLegacyIfEmpty();
  await syncLedgerFromSources();
  await ensureAdminBootstrapPassword();
}

export function startBookingNotificationMonitor(intervalMs = 30 * 1000) {
  return setInterval(async () => {
    try {
      await processBookingNotifications();
    } catch {
      // Keep monitor resilient; handlers still validate and persist state.
    }
  }, intervalMs);
}
