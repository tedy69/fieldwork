import { type WorkOrder, answerLabel, reportItemLabel } from '@fieldwork/contracts';
import { formatCsv } from './csv';

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
        reportItemLabel(order.template, answer.itemId),
        answer.value === 'text' || answer.value === 'number' ? answerLabel(answer) : answer.value,
        answer.note,
        report.photos.length,
      ]);
  }
  return formatCsv(rows);
}
