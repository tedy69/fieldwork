import { describe, expect, it } from 'vitest';
import { RecurrenceSchema, recurrenceDates } from '@fieldwork/contracts';

describe('weekday calendar rules', () => {
  it.each([
    [
      '2026-12-25',
      [
        '2026-12-25',
        '2026-12-28',
        '2026-12-29',
        '2026-12-30',
        '2026-12-31',
        '2027-01-01',
        '2027-01-04',
      ],
    ],
    ['2026-03-06', ['2026-03-06', '2026-03-09', '2026-03-10']],
    ['2026-10-30', ['2026-10-30', '2026-11-02', '2026-11-03']],
    ['2028-02-28', ['2028-02-28', '2028-02-29', '2028-03-01']],
    ['1900-02-28', ['1900-02-28', '1900-03-01', '1900-03-02']],
    ['2000-02-28', ['2000-02-28', '2000-02-29', '2000-03-01']],
  ])(
    'skips weekends from %s without skipping holidays or changing the first date',
    (dueDate, dates) => {
      expect(
        recurrenceDates({ dueDate, frequency: 'weekdays', occurrences: dates.length }),
      ).toEqual(dates);
    },
  );
  it.each(['2026-12-26', '2026-12-27'])('rejects a weekend first date %s', (dueDate) => {
    const parsed = RecurrenceSchema.safeParse({ dueDate, frequency: 'weekdays', occurrences: 3 });
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(parsed.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['dueDate'],
            message: 'Choose a Monday–Friday first date for weekday repeats.',
          }),
        ]),
      );
  });
  it('supports 52 distinct weekday occurrences across a year boundary', () => {
    const dates = recurrenceDates({
      dueDate: '2026-12-25',
      frequency: 'weekdays',
      occurrences: 52,
    });
    expect(dates).toHaveLength(52);
    expect(new Set(dates).size).toBe(52);
    expect(dates.at(-1)).toBe('2027-03-08');
    for (const date of dates)
      expect([0, 6]).not.toContain(new Date(`${date}T12:00:00Z`).getUTCDay());
  });
  it.each([1, 53, 1e15, -1e15, 2.5, Infinity, NaN])(
    'rejects count %s without iterating over an invalid batch',
    (occurrences) => {
      expect(
        RecurrenceSchema.safeParse({ dueDate: '2026-12-25', frequency: 'weekdays', occurrences })
          .success,
      ).toBe(false);
    },
  );
  it('rejects overflow after skipping a weekend near the last supported year', () => {
    expect(() =>
      recurrenceDates({ dueDate: '9999-12-31', frequency: 'weekdays', occurrences: 2 }),
    ).toThrow();
    expect(
      recurrenceDates({ dueDate: '9999-12-30', frequency: 'weekdays', occurrences: 2 }),
    ).toEqual(['9999-12-30', '9999-12-31']);
  });
});
