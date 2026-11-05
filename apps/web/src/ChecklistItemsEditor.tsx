import { useLayoutEffect, useRef, useState } from 'react';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { TrashIcon } from '@phosphor-icons/react/dist/csr/Trash';
import type { CreateItem } from '@fieldwork/contracts';
import { Alert } from './components/ui/alert';
import { Button } from './components/ui/button';
import { IconButton } from './components/ui/icon-button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { NativeSelect, NativeSelectOption } from './components/ui/native-select';
import { Textarea } from './components/ui/textarea';

type ResponseChoice = '' | 'text' | 'number';
type Row = { id: number; label: string; type: ResponseChoice };
const itemLimit = 50;

function responseChoice(value: FormDataEntryValue | null): ResponseChoice {
  return value === 'text' || value === 'number' ? value : '';
}

function bulkLabels(data: FormData) {
  return String(data.get('items') ?? '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function checklistItems(data: FormData): CreateItem[] {
  const labels = data.getAll('itemLabel');
  const types = data.getAll('itemType');
  const choice = responseChoice(data.get('responseType'));
  return (labels.length ? labels : bulkLabels(data)).map((label, index) => {
    const type = labels.length ? responseChoice(types[index] ?? null) : choice;
    const requiresPhoto = data.has(`item-${index}-photo`);
    if (!type && !requiresPhoto) return String(label);
    const item = {
      label: String(label),
      responseType: type || ('check' as const),
      ...(requiresPhoto && { requiresPhoto }),
    };
    if (type !== 'number' || !labels.length) return item;
    const unit = String(data.get(`item-${index}-unit`) ?? '').trim();
    const min = String(data.get(`item-${index}-min`) ?? '');
    const max = String(data.get(`item-${index}-max`) ?? '');
    if (!unit && !min && !max) return item;
    return {
      ...item,
      readingRule: {
        ...(unit && { unit }),
        ...(min && { min: Number(min) }),
        ...(max && { max: Number(max) }),
      },
    };
  });
}

function ResponseSelect({
  name,
  label,
  initial = '',
  disabled,
  onChoice,
}: {
  name: string;
  label: string;
  initial?: ResponseChoice;
  disabled: boolean;
  onChoice?: (choice: ResponseChoice) => void;
}) {
  return (
    <Label>
      Response type
      <NativeSelect
        name={name}
        aria-label={label}
        defaultValue={initial}
        disabled={disabled}
        onChange={(event) => onChoice?.(responseChoice(event.currentTarget.value))}
      >
        <NativeSelectOption value="">Pass / issue / N/A</NativeSelectOption>
        <NativeSelectOption value="text">Text response</NativeSelectOption>
        <NativeSelectOption value="number">Numeric reading</NativeSelectOption>
      </NativeSelect>
    </Label>
  );
}

function ItemResponse({
  initial,
  index,
  busy,
}: {
  initial: ResponseChoice;
  index: number;
  busy: boolean;
}) {
  const [type, setType] = useState(initial);
  const [minimum, setMinimum] = useState<number>();
  const disabled = busy || type !== 'number';
  return (
    <>
      <ResponseSelect
        name="itemType"
        label={`Item ${index + 1} response type`}
        initial={initial}
        disabled={busy}
        onChoice={setType}
      />
      <div hidden={type !== 'number'}>
        <Label>
          Unit (optional)
          <Input
            name={`item-${index}-unit`}
            aria-label={`Item ${index + 1} unit`}
            maxLength={24}
            disabled={disabled}
          />
        </Label>
        <div className="form-grid">
          <Label>
            Minimum (optional)
            <Input
              name={`item-${index}-min`}
              aria-label={`Item ${index + 1} minimum`}
              type="number"
              step="any"
              disabled={disabled}
              onChange={(event) => {
                const value = event.currentTarget.valueAsNumber;
                setMinimum(Number.isFinite(value) ? value : undefined);
              }}
            />
          </Label>
          <Label>
            Maximum (optional)
            <Input
              name={`item-${index}-max`}
              aria-label={`Item ${index + 1} maximum`}
              type="number"
              step="any"
              min={minimum}
              disabled={disabled}
            />
          </Label>
        </div>
      </div>
    </>
  );
}

export default function ChecklistItemsEditor({ busy }: { busy: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const nextId = useRef(0);
  const inputs = useRef(new Map<number, HTMLInputElement>());
  const focusRow = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (focusRow.current !== null) inputs.current.get(focusRow.current)?.focus();
    focusRow.current = null;
  }, [rows]);

  if (!rows)
    return (
      <>
        <Label>
          Inspection items, one per line
          <Textarea
            className="resize-none"
            name="items"
            required
            rows={5}
            disabled={busy}
            placeholder={'Check access route\nCheck equipment condition'}
            onChange={() => setError('')}
          />
        </Label>
        <ResponseSelect name="responseType" label="Response type" disabled={busy} />
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={(event) => {
            const form = event.currentTarget.form;
            if (!form) return;
            const data = new FormData(form);
            const labels = bulkLabels(data);
            if (labels.length > itemLimit) {
              setError('Use up to 50 items. Remove extra lines before setting individual types.');
              form.querySelector<HTMLTextAreaElement>('[name="items"]')?.focus();
              return;
            }
            const type = responseChoice(data.get('responseType'));
            const initial = (labels.length ? labels : ['']).map((label) => ({
              id: nextId.current++,
              label,
              type,
            }));
            focusRow.current = initial[0].id;
            setRows(initial);
          }}
        >
          Set types per item
        </Button>
        {error && <Alert className="error">{error}</Alert>}
      </>
    );

  return (
    <div className="checklist-item-editor">
      {rows.map((row, index) => (
        <fieldset className="checklist-item-fields" key={row.id}>
          <legend>Item {index + 1}</legend>
          <div className="checklist-item-label">
            <Label>
              Question
              <Input
                name="itemLabel"
                aria-label={`Item ${index + 1} question`}
                required
                minLength={2}
                maxLength={250}
                defaultValue={row.label}
                disabled={busy}
                ref={(input) => {
                  if (input) inputs.current.set(row.id, input);
                  else inputs.current.delete(row.id);
                }}
              />
            </Label>
            <IconButton
              label={`Remove item ${index + 1}`}
              variant="ghost"
              disabled={busy || rows.length === 1}
              onClick={() => {
                focusRow.current = (rows[index + 1] ?? rows[index - 1]).id;
                setRows(rows.filter((entry) => entry.id !== row.id));
              }}
            >
              <TrashIcon aria-hidden="true" />
            </IconButton>
          </div>
          <ItemResponse initial={row.type} index={index} busy={busy} />
          <Label className="item-photo-option">
            <Input
              type="checkbox"
              name={`item-${index}-photo`}
              aria-label={`Require photo for item ${index + 1}`}
              disabled={busy}
            />
            Require a photo
          </Label>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={busy || rows.length === itemLimit}
        onClick={() => {
          const row: Row = { id: nextId.current++, label: '', type: '' };
          focusRow.current = row.id;
          setRows([...rows, row]);
        }}
      >
        <PlusIcon aria-hidden="true" /> Add item
      </Button>
    </div>
  );
}
