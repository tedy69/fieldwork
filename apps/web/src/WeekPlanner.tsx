import { Button } from './components/ui/button';
import { IconButton } from './components/ui/icon-button';
import { CaretLeftIcon } from '@phosphor-icons/react/dist/csr/CaretLeft';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { CalendarXIcon } from '@phosphor-icons/react/dist/csr/CalendarX';
import type { WorkOrder } from '@fieldwork/contracts';
import { languageTags, type Locale } from '@fieldwork/strings';
import { addDays, calendarLabel, weekDates } from './calendar';
import { workerPlannerCopy } from './worker-planner-copy';
import PlannerDateJump from './PlannerDateJump';

export default function WeekPlanner({
  anchor,
  today,
  day,
  orders,
  closedDays,
  locale = 'en',
  onWeek,
  onDay,
}: {
  anchor: string;
  today: string;
  day: string;
  orders: WorkOrder[];
  closedDays: ReadonlySet<string>;
  locale?: Locale;
  onWeek: (date: string) => void;
  onDay: (date: string) => void;
}) {
  const dates = weekDates(anchor);
  const copy = workerPlannerCopy[locale];
  const dateLocale = languageTags[locale];
  return (
    <section className="week-planner" aria-labelledby="week-heading">
      <div className="week-heading">
        <h2 id="week-heading" aria-live="polite">
          {copy.week.title(calendarLabel(dates[0], true, dateLocale))}
        </h2>
        <div className="week-navigation" role="group" aria-label={copy.week.choose}>
          <IconButton
            label={copy.week.previous}
            className="quiet"
            disabled={dates[0] === '0001-01-01'}
            onClick={() => onWeek(addDays(dates[0], -7))}
          >
            <CaretLeftIcon aria-hidden="true" />
          </IconButton>
          <Button className="quiet" onClick={() => onWeek(today)}>
            {copy.week.current}
          </Button>
          <IconButton
            label={copy.week.next}
            className="quiet"
            disabled={dates.at(-1) === '9999-12-31'}
            onClick={() => onWeek(addDays(dates[0], 7))}
          >
            <CaretRightIcon aria-hidden="true" />
          </IconButton>
          <PlannerDateJump anchor={anchor} locale={locale} onJump={onWeek} />
        </div>
      </div>
      <p className="muted">{copy.hint}</p>
      <div className="week-days" role="group" aria-label={copy.week.days}>
        {dates.map((date) => {
          const count = orders.filter((order) => order.dueDate === date).length;
          const closed = closedDays.has(date);
          return (
            <Button
              key={date}
              variant="unstyled"
              className={day === date ? 'week-day active' : 'week-day'}
              aria-pressed={day === date}
              aria-current={date === today ? 'date' : undefined}
              aria-describedby={closed ? 'planner-closure-description' : undefined}
              onClick={() => onDay(date)}
            >
              <span>
                {calendarLabel(date, false, dateLocale)}
                {closed && (
                  <span className="closure-visit-icon" aria-hidden="true">
                    <CalendarXIcon />
                  </span>
                )}
              </span>
              <strong>{count}</strong>
              <small>
                {copy.workload(count)}
                {date === today ? ` · ${copy.today}` : ''}
              </small>
            </Button>
          );
        })}
      </div>
      <div className="week-selection">
        <p role="status">
          {day ? copy.showing(calendarLabel(day, true, dateLocale)) : copy.week.showingAll}
        </p>
        <Button className="quiet" onClick={() => onDay('')} disabled={!day}>
          {copy.week.all}
        </Button>
      </div>
    </section>
  );
}
