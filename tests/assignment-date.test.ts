import { expect, test } from 'vitest';
import { assignmentDate } from '../apps/mobile/assignment-date';
import { isOpenDueBetween, isUrgentOpenOrder, nextSevenDaysEnd } from '@fieldwork/contracts';

test('assignment dates keep the stored calendar day in each notebook language', () => {
  expect(assignmentDate('2028-02-29', 'en')).toBe('Feb 29, 2028');
  expect(assignmentDate('2028-02-29', 'id')).toBe('29 Feb 2028');
  expect(assignmentDate('2026-01-01', 'en')).toBe('Jan 1, 2026');
  expect(assignmentDate('2026-01-01', 'id')).toBe('1 Jan 2026');
  expect(assignmentDate('0000-01-01', 'en')).toBe('0000-01-01');
});

test('the next seven days include today and the sixth day across a calendar boundary', () => {
  expect(nextSevenDaysEnd('2028-02-26')).toBe('2028-03-03');
  expect(nextSevenDaysEnd('2026-12-28')).toBe('2027-01-03');
  expect(nextSevenDaysEnd('9999-12-30')).toBe('9999-12-31');
  const today = '2026-12-28';
  const through = nextSevenDaysEnd(today);
  expect(isOpenDueBetween({ status: 'ASSIGNED', dueDate: today }, today, through)).toBe(true);
  expect(isOpenDueBetween({ status: 'CHANGES_REQUESTED', dueDate: through }, today, through)).toBe(
    true,
  );
  expect(isOpenDueBetween({ status: 'APPROVED', dueDate: through }, today, through)).toBe(false);
  expect(isOpenDueBetween({ status: 'ASSIGNED', dueDate: '2026-12-27' }, today, through)).toBe(
    false,
  );
  expect(isOpenDueBetween({ status: 'ASSIGNED', dueDate: '2027-01-04' }, today, through)).toBe(
    false,
  );
});

test('urgent work includes open reports and excludes approved or routine assignments', () => {
  expect(isUrgentOpenOrder({ priority: 'urgent', status: 'ASSIGNED' })).toBe(true);
  expect(isUrgentOpenOrder({ priority: 'urgent', status: 'CHANGES_REQUESTED' })).toBe(true);
  expect(isUrgentOpenOrder({ priority: 'urgent', status: 'SUBMITTED' })).toBe(true);
  expect(isUrgentOpenOrder({ priority: 'urgent', status: 'APPROVED' })).toBe(false);
  expect(isUrgentOpenOrder({ priority: 'routine', status: 'ASSIGNED' })).toBe(false);
});
