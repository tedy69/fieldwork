import { expect, it } from 'vitest';
import { addDays, weekDates } from '../apps/web/src/calendar';

it.each([
  ['2026-10-19', '2026-10-19', '2026-10-25'],
  ['2026-10-22', '2026-10-19', '2026-10-25'],
  ['2026-10-25', '2026-10-19', '2026-10-25'],
  ['2027-01-01', '2026-12-28', '2027-01-03'],
  ['2028-02-29', '2028-02-28', '2028-03-05'],
  ['2026-03-08', '2026-03-02', '2026-03-08'],
  ['2026-11-01', '2026-10-26', '2026-11-01'],
])('finds the Monday-to-Sunday week for %s', (date, start, end) => {
  const dates = weekDates(date);
  expect(dates).toHaveLength(7);
  expect(new Set(dates).size).toBe(7);
  expect(dates[0]).toBe(start);
  expect(dates[6]).toBe(end);
  expect(dates).toContain(date);
});

it.each([
  ['2026-03-07', 2, '2026-03-09'],
  ['2026-11-01', -1, '2026-10-31'],
  ['2026-12-28', 7, '2027-01-04'],
  ['2028-02-28', 1, '2028-02-29'],
])('moves calendar days from %s by %s', (date, days, expected) => {
  expect(addDays(date, Number(days))).toBe(expected);
});
