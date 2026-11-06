import { useLayoutEffect, useRef, useState } from 'react';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { TrashIcon } from '@phosphor-icons/react/dist/csr/Trash';
import type { CreateItem } from '@fieldwork/contracts';
import type { Locale } from '@fieldwork/strings';
import { Alert } from './components/ui/alert';
import { Button } from './components/ui/button';
import { IconButton } from './components/ui/icon-button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { NativeSelect, NativeSelectOption } from './components/ui/native-select';
import { Textarea } from './components/ui/textarea';
import { checklistEditorCopy } from './checklist-editor-copy';

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
  copy,
  initial = '',
  disabled,
  onChoice,
}: {
  name: string;
  label: string;
  copy: typeof checklistEditorCopy.en;
  initial?: ResponseChoice;
  disabled: boolean;
  onChoice?: (choice: ResponseChoice) => void;
}) {
  return (
    <Label>
      {copy.response}
      <NativeSelect
        name={name}
        aria-label={label}
        defaultValue={initial}
        disabled={disabled}
        onChange={(event) => onChoice?.(responseChoice(event.currentTarget.value))}
      >
        <NativeSelectOption value="">{copy.check}</NativeSelectOption>
        <NativeSelectOption value="text">{copy.text}</NativeSelectOption>
        <NativeSelectOption value="number">{copy.number}</NativeSelectOption>
      </NativeSelect>
    </Label>
  );
}

function ItemResponse({
  initial,
  index,
  busy,
  copy,
}: {
  initial: ResponseChoice;
  index: number;
  busy: boolean;
  copy: typeof checklistEditorCopy.en;
}) {
  const [type, setType] = useState(initial);
  const [minimum, setMinimum] = useState<number>();
  const disabled = busy || type !== 'number';
  return (
    <>
      <ResponseSelect
        name="itemType"
        label={copy.itemResponse(index + 1)}
        copy={copy}
        initial={initial}
        disabled={busy}
        onChoice={setType}
      />
      <div hidden={type !== 'number'}>
        <Label>
          {copy.unit}
          <Input
            name={`item-${index}-unit`}
            aria-label={copy.itemUnit(index + 1)}
            maxLength={24}
            disabled={disabled}
          />
        </Label>
        <div className="form-grid">
          <Label>
            {copy.minimum}
            <Input
              name={`item-${index}-min`}
              aria-label={copy.itemMinimum(index + 1)}
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
            {copy.maximum}
            <Input
              name={`item-${index}-max`}
              aria-label={copy.itemMaximum(index + 1)}
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

export default function ChecklistItemsEditor({ busy, locale }: { busy: boolean; locale: Locale }) {
  const copy = checklistEditorCopy[locale];
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
          {copy.lines}
          <Textarea
            className="resize-none"
            name="items"
            required
            rows={5}
            disabled={busy}
            placeholder={copy.placeholder}
            onChange={() => setError('')}
          />
        </Label>
        <ResponseSelect name="responseType" label={copy.response} copy={copy} disabled={busy} />
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
              setError(copy.maxItems);
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
          {copy.perItem}
        </Button>
        {error && <Alert className="error">{error}</Alert>}
      </>
    );

  return (
    <div className="checklist-item-editor">
      {rows.map((row, index) => (
        <fieldset className="checklist-item-fields" key={row.id}>
          <legend>{copy.item(index + 1)}</legend>
          <div className="checklist-item-label">
            <Label>
              {copy.question}
              <Input
                name="itemLabel"
                aria-label={copy.itemQuestion(index + 1)}
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
              label={copy.removeItem(index + 1)}
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
          <ItemResponse initial={row.type} index={index} busy={busy} copy={copy} />
          <Label className="item-photo-option">
            <Input
              type="checkbox"
              name={`item-${index}-photo`}
              aria-label={copy.requireItemPhoto(index + 1)}
              disabled={busy}
            />
            {copy.requirePhoto}
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
        <PlusIcon aria-hidden="true" /> {copy.addItem}
      </Button>
    </div>
  );
}
