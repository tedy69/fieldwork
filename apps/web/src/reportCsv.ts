import type { WorkOrder } from '@fieldwork/contracts';

function cell(value: string | number) {
  const text = String(value);
  // The leading tab marks formula-like values as text for spreadsheet viewing.
  const formula = /^[\s\u0000-\u001f]*[=+\-@＝＋－＠]/u.test(text) || /^[\t\r\n]/u.test(text);
  return `"${(formula ? `\t${text}` : text).replaceAll('"', '""')}"`;
}

export function reportCsv(orders: WorkOrder[]) {
  const rows: (string | number)[][] = [
    [
      'Reference',
      'Work order',
      'Site',
      'Site address',
      'Assigned to',
      'Due date',
      'Status',
      'Submitted at (UTC)',
      'Submitted by (user ID)',
      'Summary',
      'Review decision',
      'Review note',
      'Reviewed at (UTC)',
      'Reviewed by',
      'Checklist item',
      'Result',
      'Item note',
      'Photo count',
    ],
  ];
  for (const order of orders) {
    if (!order.report) continue;
    const report = order.report;
    const items = new Map(order.template.items.map((item) => [item.id, item.label]));
    for (const answer of report.answers)
      rows.push([
        order.reference,
        order.title,
        order.site.name,
        order.site.address,
        order.assignee.name,
        order.dueDate,
        order.status,
        report.submittedAt,
        report.submittedBy,
        report.summary,
        order.review?.decision ?? '',
        order.review?.note ?? '',
        order.review?.reviewedAt ?? '',
        order.review?.reviewedBy ?? '',
        items.get(answer.itemId) ?? answer.itemId,
        answer.value,
        answer.note,
        report.photos.length,
      ]);
  }
  return '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
