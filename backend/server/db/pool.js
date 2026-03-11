import pg from 'pg';

const { Pool, types } = pg;

// Override default DATE parser (OID 1082) to return raw YYYY-MM-DD string
// instead of converting to a JS Date object (which causes timezone-related date shifts).
types.setTypeParser(1082, (val) => val);

const connectionString = process.env.DATABASE_URL;

export const pool = new Pool(
  connectionString
    ? {
        connectionString,
        ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
      }
    : {
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || '',
        database: process.env.PGDATABASE || 'salaam_car_rental',
      }
);
