import type { WorkOrder } from '@fieldwork/contracts';

const encoder = new TextEncoder();

function escapeText(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replaceAll('\\', '\\\\')
    .replace(/\r\n?|\n/g, '\\n')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,');
}

function fold(line: string) {
  if (encoder.encode(line).length <= 75) return line;
  const rows: string[] = [];
  let row = '';
  let bytes = 0;
  for (const character of line) {
    const width = encoder.encode(character).length;
    if (bytes + width > 75) {
      rows.push(row);
      row = ' ';
      bytes = 1;
    }
    row += character;
    bytes += width;
  }
  return [...rows, row].join('\r\n');
}

export function formatScheduleCalendar(
  orders: readonly Pick<WorkOrder, 'id' | 'reference' | 'title' | 'site' | 'dueDate'>[],
  now = new Date(),
) {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Fieldwork//Work order schedule//EN',
    ...orders.flatMap((order) => [
      'BEGIN:VEVENT',
      `UID:${escapeText(order.id)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${order.dueDate.replaceAll('-', '')}`,
      `SUMMARY:${escapeText(`${order.reference} ${order.title}`)}`,
      `LOCATION:${escapeText(order.site.name)}`,
      'TRANSP:TRANSPARENT',
      'CLASS:PRIVATE',
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
    '',
  ]
    .map(fold)
    .join('\r\n');
}
