import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import fs from 'fs';
import * as schema from './schema';

const DB_PATH = path.join(process.cwd(), 'data', 'factory.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

declare global {
  var __factorySqlite: Database.Database | undefined;
  var __factoryDb: ReturnType<typeof drizzle<typeof schema>> | undefined;
  var __factoryMigrationsRun: boolean | undefined;
}

const sqlite =
  global.__factorySqlite ??
  (() => {
    const dbClient = new Database(DB_PATH);
    dbClient.pragma('journal_mode = WAL');
    return dbClient;
  })();

const db =
  global.__factoryDb ??
  drizzle(sqlite, {
    schema,
  });

if (process.env.NODE_ENV !== 'production') {
  global.__factorySqlite = sqlite;
  global.__factoryDb = db;
}

const migrationsFolder = path.join(process.cwd(), 'drizzle');
if (!global.__factoryMigrationsRun) {
  if (fs.existsSync(migrationsFolder)) {
    migrate(db, { migrationsFolder });
  }
  global.__factoryMigrationsRun = true;
}

export { db, sqlite };
export default db;
