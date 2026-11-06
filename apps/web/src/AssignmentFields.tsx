import type { Catalog, CreateOrder } from '@fieldwork/contracts';
import type { Locale } from '@fieldwork/strings';
import { Input } from './components/ui/input';
import { DatePicker } from './components/ui/date-picker';
import { Textarea } from './components/ui/textarea';
import {
  NativeSelect as Select,
  NativeSelectOption as Option,
} from './components/ui/native-select';
import { Label } from './components/ui/label';
import { localDate } from './dates';
import { managerDispatchCopy } from './manager-dispatch-copy';

export default function AssignmentFields({
  catalog,
  locale = 'en',
  initial,
  chooseMissing = false,
  onDateChange,
  onSiteChange,
}: {
  catalog: Catalog;
  locale?: Locale;
  initial?: Partial<CreateOrder>;
  chooseMissing?: boolean;
  onDateChange?: (date: string) => void;
  onSiteChange?: (siteId: string) => void;
}) {
  const copy = managerDispatchCopy[locale];
  const workers = catalog.users.filter((user) => user.role === 'worker');
  return (
    <>
      <Label>
        {copy.title}
        <Input
          name="title"
          autoFocus={!chooseMissing}
          required
          minLength={3}
          maxLength={140}
          defaultValue={initial?.title}
          placeholder={copy.titleHint}
        />
      </Label>
      <Label>
        {copy.site}
        <Select
          name="siteId"
          aria-label={copy.site}
          required
          defaultValue={
            chooseMissing && !catalog.sites.some((option) => option.id === initial?.siteId)
              ? ''
              : initial?.siteId
          }
          onChange={(event) => onSiteChange?.(event.currentTarget.value)}
        >
          {chooseMissing && <Option value="">{copy.chooseSite}</Option>}
          {catalog.sites.map((site) => (
            <Option key={site.id} value={site.id}>
              {site.name}
            </Option>
          ))}
        </Select>
      </Label>
      <div className="form-grid">
        <Label>
          {copy.assignee}
          <Select
            name="assigneeId"
            aria-label={copy.assignee}
            required
            defaultValue={
              chooseMissing && !workers.some((option) => option.id === initial?.assigneeId)
                ? ''
                : initial?.assigneeId
            }
          >
            {chooseMissing && <Option value="">{copy.chooseWorker}</Option>}
            {workers.map((user) => (
              <Option key={user.id} value={user.id}>
                {user.name}
              </Option>
            ))}
          </Select>
        </Label>
        <Label>
          {copy.due}
          <DatePicker
            name="dueDate"
            calendarLabel={copy.calendar}
            locale={locale}
            required
            defaultValue={initial?.dueDate ?? localDate()}
            onValueChange={(value) => onDateChange?.(value)}
          />
        </Label>
      </div>
      <div className="form-grid">
        <Label>
          {copy.checklist}
          <Select
            name="templateId"
            aria-label={copy.checklist}
            required
            defaultValue={
              chooseMissing &&
              !catalog.templates.some((option) => option.id === initial?.templateId)
                ? ''
                : initial?.templateId
            }
          >
            {chooseMissing && <Option value="">{copy.chooseChecklist}</Option>}
            {catalog.templates.map((template) => (
              <Option key={template.id} value={template.id}>
                {template.name}
                {template.requiresPhoto || template.items.some((item) => item.requiresPhoto)
                  ? ` · ${copy.photoRequired}`
                  : ''}
              </Option>
            ))}
          </Select>
        </Label>
        <Label>
          {copy.priority}
          <Select
            name="priority"
            aria-label={copy.priority}
            defaultValue={initial?.priority ?? 'routine'}
          >
            <Option value="routine">{copy.routine}</Option>
            <Option value="urgent">{copy.urgent}</Option>
          </Select>
        </Label>
      </div>
      <Label>
        {copy.instructions}
        <Textarea
          className="resize-none"
          name="instructions"
          rows={3}
          maxLength={4000}
          defaultValue={initial?.instructions}
          placeholder={copy.instructionsHint}
        />
      </Label>
    </>
  );
}
