import { downloadText } from './download-text';

function cell(value: string | number) {
  const text = String(value);
  // The leading tab marks formula-like values as text for spreadsheet viewing.
  const formula = /^[\s\u0000-\u001f]*[=+\-@＝＋－＠]/u.test(text) || /^[\t\r\n]/u.test(text);
  return `"${(formula ? `\t${text}` : text).replaceAll('"', '""')}"`;
}

export function formatCsv(rows: readonly (readonly (string | number)[])[]) {
  return '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function downloadCsv(filename: string, csv: string) {
  downloadText(filename, csv, 'text/csv;charset=utf-8');
}
