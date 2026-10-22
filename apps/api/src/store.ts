import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { User, WorkOrder, Catalog } from '@fieldwork/contracts';

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password: string, encoded: string) {
  const [salt, hash] = encoded.split(':');
  return timingSafeEqual(Buffer.from(hash, 'hex'), scryptSync(password, salt, 64));
}
export function openStore(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('manager','worker')), password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS catalog(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS work_orders(id TEXT PRIMARY KEY, version INTEGER NOT NULL,
      assignee_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS orders_assignee ON work_orders(assignee_id, status);
    CREATE TABLE IF NOT EXISTS mutations(user_id TEXT NOT NULL REFERENCES users(id), id TEXT NOT NULL,
      hash TEXT NOT NULL, response TEXT NOT NULL, PRIMARY KEY(user_id,id));
    CREATE TABLE IF NOT EXISTS photos(id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES work_orders(id),
      mime TEXT NOT NULL, bytes BLOB NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, order_id TEXT NOT NULL,
      actor_id TEXT NOT NULL, action TEXT NOT NULL, at TEXT NOT NULL);
    INSERT OR IGNORE INTO migrations VALUES(1);
  `);
  const getOrder = (id: string): WorkOrder | undefined => {
    const row = db.prepare('SELECT data FROM work_orders WHERE id=?').get(id);
    return row ? JSON.parse(row.data as string) : undefined;
  };
  const getUser = (id: string): User | undefined => {
    return db.prepare('SELECT id,name,email,role FROM users WHERE id=?').get(id) as
      User | undefined;
  };
  function writeOrder(order: WorkOrder) {
    db.prepare(
      `INSERT INTO work_orders VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      version=excluded.version, assignee_id=excluded.assignee_id, status=excluded.status, data=excluded.data`,
    ).run(order.id, order.version, order.assignee.id, order.status, JSON.stringify(order));
  }
  function transaction<T>(fn: () => T): T {
    db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      db.exec('COMMIT');
      return value;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  function catalog(): Catalog {
    const row = db.prepare('SELECT data FROM catalog WHERE id=1').get();
    const data = row ? JSON.parse(row.data as string) : { sites: [], templates: [] };
    return {
      ...data,
      users: db.prepare('SELECT id,name,email,role FROM users ORDER BY name').all(),
    };
  }
  return { db, getOrder, getUser, writeOrder, transaction, catalog };
}
export type Store = ReturnType<typeof openStore>;
