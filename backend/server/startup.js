import { runMigrations } from './db/migrate.js';
import { ensureAdminBootstrapPassword, seedFromLegacyIfEmpty } from './db/seed.js';
import { processBookingNotifications } from './controllers/systemController.js';
import { syncLedgerFromSources } from './services/accountingService.js';

export async function initializeBackend() {
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
