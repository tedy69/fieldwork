import { describe, expect, it } from 'vitest';
import { RecurrenceSchema, recurrenceDates, recurrenceDatesThrough } from '@fieldwork/contracts';

describe('monthly calendar rules', () => {
  it.each([
    ['2027-01-31', ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31']],
    ['2028-01-31', ['2028-01-31', '2028-02-29', '2028-03-31']],
    ['2027-01-30', ['2027-01-30', '2027-02-28', '2027-03-30']],
    ['2027-02-28', ['2027-02-28', '2027-03-28', '2027-04-28']],
    ['2028-02-29', ['2028-02-29', '2028-03-29', '2028-04-29']],
    ['2026-12-31', ['2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31']],
    ['1900-01-31', ['1900-01-31', '1900-02-28', '1900-03-31']],
    ['2000-01-31', ['2000-01-31', '2000-02-29', '2000-03-31']],
    ['0000-01-31', ['0000-01-31', '0000-02-29', '0000-03-31']],
    ['0099-12-31', ['0099-12-31', '0100-01-31', '0100-02-28', '0100-03-31']],
    ['2027-03-14', ['2027-03-14', '2027-04-14', '2027-05-14']],
  ])('keeps the original calendar day from %s without overflow or drift', (dueDate, dates) => {
    expect(recurrenceDates({ dueDate, frequency: 'monthly', occurrences: dates.length })).toEqual(
      dates,
    );
  });

  it('supports 52 distinct occurrences and restores the original day after each February', () => {
    const dates = recurrenceDates({ dueDate: '2026-12-31', frequency: 'monthly', occurrences: 52 });
    expect(new Set(dates).size).toBe(52);
    expect(dates.at(-1)).toBe('2031-03-31');
    expect(dates).toContain('2028-02-29');
    expect(dates).toContain('2028-03-31');
    expect(dates).toContain('2029-02-28');
    expect(dates).toContain('2029-03-31');
  });

  it('accepts the last supported month and rejects batches crossing the year boundary', () => {
    expect(
      recurrenceDates({ dueDate: '9999-11-30', frequency: 'monthly', occurrences: 2 }),
    ).toEqual(['9999-11-30', '9999-12-30']);
    for (const dueDate of ['9999-12-01', '9999-12-31', '2027-02-29', 'invalid'])
      expect(
        RecurrenceSchema.safeParse({ dueDate, frequency: 'monthly', occurrences: 2 }).success,
      ).toBe(false);
  });

  it.each([1, 53, 2.5, NaN, Infinity, 1e15])('rejects an invalid count %s', (occurrences) => {
    expect(
      RecurrenceSchema.safeParse({ dueDate: '2027-01-31', frequency: 'monthly', occurrences })
        .success,
    ).toBe(false);
  });
});

describe('quarterly calendar rules', () => {
  it.each([
    ['2026-08-31', ['2026-08-31', '2026-11-30', '2027-02-28', '2027-05-31']],
    ['2027-08-31', ['2027-08-31', '2027-11-30', '2028-02-29', '2028-05-31']],
    ['9999-09-30', ['9999-09-30', '9999-12-30']],
  ])('keeps the original day every three months from %s', (dueDate, dates) => {
    expect(recurrenceDates({ dueDate, frequency: 'quarterly', occurrences: dates.length })).toEqual(
      dates,
    );
  });

  it('skips a candidate without changing the original day or quarter', () => {
    expect(
      recurrenceDates({
        dueDate: '2026-08-31',
        frequency: 'quarterly',
        occurrences: 3,
        skipDates: ['2026-11-30', '2027-01-31'],
      }),
    ).toEqual(['2026-08-31', '2027-02-28', '2027-05-31']);
  });
});

describe('first weekday of month calendar rules', () => {
  it('moves weekend starts to Monday and keeps weekday starts across years', () => {
    expect(
      recurrenceDates({
        dueDate: '2026-08-03',
        frequency: 'month-start-weekday',
        occurrences: 6,
      }),
    ).toEqual(['2026-08-03', '2026-09-01', '2026-10-01', '2026-11-02', '2026-12-01', '2027-01-01']);
  });

  it.each(['2026-08-01', '2026-08-02', '2026-08-04'])('rejects %s as the first date', (dueDate) => {
    expect(() =>
      recurrenceDates({ dueDate, frequency: 'month-start-weekday', occurrences: 2 }),
    ).toThrow('Choose the first weekday of a month for the first visit.');
  });

  it('skips a closure and includes the cutoff without shifting later visits', () => {
    expect(
      recurrenceDatesThrough(
        {
          dueDate: '2026-08-03',
          frequency: 'month-start-weekday',
          skipDates: ['2026-09-01'],
        },
        '2026-11-02',
      ),
    ).toEqual(['2026-08-03', '2026-10-01', '2026-11-02']);
  });
});

describe('month-end calendar rules', () => {
  it.each([
    ['2027-02-28', ['2027-02-28', '2027-03-31', '2027-04-30']],
    ['2028-02-29', ['2028-02-29', '2028-03-31', '2028-04-30']],
    ['9999-11-30', ['9999-11-30', '9999-12-31']],
  ])('uses the last day of each month from %s', (dueDate, dates) => {
    expect(recurrenceDates({ dueDate, frequency: 'month-end', occurrences: dates.length })).toEqual(
      dates,
    );
  });

  it('requires a month-end start and applies skips within an inclusive end date', () => {
    expect(() =>
      recurrenceDates({ dueDate: '2028-02-28', frequency: 'month-end', occurrences: 2 }),
    ).toThrow('Choose the last day of a month');
    expect(
      recurrenceDatesThrough(
        { dueDate: '2028-02-29', frequency: 'month-end', skipDates: ['2028-03-31'] },
        '2028-04-30',
      ),
    ).toEqual(['2028-02-29', '2028-04-30']);
  });
});

describe('last weekday of month calendar rules', () => {
  it('moves Saturday and Sunday month ends back to Friday', () => {
    expect(
      recurrenceDates({
        dueDate: '2026-10-30',
        frequency: 'month-end-weekday',
        occurrences: 5,
      }),
    ).toEqual(['2026-10-30', '2026-11-30', '2026-12-31', '2027-01-29', '2027-02-26']);
  });

  it.each(['2026-10-29', '2026-10-31'])('rejects %s as the first date', (dueDate) => {
    expect(() =>
      recurrenceDates({ dueDate, frequency: 'month-end-weekday', occurrences: 2 }),
    ).toThrow('Choose the last weekday of a month for the first visit.');
  });

  it('skips a closure and includes the cutoff without shifting later visits', () => {
    expect(
      recurrenceDatesThrough(
        {
          dueDate: '2026-10-30',
          frequency: 'month-end-weekday',
          skipDates: ['2026-11-30'],
        },
        '2027-01-29',
      ),
    ).toEqual(['2026-10-30', '2026-12-31', '2027-01-29']);
  });
});
