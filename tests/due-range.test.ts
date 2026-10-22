import { expect, it } from 'vitest';
import { isInDueRange } from '../apps/web/src/dates';

it.each([
  ['2026-10-20', '', '', true],
  ['2026-10-20', '2026-10-21', '', false],
  ['2026-10-21', '2026-10-21', '', true],
  ['2026-10-23', '', '2026-10-22', false],
  ['2026-10-22', '', '2026-10-22', true],
  ['2026-10-22', '2026-10-22', '2026-10-22', true],
  ['2026-10-21', '2026-10-21', '2026-10-23', true],
  ['2026-10-23', '2026-10-21', '2026-10-23', true],
  ['2026-10-22', '2026-10-23', '2026-10-21', false],
  ['2027-01-01', '2026-12-31', '2027-01-02', true],
  ['2028-02-29', '2028-02-28', '2028-03-01', true],
] as const)('matches due date %s in %s through %s: %s', (date, from, through, expected) => {
  expect(isInDueRange(date, from, through)).toBe(expected);
});
