import { expect, it } from 'vitest';
import { addDays, monthDates, shiftMonth, weekDates } from '../apps/web/src/calendar';

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

it.each([
  ['2026-10-23', 31, '2026-10-01', '2026-10-31'],
  ['2026-04-30', 30, '2026-04-01', '2026-04-30'],
  ['2027-02-28', 28, '2027-02-01', '2027-02-28'],
  ['2028-02-29', 29, '2028-02-01', '2028-02-29'],
  ['2000-02-29', 29, '2000-02-01', '2000-02-29'],
  ['2100-02-28', 28, '2100-02-01', '2100-02-28'],
  ['2026-03-08', 31, '2026-03-01', '2026-03-31'],
  ['2026-11-01', 30, '2026-11-01', '2026-11-30'],
  ['0001-01-01', 31, '0001-01-01', '0001-01-31'],
  ['9999-12-31', 31, '9999-12-01', '9999-12-31'],
] as const)('finds every day in the month containing %s', (anchor, length, first, last) => {
  const dates = monthDates(anchor);
  expect(dates).toHaveLength(length);
  expect(new Set(dates).size).toBe(length);
  expect(dates[0]).toBe(first);
  expect(dates.at(-1)).toBe(last);
  expect(dates).toContain(anchor);
  expect(dates.every((date, index) => date === addDays(first, index))).toBe(true);
});

it.each([
  ['2026-01-31', 1, '2026-02-01'],
  ['2028-01-31', 1, '2028-02-01'],
  ['2028-03-31', -1, '2028-02-01'],
  ['2026-12-31', 1, '2027-01-01'],
  ['2027-01-01', -1, '2026-12-01'],
  ['2026-10-23', 12, '2027-10-01'],
])('moves months from %s without skipping short months', (anchor, months, first) => {
  expect(shiftMonth(anchor, Number(months))).toBe(first);
});
