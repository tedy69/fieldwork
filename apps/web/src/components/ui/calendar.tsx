/*! Adapted from shadcn/ui, 3d98900. MIT: /licenses/shadcn-ui-MIT.txt. */
import { useEffect, useRef, type ComponentProps } from 'react';
import { CaretLeftIcon } from '@phosphor-icons/react/dist/csr/CaretLeft';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { DayPicker, getDefaultClassNames, type DayButton } from 'react-day-picker';
import { Button } from './button';
import { cn } from '@/lib/utils';

export function Calendar({
  className,
  classNames,
  components,
  ...props
}: ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays
      className={cn('ui-calendar', className)}
      classNames={{ ...getDefaultClassNames(), ...classNames }}
      components={{
        PreviousMonthButton: CalendarNavigationButton,
        NextMonthButton: CalendarNavigationButton,
        Chevron: ({ orientation }) =>
          orientation === 'left' ? (
            <CaretLeftIcon aria-hidden="true" />
          ) : (
            <CaretRightIcon aria-hidden="true" />
          ),
        DayButton: CalendarDayButton,
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarNavigationButton(props: ComponentProps<'button'>) {
  return <Button variant="ghost" {...props} onClick={props.onClick} />;
}

function CalendarDayButton({
  day,
  modifiers,
  className,
  ...props
}: ComponentProps<typeof DayButton>) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);
  return (
    <Button
      ref={ref}
      variant="unstyled"
      className={cn('ui-calendar-day', className)}
      data-selected={modifiers.selected || undefined}
      {...props}
      onClick={props.onClick}
    />
  );
}
