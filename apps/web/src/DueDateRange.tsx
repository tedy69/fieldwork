import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
export default function DueDateRange({
  from,
  through,
  onFrom,
  onThrough,
  onClear,
}: {
  from: string;
  through: string;
  onFrom: (value: string) => void;
  onThrough: (value: string) => void;
  onClear: () => void;
}) {
  const invalid = Boolean(from && through && from > through);
  return (
    <fieldset className="due-range">
      <legend>Due dates</legend>
      <div className="due-range-fields">
        <label>
          Due from
          <Input
            type="date"
            value={from}
            onChange={(event) => onFrom(event.target.value)}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? 'due-range-error' : 'due-range-help'}
          />
        </label>
        <label>
          Due through
          <Input
            type="date"
            value={through}
            onChange={(event) => onThrough(event.target.value)}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? 'due-range-error' : 'due-range-help'}
          />
        </label>
        <Button className="quiet" onClick={onClear} disabled={!from && !through}>
          Clear dates
        </Button>
      </div>
      {invalid ? (
        <p id="due-range-error" role="alert" className="error">
          Due through must be on or after Due from. Change a date or clear the range.
        </p>
      ) : (
        <p id="due-range-help" className="muted">
          Includes both dates. Leave either end open.
        </p>
      )}
    </fieldset>
  );
}
