import { useId, useState, type FormEvent } from 'react';
import { CalendarDotsIcon } from '@phosphor-icons/react/dist/csr/CalendarDots';
import type { Locale } from '@fieldwork/strings';
import { Button } from './components/ui/button';
import { IconButton } from './components/ui/icon-button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover';
import { parseLocalDate } from './dates';
import { workerPlannerCopy } from './worker-planner-copy';

export default function PlannerDateJump({
  anchor,
  locale,
  onJump,
}: {
  anchor: string;
  locale: Locale;
  onJump: (date: string) => void;
}) {
  const copy = workerPlannerCopy[locale].jump;
  const errorId = useId();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(anchor);
  const [invalid, setInvalid] = useState(false);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!parseLocalDate(date)) {
      setInvalid(true);
      return;
    }
    onJump(date);
    setOpen(false);
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDate(anchor);
          setInvalid(false);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <IconButton label={copy.title} className="quiet">
          <CalendarDotsIcon aria-hidden="true" />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent className="planner-date-jump" align="end" aria-label={copy.title}>
        <form onSubmit={submit}>
          <Label>
            {copy.date}
            <Input
              value={date}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => {
                setDate(event.target.value);
                setInvalid(false);
              }}
              placeholder="YYYY-MM-DD"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? errorId : undefined}
            />
          </Label>
          {invalid && (
            <p role="alert" className="error" id={errorId}>
              {copy.invalid}
            </p>
          )}
          <Button type="submit" className="primary">
            {copy.go}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
