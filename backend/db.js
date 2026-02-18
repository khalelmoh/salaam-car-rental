import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, 'db.json');

let writeQueue = Promise.resolve();

export async function readDb() {
  const raw = await fs.readFile(DB_FILE, 'utf-8');
  return JSON.parse(raw);
}

export function writeDb(nextDb) {
  writeQueue = writeQueue.then(() =>
    fs.writeFile(DB_FILE, JSON.stringify(nextDb, null, 2), 'utf-8')
  );
  return writeQueue;
}
