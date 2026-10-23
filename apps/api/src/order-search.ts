import type { User, WorkOrder, OrderSearchQuerySchema } from '@fieldwork/contracts';
import type { z } from 'zod';
import type { Store } from './store';

export function createOrderSearch(store: Store) {
  store.db.function('fieldwork_contains', { deterministic: true }, (value, needle) =>
    String(value ?? '')
      .normalize('NFC')
      .toLowerCase()
      .includes(
        String(needle ?? '')
          .normalize('NFC')
          .toLowerCase(),
      )
      ? 1
      : 0,
  );
  return (actor: User, query: z.infer<typeof OrderSearchQuerySchema>) => {
    const conditions = ['1=1'];
    const params: string[] = [];
    const filter = (condition: string, value: string) => {
      conditions.push(condition);
      params.push(value);
    };
    if (actor.role === 'worker') filter('assignee_id=?', actor.id);
    if (query.status) filter('status=?', query.status);
    if (query.assigneeId) filter('assignee_id=?', query.assigneeId);
    if (query.priority) filter("json_extract(data,'$.priority')=?", query.priority);
    if (query.dueFrom) filter("json_extract(data,'$.dueDate')>=?", query.dueFrom);
    if (query.dueThrough) filter("json_extract(data,'$.dueDate')<=?", query.dueThrough);
    if (query.overdueBefore) {
      conditions.push("status<>'APPROVED'");
      filter("json_extract(data,'$.dueDate')<?", query.overdueBefore);
    }
    if (query.q)
      filter(
        "fieldwork_contains(json_extract(data,'$.title') || ' ' || json_extract(data,'$.reference') || ' ' || json_extract(data,'$.site.name') || ' ' || json_extract(data,'$.assignee.name'),?)=1",
        query.q,
      );
    const where = conditions.join(' AND ');
    const cursor = query.cursor
      ? store.db
          .prepare(
            `SELECT id,json_extract(data,'$.createdAt') AS created_at FROM work_orders WHERE ${where} AND id=?`,
          )
          .get(...params, query.cursor)
      : null;
    if (query.cursor && !cursor) return null;
    const total = store.db
      .prepare(`SELECT COUNT(*) AS count FROM work_orders WHERE ${where}`)
      .get(...params)!.count as number;
    const boundary = cursor
      ? " AND (json_extract(data,'$.createdAt')<? OR (json_extract(data,'$.createdAt')=? AND id<?))"
      : '';
    const paging = cursor
      ? [cursor.created_at as string, cursor.created_at as string, cursor.id as string]
      : [];
    const rows = store.db
      .prepare(
        `SELECT data FROM work_orders WHERE ${where}${boundary} ORDER BY json_extract(data,'$.createdAt') DESC,id DESC LIMIT ?`,
      )
      .all(...params, ...paging, query.limit + 1);
    const data = rows
      .slice(0, query.limit)
      .map((row) => JSON.parse(row.data as string) as WorkOrder);
    return { data, total, nextCursor: rows.length > query.limit ? data.at(-1)!.id : null };
  };
}
