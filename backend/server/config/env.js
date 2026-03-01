function requireValue(name, fallback = '') {
  const value = String(process.env[name] ?? fallback).trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadEnvConfig() {
  const config = {
    NODE_ENV: String(process.env.NODE_ENV || 'development'),
    PORT: Number(process.env.PORT || 4000),
    PGHOST: requireValue('PGHOST', 'localhost'),
    PGPORT: Number(requireValue('PGPORT', '5432')),
    PGUSER: requireValue('PGUSER'),
    PGPASSWORD: requireValue('PGPASSWORD'),
    PGDATABASE: requireValue('PGDATABASE'),
    CORS_ORIGIN: String(process.env.CORS_ORIGIN || '*'),
    SESSION_TTL_HOURS: Number(process.env.SESSION_TTL_HOURS || 12),
  };

  if (!Number.isFinite(config.PORT) || config.PORT <= 0) {
    throw new Error('Invalid PORT environment variable.');
  }
  if (!Number.isFinite(config.PGPORT) || config.PGPORT <= 0) {
    throw new Error('Invalid PGPORT environment variable.');
  }
  return config;
}
