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
    APP_BASE_URL: String(process.env.APP_BASE_URL || ''),
    SESSION_TTL_HOURS: Number(process.env.SESSION_TTL_HOURS || 12),
    SMTP_HOST: String(process.env.SMTP_HOST || ''),
    SMTP_PORT: Number(process.env.SMTP_PORT || 587),
    SMTP_SECURE: String(process.env.SMTP_SECURE || ''),
    SMTP_USER: String(process.env.SMTP_USER || ''),
    SMTP_PASS: String(process.env.SMTP_PASS || ''),
    SMTP_FROM: String(process.env.SMTP_FROM || ''),
  };

  if (!Number.isFinite(config.PORT) || config.PORT <= 0) {
    throw new Error('Invalid PORT environment variable.');
  }
  if (!Number.isFinite(config.PGPORT) || config.PGPORT <= 0) {
    throw new Error('Invalid PGPORT environment variable.');
  }
  if (!Number.isFinite(config.SMTP_PORT) || config.SMTP_PORT <= 0) {
    throw new Error('Invalid SMTP_PORT environment variable.');
  }
  return config;
}
