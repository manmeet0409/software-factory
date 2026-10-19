import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import fs from 'fs';
import * as schema from './schema';

const DB_PATH = path.join(process.cwd(), 'data', 'factory.db');

// Ensure data and uploads directories exist
const dataDir = path.dirname(DB_PATH);
const uploadsDir = path.join(dataDir, 'uploads');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
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
    dbClient.exec(`
      CREATE TABLE IF NOT EXISTS "chatMessages" (
        "id" text PRIMARY KEY NOT NULL,
        "sender" text NOT NULL,
        "text" text NOT NULL,
        "timestamp" integer NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "wallPins" (
        "id" text PRIMARY KEY NOT NULL,
        "title" text NOT NULL,
        "description" text NOT NULL,
        "category" text NOT NULL,
        "module" text NOT NULL,
        "tags" text NOT NULL,
        "createdBy" text NOT NULL,
        "createdAt" integer NOT NULL,
        "archived" integer NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS "wallTaxonomy" (
        "id" text PRIMARY KEY NOT NULL,
        "type" text NOT NULL,
        "name" text NOT NULL,
        "description" text,
        "createdAt" integer NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "wallRequests" (
        "id" text PRIMARY KEY NOT NULL,
        "type" text NOT NULL,
        "submittedBy" text NOT NULL,
        "status" text NOT NULL DEFAULT 'pending',
        "payload" text NOT NULL,
        "critiqueOrSuggestions" text,
        "createdAt" integer NOT NULL,
        "reviewedAt" integer
      );

      CREATE TABLE IF NOT EXISTS "agentSessions" (
        "id" text PRIMARY KEY NOT NULL,
        "ticketId" text,
        "role" text NOT NULL,
        "parentSessionId" text,
        "worktreeDir" text,
        "status" text NOT NULL DEFAULT 'active',
        "model" text,
        "createdAt" integer NOT NULL,
        "updatedAt" integer NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "attachments" (
        "id" text PRIMARY KEY NOT NULL,
        "filename" text NOT NULL,
        "originalName" text NOT NULL,
        "mimeType" text NOT NULL,
        "size" integer NOT NULL,
        "storagePath" text NOT NULL,
        "scope" text NOT NULL,
        "entityId" text,
        "createdAt" integer NOT NULL
      );
    `);

    // Seed default taxonomy if empty
    const countRow = dbClient.prepare('SELECT count(*) as count FROM wallTaxonomy').get() as { count: number };
    if (countRow.count === 0) {
      const now = Math.floor(Date.now() / 1000);
      const insert = dbClient.prepare('INSERT INTO wallTaxonomy (id, type, name, description, createdAt) VALUES (?, ?, ?, ?, ?)');
      const defaultTaxonomy = [
        { type: 'module', name: 'auth', desc: 'Authentication, authorization, and sessions' },
        { type: 'module', name: 'database', desc: 'SQLite, migrations, and ORM schema' },
        { type: 'module', name: 'orchestration', desc: 'Agent coordination, ACP sessions, and queues' },
        { type: 'module', name: 'worktree', desc: 'Git worktrees and branch merging' },
        { type: 'module', name: 'ui', desc: 'Next.js components, Tailwind, and Kanban board' },
        { type: 'tag', name: 'architecture', desc: 'Design decisions and system structure' },
        { type: 'tag', name: 'gotcha', desc: 'Known pitfalls and edge-case lessons' },
        { type: 'tag', name: 'concurrency', desc: 'Locking, parallel execution, and resource limits' },
        { type: 'tag', name: 'performance', desc: 'Speed and memory optimizations' },
        { type: 'tag', name: 'security', desc: 'Sandboxing and permission rules' },
      ];
      const uuidv4 = () => Math.random().toString(36).substring(2, 10);
      for (const item of defaultTaxonomy) {
        insert.run(uuidv4(), item.type, item.name, item.desc, now);
      }
    }

    return dbClient;
  })();

// Ensure required tables always exist even when sqlite instance is preserved across hot reloads
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS "attachments" (
    "id" text PRIMARY KEY NOT NULL,
    "filename" text NOT NULL,
    "originalName" text NOT NULL,
    "mimeType" text NOT NULL,
    "size" integer NOT NULL,
    "storagePath" text NOT NULL,
    "scope" text NOT NULL,
    "entityId" text,
    "createdAt" integer NOT NULL
  );
`);

// Safe column migrations for chatMessages revert capabilities
try {
  sqlite.exec(`ALTER TABLE "chatMessages" ADD COLUMN "ticketCreated" integer DEFAULT 0;`);
} catch {}
try {
  sqlite.exec(`ALTER TABLE "chatMessages" ADD COLUMN "promptMsgId" text;`);
} catch {}
try {
  sqlite.exec(`ALTER TABLE "chatMessages" ADD COLUMN "sessionId" text;`);
} catch {}
try {
  sqlite.exec(`ALTER TABLE "chatMessages" ADD COLUMN "pairMessageId" text;`);
} catch {}
try {
  sqlite.exec(`ALTER TABLE "chatMessages" ADD COLUMN "wallPinIds" text;`);
} catch {}

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
