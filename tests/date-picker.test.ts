import { expect, it } from 'vitest';
import { isInDueRange, isValidDueRange, localDate, parseLocalDate } from '../apps/web/src/dates';

it.each([
  '2028-02-29',
  '2000-02-29',
  '2026-03-08',
  '2026-11-01',
  '0001-01-01',
  '0099-12-31',
  '9999-12-31',
])('round trips the date-only value %s without year or UTC conversion', (value) => {
  const parsed = parseLocalDate(value);
  expect(parsed).toBeInstanceOf(Date);
  expect(localDate(parsed!)).toBe(value);
  expect(parsed!.getHours()).toBe(12);
});

it.each([
  '',
  '2026-02-29',
  '2100-02-29',
  '2026-04-31',
  '2026-00-01',
  '2026-13-01',
  '2026-01-00',
  '2026-01-32',
  '2026-1-01',
  '0000-01-01',
  '2026-10-22T00:00:00Z',
  ' 2026-10-22',
  'garbage',
])('rejects incomplete or impossible dates: %s', (value) => {
  expect(parseLocalDate(value)).toBeUndefined();
});

it('keeps inclusive and open-ended filters, and rejects invalid typed ranges', () => {
  expect(isInDueRange('2026-10-22', '2026-10-22', '2026-10-22')).toBe(true);
  expect(isInDueRange('2026-10-22', '', '2026-10-22')).toBe(true);
  expect(isInDueRange('2026-10-22', '2026-10-22', '')).toBe(true);
  expect(isValidDueRange('', '')).toBe(true);
  expect(isInDueRange('2026-10-22', '2026-02-30', '')).toBe(false);
  expect(isInDueRange('2026-10-22', '', 'invalid')).toBe(false);
  expect(isValidDueRange('2026-10-23', '2026-10-22')).toBe(false);
});
