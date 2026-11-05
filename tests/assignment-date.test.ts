import { expect, test } from 'vitest';
import { assignmentDate } from '../apps/mobile/assignment-date';

test('assignment dates keep the stored calendar day in each notebook language', () => {
  expect(assignmentDate('2028-02-29', 'en')).toBe('Feb 29, 2028');
  expect(assignmentDate('2028-02-29', 'id')).toBe('29 Feb 2028');
  expect(assignmentDate('2026-01-01', 'en')).toBe('Jan 1, 2026');
  expect(assignmentDate('2026-01-01', 'id')).toBe('1 Jan 2026');
  expect(assignmentDate('0000-01-01', 'en')).toBe('0000-01-01');
});
