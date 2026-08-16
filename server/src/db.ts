import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DB_PATH = process.env.DB_PATH ?? resolve(process.cwd(), 'data/crm.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

export function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      title TEXT NOT NULL,
      role TEXT NOT NULL,
      avatar TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      company TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      country TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
      owner_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_customers_name ON customers (name, id);
    CREATE INDEX IF NOT EXISTS idx_customers_company ON customers (company, id);
    CREATE INDEX IF NOT EXISTS idx_customers_country ON customers (country, id);
    CREATE INDEX IF NOT EXISTS idx_customers_status ON customers (status, id);
    CREATE INDEX IF NOT EXISTS idx_customers_created ON customers (created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_customers_owner ON customers (owner_id, id);
  `);
}
