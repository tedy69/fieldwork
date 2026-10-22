import { expect, it } from 'vitest';
import type { WorkOrder } from '@fieldwork/contracts';
import { reportCsv } from '../apps/web/src/reportCsv';

const order = (): WorkOrder => ({
  id: 'order',
  reference: 'FW-001',
  title: 'Inspect "Valve", North',
  instructions: 'not exported',
  site: { id: 'site', name: 'Stasiun 東京', address: '12 Demo Road' },
  assignee: { id: 'worker', name: 'Sam', email: 'private@example.com', role: 'worker' },
  template: {
    id: 'template',
    name: 'Safety',
    items: [
      { id: 'access', label: 'Access route' },
      { id: 'gate', label: 'Gate' },
    ],
  },
  dueDate: '2026-10-22',
  priority: 'routine',
  status: 'APPROVED',
  version: 3,
  createdAt: '2026-10-20T00:00:00Z',
  report: {
    id: 'report',
    submittedAt: '2026-10-21T01:00:00Z',
    submittedBy: 'worker',
    summary: 'Résumé\nLine two',
    answers: [
      { itemId: 'access', value: 'pass', note: 'Clear' },
      { itemId: 'gate', value: 'fail', note: 'Needs repair' },
    ],
    photos: [{ id: 'private-photo-id', mimeType: 'image/png' }],
  },
  review: {
    decision: 'APPROVED',
    note: 'Reviewed',
    reviewedAt: '2026-10-21T02:00:00Z',
    reviewedBy: 'Alex',
  },
});

it('exports checklist rows with quoted Unicode text and only the intended report fields', () => {
  const report = Object.assign(order(), { token: 'secret-token', unrelatedDraft: 'secret-draft' });
  const assigned = { ...order(), title: 'Unsubmitted order', report: null };
  const before = structuredClone([report, assigned]);
  const csv = reportCsv([report, assigned]);
  expect(csv.startsWith('\uFEFF"Reference","Work order"')).toBe(true);
  expect(csv).toContain('"Inspect ""Valve"", North","Stasiun 東京"');
  expect(csv).toContain('"Résumé\nLine two"');
  expect(csv).toContain('"Access route","pass","Clear","1"\r\n');
  expect(csv).toContain('"Gate","fail","Needs repair","1"\r\n');
  expect(csv).toContain('"APPROVED","Reviewed","2026-10-21T02:00:00Z","Alex"');
  expect(csv.split('\r\n')).toHaveLength(4);
  for (const value of [
    'Unsubmitted order',
    'secret-token',
    'secret-draft',
    'private-photo-id',
    'private@example.com',
    'not exported',
  ])
    expect(csv).not.toContain(value);
  expect([report, assigned]).toEqual(before);
});

it.each([
  '=1+1',
  '+SUM(A1)',
  '-1+2',
  '@SUM(A1)',
  '\t=1+1',
  '\r=1+1',
  '\n=1+1',
  '＝1+1',
  '＋1+1',
  '－1+1',
  '＠SUM(A1)',
  '   =1+1',
])('marks formula-like text as spreadsheet text: %j', (title) => {
  const report = order();
  report.title = title;
  expect(reportCsv([report])).toContain(`"\t${title}"`);
});

it('exports only a header when no orders have a submitted report', () => {
  expect(reportCsv([{ ...order(), report: null }])).toBe(reportCsv([]));
  expect(reportCsv([]).split('\r\n')).toHaveLength(2);
});
