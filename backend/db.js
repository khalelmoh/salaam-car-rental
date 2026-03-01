// Legacy compatibility shim: backend persistence moved to backend/server/db/*.
export { pool } from './server/db/pool.js';
export { runMigrations } from './server/db/migrate.js';
export { seedFromLegacyIfEmpty, ensureAdminBootstrapPassword } from './server/db/seed.js';
