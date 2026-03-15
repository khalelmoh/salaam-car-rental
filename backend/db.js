import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, 'db.json');

const connectionString = process.env.DATABASE_URL;

const pool = new Pool(
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

let writeQueue = Promise.resolve();

function normalizeDb(raw = {}) {
  return {
    users: Array.isArray(raw.users) ? raw.users : [],
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    cars: Array.isArray(raw.cars) ? raw.cars : [],
    customers: Array.isArray(raw.customers) ? raw.customers : [],
    bookings: Array.isArray(raw.bookings) ? raw.bookings : [],
    transactions: Array.isArray(raw.transactions) ? raw.transactions : [],
    activities: Array.isArray(raw.activities) ? raw.activities : [],
    settings: raw.settings && typeof raw.settings === 'object' ? raw.settings : {},
  };
}

async function loadSeedData() {
  try {
    const raw = await fs.readFile(DB_FILE, 'utf-8');
    return normalizeDb(JSON.parse(raw));
  } catch {
    return normalizeDb();
  }
}

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const { rows } = await pool.query('SELECT id FROM app_state WHERE id = 1');
  if (rows.length === 0) {
    const seed = await loadSeedData();
    await pool.query(
      `
        INSERT INTO app_state (id, data, updated_at)
        VALUES (1, $1::jsonb, NOW())
      `,
      [JSON.stringify(seed)]
    );
  }
}

export async function readDb() {
  const { rows } = await pool.query('SELECT data FROM app_state WHERE id = 1');
  if (rows.length === 0) {
    const emptyDb = normalizeDb();
    await writeDb(emptyDb);
    return emptyDb;
  }
  return normalizeDb(rows[0].data);
}

export function writeDb(nextDb) {
  const normalized = normalizeDb(nextDb);
  writeQueue = writeQueue.then(() =>
    pool.query(
      `
        INSERT INTO app_state (id, data, updated_at)
        VALUES (1, $1::jsonb, NOW())
        ON CONFLICT (id)
        DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
      `,
      [JSON.stringify(normalized)]
    )
  );
  return writeQueue;
}
