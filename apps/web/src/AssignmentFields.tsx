import type { Catalog, CreateOrder } from '@fieldwork/contracts';
import { Input } from './components/ui/input';
import { DatePicker } from './components/ui/date-picker';
import { Textarea } from './components/ui/textarea';
import {
  NativeSelect as Select,
  NativeSelectOption as Option,
} from './components/ui/native-select';
import { Label } from './components/ui/label';
import { localDate } from './dates';

export default function AssignmentFields({
  catalog,
  initial,
  onDateChange,
}: {
  catalog: Catalog;
  initial?: Partial<CreateOrder>;
  onDateChange?: (date: string) => void;
}) {
  return (
    <>
      <Label>
        Work order title
        <Input
          name="title"
          autoFocus
          required
          minLength={3}
          maxLength={140}
          defaultValue={initial?.title}
          placeholder="e.g. Inspect the north access gate"
        />
      </Label>
      <Label>
        Site
        <Select name="siteId" aria-label="Site" required defaultValue={initial?.siteId}>
          {catalog.sites.map((site) => (
            <Option key={site.id} value={site.id}>
              {site.name}
            </Option>
          ))}
        </Select>
      </Label>
      <div className="form-grid">
        <Label>
          Assign to
          <Select
            name="assigneeId"
            aria-label="Assign to"
            required
            defaultValue={initial?.assigneeId}
          >
            {catalog.users
              .filter((user) => user.role === 'worker')
              .map((user) => (
                <Option key={user.id} value={user.id}>
                  {user.name}
                </Option>
              ))}
          </Select>
        </Label>
        <Label>
          Due date
          <DatePicker
            name="dueDate"
            calendarLabel="Choose due date"
            required
            defaultValue={initial?.dueDate ?? localDate()}
            onValueChange={(value) => onDateChange?.(value)}
          />
        </Label>
      </div>
      <div className="form-grid">
        <Label>
          Checklist
          <Select
            name="templateId"
            aria-label="Checklist"
            required
            defaultValue={initial?.templateId}
          >
            {catalog.templates.map((template) => (
              <Option key={template.id} value={template.id}>
                {template.name}
                {template.requiresPhoto ? ' · Photo required' : ''}
              </Option>
            ))}
          </Select>
        </Label>
        <Label>
          Priority
          <Select
            name="priority"
            aria-label="Priority"
            defaultValue={initial?.priority ?? 'routine'}
          >
            <Option value="routine">Routine</Option>
            <Option value="urgent">Urgent</Option>
          </Select>
        </Label>
      </div>
      <Label>
        Instructions
        <Textarea
          className="resize-none"
          name="instructions"
          rows={3}
          maxLength={4000}
          defaultValue={initial?.instructions}
          placeholder="What should the worker check?"
        />
      </Label>
    </>
  );
}
