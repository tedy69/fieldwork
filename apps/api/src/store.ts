import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import {
  WorkOrderSchema,
  ReportSnapshotSchema,
  ReportRevisionSchema,
  type User,
  type WorkOrder,
  type Catalog,
  type ReportRevision,
} from '@fieldwork/contracts';

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
  function insertRevision(
    order: WorkOrder,
    submissionVersion: number | null,
    source: ReportRevision['source'],
    reviewStatus: ReportRevision['reviewStatus'],
    ignoreExisting = false,
  ) {
    const snapshot = ReportSnapshotSchema.parse(order);
    db.prepare(
      `${ignoreExisting ? 'INSERT OR IGNORE' : 'INSERT'} INTO report_revisions(order_id,report_id,submission_version,source,snapshot,review_status,review) VALUES(?,?,?,?,?,?,?)`,
    ).run(
      order.id,
      snapshot.report.id,
      submissionVersion,
      source,
      JSON.stringify(snapshot),
      reviewStatus,
      order.review && reviewStatus === 'reviewed' ? JSON.stringify(order.review) : null,
    );
  }
  function recordSubmission(order: WorkOrder) {
    insertRevision(order, order.version, 'submission', 'awaiting_review');
  }
  function recordReview(order: WorkOrder) {
    if (!order.report || !order.review) throw new Error('A saved report and review are required.');
    const result = db
      .prepare(
        "UPDATE report_revisions SET review=?,review_status='reviewed' WHERE order_id=? AND report_id=?",
      )
      .run(JSON.stringify(order.review), order.id, order.report.id);
    if (result.changes !== 1) throw new Error('The saved report revision is missing.');
  }
  function reportHistory(orderId: string, limit: number, cursor?: string) {
    const before = cursor
      ? db
          .prepare('SELECT sequence FROM report_revisions WHERE order_id=? AND report_id=?')
          .get(orderId, cursor)
      : null;
    if (cursor && !before) return null;
    const rows = db
      .prepare(
        `SELECT * FROM report_revisions WHERE order_id=?${before ? ' AND sequence<?' : ''} ORDER BY sequence DESC LIMIT ?`,
      )
      .all(...(before ? [orderId, before.sequence as number, limit + 1] : [orderId, limit + 1]));
    const data = rows.slice(0, limit).map((row) =>
      ReportRevisionSchema.parse({
        snapshot: JSON.parse(row.snapshot as string),
        submissionVersion: row.submission_version,
        source: row.source,
        reviewStatus: row.review_status,
        review: row.review ? JSON.parse(row.review as string) : null,
      }),
    );
    const total = db
      .prepare('SELECT COUNT(*) AS count FROM report_revisions WHERE order_id=?')
      .get(orderId)!.count as number;
    return {
      data,
      total,
      nextCursor: rows.length > limit ? data.at(-1)!.snapshot.report.id : null,
    };
  }
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
  try {
    if (!db.prepare('SELECT version FROM migrations WHERE version=2').get())
      transaction(() => {
        db.exec(`
        CREATE TABLE report_revisions(
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id TEXT NOT NULL REFERENCES work_orders(id),
          report_id TEXT NOT NULL,
          submission_version INTEGER CHECK(submission_version IS NULL OR submission_version>0),
          source TEXT NOT NULL CHECK(source IN ('submission','saved_snapshot')),
          snapshot TEXT NOT NULL,
          review_status TEXT NOT NULL CHECK(review_status IN ('awaiting_review','reviewed','not_retained')),
          review TEXT,
          UNIQUE(order_id,report_id)
        );
        CREATE INDEX report_revisions_order ON report_revisions(order_id,sequence DESC);
      `);
        for (const row of db
          .prepare(
            "SELECT response FROM mutations ORDER BY json_extract(response,'$.version'),user_id,id",
          )
          .iterate()) {
          const acknowledged = WorkOrderSchema.parse(JSON.parse(row.response as string));
          if (acknowledged.report && getOrder(acknowledged.id))
            insertRevision(acknowledged, acknowledged.version, 'submission', 'not_retained', true);
        }
        for (const row of db.prepare('SELECT data FROM work_orders').iterate()) {
          const order = WorkOrderSchema.parse(JSON.parse(row.data as string));
          if (!order.report) continue;
          const existing = db
            .prepare('SELECT report_id FROM report_revisions WHERE order_id=? AND report_id=?')
            .get(order.id, order.report.id);
          if (!existing) insertRevision(order, null, 'saved_snapshot', 'not_retained');
          if (order.review) recordReview(order);
          else if (order.status === 'SUBMITTED')
            db.prepare(
              "UPDATE report_revisions SET review_status='awaiting_review' WHERE order_id=? AND report_id=?",
            ).run(order.id, order.report.id);
        }
        db.prepare('INSERT INTO migrations VALUES(2)').run();
      });
    if (!db.prepare('SELECT version FROM migrations WHERE version=3').get())
      transaction(() => {
        db.exec(`
          CREATE TABLE order_series(
            id TEXT PRIMARY KEY,
            actor_id TEXT NOT NULL REFERENCES users(id),
            mutation_id TEXT NOT NULL,
            hash TEXT NOT NULL,
            input TEXT NOT NULL,
            receipt TEXT NOT NULL,
            UNIQUE(actor_id,mutation_id)
          );
          CREATE TABLE order_series_members(
            series_id TEXT NOT NULL REFERENCES order_series(id),
            order_id TEXT NOT NULL UNIQUE REFERENCES work_orders(id),
            occurrence INTEGER NOT NULL CHECK(occurrence BETWEEN 1 AND 52),
            PRIMARY KEY(series_id,occurrence)
          );
          INSERT INTO migrations VALUES(3);
        `);
      });
  } catch (error) {
    db.close();
    throw error;
  }
  return {
    db,
    getOrder,
    getUser,
    writeOrder,
    transaction,
    catalog,
    recordSubmission,
    recordReview,
    reportHistory,
  };
}
export type Store = ReturnType<typeof openStore>;
