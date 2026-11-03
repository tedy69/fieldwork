import { describe, expect, it } from 'vitest';
import { RecurrenceSchema, recurrenceDates } from '@fieldwork/contracts';

describe('explicit recurring date exclusions', () => {
  it.each([
    {
      frequency: 'daily',
      dueDate: '2026-12-28',
      skipDates: ['2026-12-29', '2026-12-30'],
      expected: ['2026-12-28', '2026-12-31', '2027-01-01'],
    },
    {
      frequency: 'weekly',
      dueDate: '2026-12-28',
      skipDates: ['2027-01-04'],
      expected: ['2026-12-28', '2027-01-11', '2027-01-18'],
    },
    {
      frequency: 'weekdays',
      dueDate: '2026-12-25',
      skipDates: ['2026-12-26', '2026-12-28'],
      expected: ['2026-12-25', '2026-12-29', '2026-12-30'],
    },
    {
      frequency: 'monthly',
      dueDate: '2027-01-31',
      skipDates: ['2027-02-28'],
      expected: ['2027-01-31', '2027-03-31', '2027-04-30'],
    },
    {
      frequency: 'monthly',
      dueDate: '2028-01-31',
      skipDates: ['2028-02-29', '2028-03-31'],
      expected: ['2028-01-31', '2028-04-30', '2028-05-31'],
    },
  ] as const)(
    'keeps the count and original anchor for $frequency from $dueDate',
    ({ frequency, dueDate, skipDates, expected }) => {
      expect(
        recurrenceDates({ frequency, dueDate, skipDates: [...skipDates], occurrences: 3 }),
      ).toEqual(expected);
    },
  );

  it('keeps unused future dates harmless and treats exclusions as a set', () => {
    const schedule = { dueDate: '2026-12-28', frequency: 'daily' as const, occurrences: 3 };
    const dates = ['2027-02-01', '2026-12-30', '2026-12-29'];
    expect(recurrenceDates({ ...schedule, skipDates: dates })).toEqual(
      recurrenceDates({ ...schedule, skipDates: [...dates].reverse() }),
    );
    expect(recurrenceDates({ ...schedule, skipDates: ['2027-02-01'] })).toEqual(
      recurrenceDates(schedule),
    );
    expect(RecurrenceSchema.parse(schedule)).not.toHaveProperty('skipDates');
    expect(recurrenceDates({ ...schedule, skipDates: [] })).toEqual(recurrenceDates(schedule));
  });

  it('supports the maximum batch and 52 consecutive closures with bounded iteration', () => {
    const skipDates = Array.from({ length: 52 }, (_, index) => {
      const date = new Date('2027-01-02T12:00:00Z');
      date.setUTCDate(date.getUTCDate() + index);
      return date.toISOString().slice(0, 10);
    });
    const dates = recurrenceDates({
      dueDate: '2027-01-01',
      frequency: 'daily',
      occurrences: 52,
      skipDates,
    });
    expect(dates).toHaveLength(52);
    expect(new Set(dates).size).toBe(52);
    expect(dates[0]).toBe('2027-01-01');
    expect(dates[1]).toBe('2027-02-23');
    expect(dates.at(-1)).toBe('2027-04-14');
    expect(dates.some((date) => skipDates.includes(date))).toBe(false);
  });

  it.each([
    ['2026-12-28'],
    ['2026-12-27'],
    ['invalid'],
    ['2027-02-29'],
    ['2026-12-29', '2026-12-29'],
    Array.from({ length: 53 }, () => '2027-01-01'),
  ])('rejects invalid exclusions %j', (...skipDates) => {
    expect(
      RecurrenceSchema.safeParse({
        dueDate: '2026-12-28',
        frequency: 'daily',
        occurrences: 3,
        skipDates,
      }).success,
    ).toBe(false);
  });

  it('rejects overflow introduced by skipping a final supported date', () => {
    expect(() =>
      recurrenceDates({
        dueDate: '9999-12-30',
        frequency: 'daily',
        occurrences: 2,
        skipDates: ['9999-12-31'],
      }),
    ).toThrow();
    expect(
      recurrenceDates({
        dueDate: '9999-12-29',
        frequency: 'daily',
        occurrences: 2,
        skipDates: ['9999-12-30'],
      }),
    ).toEqual(['9999-12-29', '9999-12-31']);
  });
});
