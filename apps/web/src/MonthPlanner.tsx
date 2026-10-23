import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { WorkOrder } from '@fieldwork/contracts';
import { Button } from './components/ui/button';
import { calendarLabel, monthDates, monthLabel, shiftMonth, weekDates } from './calendar';
import './month-planner.css';

export default function MonthPlanner({
  anchor,
  today,
  day,
  orders,
  onMonth,
  onDay,
}: {
  anchor: string;
  today: string;
  day: string;
  orders: WorkOrder[];
  onMonth: (date: string) => void;
  onDay: (date: string) => void;
}) {
  const dates = monthDates(anchor);
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
          {monthLabel(anchor)}
        </h2>
        <div className="month-navigation" role="group" aria-label="Choose month">
          <Button
            className="quiet"
            disabled={anchor.slice(0, 7) <= '0001-01'}
            onClick={() => onMonth(shiftMonth(anchor, -1))}
          >
            Previous month
          </Button>
          <Button className="quiet" onClick={() => onMonth(today)}>
            This month
          </Button>
          <Button
            className="quiet"
            disabled={anchor.slice(0, 7) >= '9999-12'}
            onClick={() => onMonth(shiftMonth(anchor, 1))}
          >
            Next month
          </Button>
        </div>
      </div>
      <p className="muted">
        Counts follow your search and status filter. Choose a day to narrow the list.
      </p>
      <p id="month-keyboard" className="sr-only">
        Use arrow keys to move between days, Home for the first day, and End for the last. Press
        Enter or Space to select a day.
      </p>
      <div className="month-weekdays" aria-hidden="true">
        {weekDates(dates[0]).map((date) => (
          <span key={date}>
            {new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
              timeZone: 'UTC',
              weekday: 'short',
            })}
          </span>
        ))}
      </div>
      <div
        className="month-days"
        role="group"
        aria-label="Days in this month"
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
              aria-label={`Choose ${calendarLabel(date, true)}: ${count} ${count === 1 ? 'work order' : 'work orders'}${date === today ? ', today' : ''}`}
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
                <span className="month-date-full">{calendarLabel(date)}</span>
                {date === today && <small>Today</small>}
              </span>
              <span className="month-workload">
                <strong>{count}</strong>
                <small>{count === 1 ? 'work order' : 'work orders'}</small>
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
          {day ? `Showing ${calendarLabel(day, true)}.` : 'Showing the whole month.'}
        </p>
        <Button className="quiet" disabled={!day} onClick={() => onDay('')}>
          Whole month
        </Button>
      </div>
    </section>
  );
}
