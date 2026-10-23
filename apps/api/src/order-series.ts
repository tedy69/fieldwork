import {
  OrderSeriesSummarySchema,
  OrderSeriesDetailSchema,
  OrderSeriesReceiptSchema,
  WorkOrderSchema,
} from '@fieldwork/contracts';
import type { Store } from './store';

const summarySelect = `SELECT s.id,
  json_extract(s.receipt,'$.createdAt') AS created_at,
  json_extract(s.input,'$.title') AS title,
  json_extract(s.input,'$.frequency') AS frequency,
  json_extract(s.input,'$.occurrences') AS occurrences,
  json_extract(s.input,'$.dueDate') AS first_due_date,
  json_extract(s.receipt,'$.orders[#-1].dueDate') AS last_due_date,
  json_extract(s.receipt,'$.orders[0].assignee.id') AS assignee_id,
  json_extract(s.receipt,'$.orders[0].assignee.name') AS assignee_name,
  u.id AS actor_id, u.name AS actor_name
  FROM order_series s JOIN users u ON u.id=s.actor_id`;

function summary(row: Record<string, unknown>) {
  return OrderSeriesSummarySchema.parse({
    id: row.id,
    createdAt: row.created_at,
    title: row.title,
    frequency: row.frequency,
    occurrences: row.occurrences,
    firstDueDate: row.first_due_date,
    lastDueDate: row.last_due_date,
    assignee: { id: row.assignee_id, name: row.assignee_name },
    createdBy: { id: row.actor_id, name: row.actor_name },
  });
}
export function createSeriesQueries(store: Store) {
  function list(limit: number, cursor?: string) {
    const before = cursor
      ? store.db
          .prepare(
            "SELECT json_extract(receipt,'$.createdAt') AS created_at FROM order_series WHERE id=?",
          )
          .get(cursor)
      : null;
    if (cursor && !before) return null;
    const boundary = before
      ? " WHERE (json_extract(s.receipt,'$.createdAt')<? OR (json_extract(s.receipt,'$.createdAt')=? AND s.id<?))"
      : '';
    const rows = store.db
      .prepare(
        `${summarySelect}${boundary}
      ORDER BY json_extract(s.receipt,'$.createdAt') DESC,s.id DESC LIMIT ?`,
      )
      .all(
        ...(before
          ? [before.created_at as string, before.created_at as string, cursor!, limit + 1]
          : [limit + 1]),
      );
    const data = rows.slice(0, limit).map(summary);
    return {
      data,
      total: store.db.prepare('SELECT COUNT(*) AS total FROM order_series').get()!.total as number,
      nextCursor: rows.length > limit ? data.at(-1)!.id : null,
    };
  }
  function detail(id: string) {
    const row = store.db.prepare(`${summarySelect} WHERE s.id=?`).get(id);
    if (!row) return null;
    const saved = store.db.prepare('SELECT receipt FROM order_series WHERE id=?').get(id)!;
    const receipt = OrderSeriesReceiptSchema.parse(JSON.parse(saved.receipt as string));
    const members = store.db
      .prepare(
        `SELECT m.occurrence,w.data FROM order_series_members m
      JOIN work_orders w ON w.id=m.order_id WHERE m.series_id=? ORDER BY m.occurrence`,
      )
      .all(id);
    if (receipt.id !== id || members.length !== receipt.orders.length)
      throw new Error('The recurring batch membership is incomplete.');
    const orders = members.map((member, index) => {
      const order = WorkOrderSchema.parse(JSON.parse(member.data as string));
      const original = receipt.orders[index];
      if (member.occurrence !== index + 1 || original.id !== order.id)
        throw new Error('The recurring batch membership does not match its receipt.');
      return { occurrence: index + 1, plannedDueDate: original.dueDate, order };
    });
    return OrderSeriesDetailSchema.parse({ ...summary(row), orders });
  }
  return { list, detail };
}
