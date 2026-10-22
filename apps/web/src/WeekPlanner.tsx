import type { WorkOrder } from '@fieldwork/contracts';
import { addDays, calendarLabel, weekDates } from './calendar';

export default function WeekPlanner({
  anchor,
  today,
  day,
  orders,
  onWeek,
  onDay,
}: {
  anchor: string;
  today: string;
  day: string;
  orders: WorkOrder[];
  onWeek: (date: string) => void;
  onDay: (date: string) => void;
}) {
  const dates = weekDates(anchor);
  return (
    <section className="week-planner" aria-labelledby="week-heading">
      <div className="week-heading">
        <h2 id="week-heading" aria-live="polite">
          Week of {calendarLabel(dates[0], true)}
        </h2>
        <div className="week-navigation" role="group" aria-label="Choose week">
          <button className="quiet" onClick={() => onWeek(addDays(dates[0], -7))}>
            Previous week
          </button>
          <button className="quiet" onClick={() => onWeek(today)}>
            This week
          </button>
          <button className="quiet" onClick={() => onWeek(addDays(dates[0], 7))}>
            Next week
          </button>
        </div>
      </div>
      <p className="muted">
        Counts follow your search and status filter. Choose a day to narrow the list.
      </p>
      <div className="week-days" role="group" aria-label="Days in this week">
        {dates.map((date) => {
          const count = orders.filter((order) => order.dueDate === date).length;
          return (
            <button
              key={date}
              className={day === date ? 'week-day active' : 'week-day'}
              aria-pressed={day === date}
              aria-current={date === today ? 'date' : undefined}
              onClick={() => onDay(date)}
            >
              <span>{calendarLabel(date)}</span>
              <strong>{count}</strong>
              <small>
                {count === 1 ? 'work order' : 'work orders'}
                {date === today ? ' · Today' : ''}
              </small>
            </button>
          );
        })}
      </div>
      <div className="week-selection">
        <p role="status">
          {day ? `Showing ${calendarLabel(day, true)}.` : 'Showing the whole week.'}
        </p>
        <button className="quiet" onClick={() => onDay('')} disabled={!day}>
          Whole week
        </button>
      </div>
    </section>
  );
}
