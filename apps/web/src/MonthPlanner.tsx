import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { WorkOrder } from '@fieldwork/contracts';
import { languageTags, type Locale } from '@fieldwork/strings';
import { Button } from './components/ui/button';
import { IconButton } from './components/ui/icon-button';
import { CaretLeftIcon } from '@phosphor-icons/react/dist/csr/CaretLeft';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { calendarLabel, monthDates, monthLabel, shiftMonth, weekDates } from './calendar';
import { workerPlannerCopy } from './worker-planner-copy';
import './month-planner.css';

export default function MonthPlanner({
  anchor,
  today,
  day,
  orders,
  locale = 'en',
  onMonth,
  onDay,
}: {
  anchor: string;
  today: string;
  day: string;
  orders: WorkOrder[];
  locale?: Locale;
  onMonth: (date: string) => void;
  onDay: (date: string) => void;
}) {
  const dates = monthDates(anchor);
  const copy = workerPlannerCopy[locale];
  const dateLocale = languageTags[locale];
  const offset = (new Date(`${dates[0]}T12:00:00Z`).getUTCDay() + 6) % 7;
  const counts = useMemo(() => {
    const totals = new Map<string, number>();
    for (const order of orders) totals.set(order.dueDate, (totals.get(order.dueDate) ?? 0) + 1);
    return totals;
  }, [orders]);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [focusedDate, setFocusedDate] = useState('');
  const activeDate = [focusedDate, day, today].find((date) => dates.includes(date)) ?? dates[0];
  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const columns = getComputedStyle(event.currentTarget.parentElement!).gridTemplateColumns.split(
      ' ',
    ).length;
    let next = index;
    if (event.key === 'ArrowRight') next++;
    else if (event.key === 'ArrowLeft') next--;
    else if (event.key === 'ArrowDown') next += columns;
    else if (event.key === 'ArrowUp') next -= columns;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = dates.length - 1;
    else return;
    event.preventDefault();
    next = Math.max(0, Math.min(next, dates.length - 1));
    setFocusedDate(dates[next]);
    buttons.current[next]?.focus();
  }
  return (
    <section className="month-planner" aria-labelledby="month-heading">
      <div className="month-heading">
        <h2 id="month-heading" aria-live="polite">
          {monthLabel(anchor, dateLocale)}
        </h2>
        <div className="month-navigation" role="group" aria-label={copy.month.choose}>
          <IconButton
            label={copy.month.previous}
            className="quiet"
            disabled={anchor.slice(0, 7) <= '0001-01'}
            onClick={() => onMonth(shiftMonth(anchor, -1))}
          >
            <CaretLeftIcon aria-hidden="true" />
          </IconButton>
          <Button className="quiet" onClick={() => onMonth(today)}>
            {copy.month.current}
          </Button>
          <IconButton
            label={copy.month.next}
            className="quiet"
            disabled={anchor.slice(0, 7) >= '9999-12'}
            onClick={() => onMonth(shiftMonth(anchor, 1))}
          >
            <CaretRightIcon aria-hidden="true" />
          </IconButton>
        </div>
      </div>
      <p className="muted">{copy.hint}</p>
      <p id="month-keyboard" className="sr-only">
        {copy.keyboard}
      </p>
      <div className="month-weekdays" aria-hidden="true">
        {weekDates(dates[0]).map((date) => (
          <span key={date}>
            {new Date(`${date}T12:00:00Z`).toLocaleDateString(dateLocale, {
              timeZone: 'UTC',
              weekday: 'short',
            })}
          </span>
        ))}
      </div>
      <div
        className="month-days"
        role="group"
        aria-label={copy.month.days}
        aria-describedby="month-keyboard"
      >
        {Array.from({ length: offset }, (_, index) => (
          <span className="month-offset" key={`offset-${index}`} aria-hidden="true" />
        ))}
        {dates.map((date, index) => {
          const count = counts.get(date) ?? 0;
          return (
            <Button
              key={date}
              variant="unstyled"
              className="month-day"
              ref={(node) => {
                buttons.current[index] = node;
              }}
              tabIndex={date === activeDate ? 0 : -1}
              aria-label={copy.chooseDay(
                calendarLabel(date, true, dateLocale),
                count,
                date === today,
              )}
              aria-pressed={day === date}
              aria-current={date === today ? 'date' : undefined}
              onFocus={() => setFocusedDate(date)}
              onKeyDown={(event) => move(event, index)}
              onClick={() => {
                setFocusedDate(date);
                onDay(date);
              }}
            >
              <span className="month-date">
                <span className="month-date-number">{Number(date.slice(8))}</span>
                <span className="month-date-full">{calendarLabel(date, false, dateLocale)}</span>
                {date === today && <small>{copy.today}</small>}
              </span>
              <span className="month-workload">
                <strong>{count}</strong>
                <small>{copy.workload(count)}</small>
              </span>
            </Button>
          );
        })}
        {Array.from({ length: (7 - ((offset + dates.length) % 7)) % 7 }, (_, index) => (
          <span className="month-offset" key={`end-${index}`} aria-hidden="true" />
        ))}
      </div>
      <div className="month-selection">
        <p role="status">
          {day ? copy.showing(calendarLabel(day, true, dateLocale)) : copy.month.showingAll}
        </p>
        <Button className="quiet" disabled={!day} onClick={() => onDay('')}>
          {copy.month.all}
        </Button>
      </div>
    </section>
  );
}
