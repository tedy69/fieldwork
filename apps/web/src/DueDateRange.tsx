import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { FieldSet, FieldLegend, FieldError } from './components/ui/field';
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
    <FieldSet className="due-range">
      <FieldLegend>Due dates</FieldLegend>
      <div className="due-range-fields">
        <Label>
          Due from
          <Input
            type="date"
            value={from}
            onChange={(event) => onFrom(event.target.value)}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? 'due-range-error' : 'due-range-help'}
          />
        </Label>
        <Label>
          Due through
          <Input
            type="date"
            value={through}
            onChange={(event) => onThrough(event.target.value)}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? 'due-range-error' : 'due-range-help'}
          />
        </Label>
        <Button className="quiet" onClick={onClear} disabled={!from && !through}>
          Clear dates
        </Button>
      </div>
      {invalid ? (
        <FieldError id="due-range-error">
          Due through must be on or after Due from. Change a date or clear the range.
        </FieldError>
      ) : (
        <p id="due-range-help" className="muted">
          Includes both dates. Leave either end open.
        </p>
      )}
    </FieldSet>
  );
}
