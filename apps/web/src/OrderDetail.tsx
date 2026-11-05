import { Button } from './components/ui/button';
import { IconButton } from './components/ui/icon-button';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { TrashIcon } from '@phosphor-icons/react/dist/csr/Trash';
import { ImageSquareIcon } from '@phosphor-icons/react/dist/csr/ImageSquare';
import { Form } from './components/ui/form';
import { Card } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { Alert } from './components/ui/alert';
import FileUpload from './components/kokonutui/file-upload';
import { Input } from './components/ui/input';
import { Textarea } from './components/ui/textarea';
import { Label } from './components/ui/label';
import { FieldSet, FieldLegend, FieldError } from './components/ui/field';
import { RadioGroup, RadioGroupItem } from './components/ui/radio-group';
import { useRef, useState, type FormEvent } from 'react';
import {
  ReportInputSchema,
  MAX_REPORT_PHOTOS,
  answerLabel,
  availableSitePhotoSlots,
  blankDraft,
  checklistItemLabel,
  completedAnswers,
  readingBounds,
  readingInputError,
  reportAnswers,
  reportItemLabel,
  type Draft,
  type Photo,
  type User,
  type WorkOrder,
} from '@fieldwork/contracts';
import type { State, OfflineRepository } from '@fieldwork/offline';
import { client, labels, dateLabel, message } from './lib';
import { Empty, PanelHeader, ActionGroup } from './components';
import ReportPrint from './ReportPrint';
import RescheduleOrder from './RescheduleOrder';
import ReassignOrder from './ReassignOrder';
import ReportHistory from './ReportHistory';
import SiteLocation from './SiteLocation';
import DraftExport from './DraftExport';
export default function OrderDetail({
  user,
  order,
  workers,
  repo,
  state,
  online,
  onBack,
  onRefresh,
  onNotice,
}: {
  user: User;
  order: WorkOrder;
  workers: User[];
  repo: OfflineRepository;
  state: State;
  online: boolean;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  onNotice: (notice: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(state.drafts[order.id] ?? blankDraft(order));
  const currentDraft = useRef(draft);
  const pendingWrites = useRef(0);
  const attaching = useRef(false);
  const itemPhotoInput = useRef<HTMLInputElement>(null);
  const photoItem = useRef<string | undefined>(undefined);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState('');
  const queued = state.outbox.find((item) => item.orderId === order.id);
  const editable =
    user.role === 'worker' && ['ASSIGNED', 'CHANGES_REQUESTED'].includes(order.status) && !queued;
  const completed = completedAnswers(order.template, draft.answers);
  const sitePhotoSlots = availableSitePhotoSlots(order.template, draft.photos);
  const itemPhotosRequired = order.template.items.some((item) => item.requiresPhoto);
  async function save(next: Draft) {
    currentDraft.current = next;
    setDraft(next);
    pendingWrites.current += 1;
    setSaving(true);
    setError('');
    try {
      await repo.saveDraft(order.id, next);
    } catch {
      setError(
        'Your draft could not be saved. Free device storage and try again before leaving this page.',
      );
    } finally {
      pendingWrites.current -= 1;
      setSaving(pendingWrites.current > 0);
    }
  }
  async function photos(files: File[], itemId?: string) {
    if (!files.length || attaching.current) return;
    attaching.current = true;
    setBusy(true);
    setError('');
    try {
      const existing = currentDraft.current.photos;
      if (existing.length + files.length > MAX_REPORT_PHOTOS)
        throw new Error('Attach up to 3 photos.');
      if (itemId && existing.some((photo) => photo.itemId === itemId)) return;
      if (!itemId && files.length > availableSitePhotoSlots(order.template, existing))
        throw new Error('Keep a photo slot available for each question that requires one.');
      const added: Photo[] = [];
      for (const file of Array.from(files)) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2_000_000)
          throw new Error('Choose JPEG, PNG, or WebP photos smaller than 2 MB.');
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        added.push({
          id: crypto.randomUUID(),
          mimeType: file.type as Photo['mimeType'],
          data,
          ...(itemId && { itemId }),
        });
      }
      await save({ ...currentDraft.current, photos: [...currentDraft.current.photos, ...added] });
    } catch (error) {
      setError(message(error));
    } finally {
      attaching.current = false;
      setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (attaching.current) return;
    setError('');
    if (completed !== order.template.items.length) {
      setError('Complete every checklist item before submitting.');
      return;
    }
    setBusy(true);
    try {
      const input = ReportInputSchema.parse({
        ...draft,
        answers: reportAnswers(draft.answers),
        mutationId: crypto.randomUUID(),
        baseVersion: order.version,
      });
      await repo.saveDraft(order.id, draft);
      await repo.enqueue(order.id, input);
      onNotice('Report saved to your outbox. It will sync when the server is available.');
      await onRefresh();
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  async function decide(decision: 'APPROVED' | 'CHANGES_REQUESTED') {
    setBusy(true);
    setError('');
    try {
      await client.review(order.id, order.version, decision, review);
      await onRefresh();
      onNotice(
        decision === 'APPROVED'
          ? 'Inspection approved.'
          : 'Changes requested. The worker can update the inspection.',
      );
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="detail">
      <IconButton className="quiet back" label="Back to work orders" onClick={onBack}>
        <ArrowLeftIcon aria-hidden="true" />
      </IconButton>
      <div className="detail-heading">
        <div>
          <div className="detail-identity">
            <span className="reference">{order.reference}</span>
            <span className="muted">{order.template.name}</span>
          </div>
          <h1>{order.title}</h1>
        </div>
        <Badge className={`status status-${order.status.toLowerCase()}`}>
          {labels[order.status]}
        </Badge>
      </div>
      <dl className="order-meta">
        <div>
          <dt>Site</dt>
          <dd>
            {order.site.name}
            <small>{order.site.address}</small>
          </dd>
        </div>
        <div>
          <dt>Assigned to</dt>
          <dd>{order.assignee.name}</dd>
        </div>
        <div>
          <dt>Due / priority</dt>
          <dd>
            {dateLabel(order.dueDate)} · {order.priority}
          </dd>
        </div>
      </dl>
      <div className="inspection-layout">
        <div className="inspection-content">
          <Card className="brief">
            <h2>Field brief</h2>
            <p>{order.instructions || 'Complete the checklist and describe your findings.'}</p>
          </Card>
          {order.review && (
            <Alert role="status" className="banner notice">
              <strong>
                {labels[order.review.decision]} by {order.review.reviewedBy}
              </strong>
              <p>{order.review.note || 'The inspection report has been accepted.'}</p>
            </Alert>
          )}
          {queued && (
            <Alert role="status" className="banner notice">
              <strong>
                {queued.state === 'blocked'
                  ? 'Sync needs your attention'
                  : 'Report queued on this device'}
              </strong>
              <p>
                {queued.error ??
                  'Your checklist, notes, and photos are saved. Open the outbox for sync details.'}
              </p>
            </Alert>
          )}
          {user.role === 'worker' && (state.drafts[order.id] || queued) && (
            <DraftExport orderId={order.id} repo={repo} disabled={saving || busy} />
          )}
          {editable && (
            <Form noValidate className="inspection-form" onSubmit={submit}>
              <div className="section-heading">
                <h2>Inspection checklist</h2>
                <span className="muted" role="status">
                  {saving ? 'Saving locally…' : 'Draft saved on this device'}
                </span>
              </div>
              <p className="inspection-progress" role="status">
                <strong>{completed}</strong> of {order.template.items.length} checks recorded
              </p>
              {order.template.items.map((item, index) => {
                const answer = draft.answers.find((answer) => answer.itemId === item.id)!;
                const readingError = readingInputError(item, answer.reading);
                const bounds = readingBounds(item);
                const hasPhoto = draft.photos.some((photo) => photo.itemId === item.id);
                return (
                  <FieldSet className="checklist-item" key={item.id}>
                    <FieldLegend id={`item-${item.id}`}>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      {checklistItemLabel(item)}
                    </FieldLegend>
                    {item.responseType === 'text' ? (
                      <Label>
                        <span className="sr-only">Response: {item.label}</span>
                        <Textarea
                          aria-label={`Response: ${item.label}`}
                          required
                          maxLength={1000}
                          rows={3}
                          value={answer.text ?? ''}
                          onChange={(event) =>
                            void save({
                              ...draft,
                              answers: draft.answers.map((entry) =>
                                entry.itemId === item.id
                                  ? { ...entry, value: 'text', text: event.target.value }
                                  : entry,
                              ),
                            })
                          }
                        />
                      </Label>
                    ) : item.responseType === 'number' ? (
                      <>
                        <Label>
                          <span className="sr-only">Reading: {checklistItemLabel(item)}</span>
                          <Input
                            aria-label={`Reading: ${checklistItemLabel(item)}`}
                            required
                            maxLength={100}
                            value={answer.reading ?? ''}
                            aria-invalid={Boolean(readingError)}
                            aria-describedby={
                              readingError || bounds ? `reading-help-${item.id}` : undefined
                            }
                            onChange={(event) =>
                              void save({
                                ...draft,
                                answers: draft.answers.map((entry) =>
                                  entry.itemId === item.id
                                    ? { ...entry, value: 'number', reading: event.target.value }
                                    : entry,
                                ),
                              })
                            }
                          />
                        </Label>
                        {readingError ? (
                          <FieldError id={`reading-help-${item.id}`}>{readingError}</FieldError>
                        ) : bounds ? (
                          <p id={`reading-help-${item.id}`} className="muted">
                            Enter a reading {bounds}.
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <RadioGroup
                        className="answers"
                        aria-labelledby={`item-${item.id}`}
                        required
                        name={item.id}
                        value={answer.value}
                        onValueChange={(value) => {
                          if (value !== 'pass' && value !== 'fail' && value !== 'na') return;
                          void save({
                            ...draft,
                            answers: draft.answers.map((entry) =>
                              entry.itemId === item.id ? { ...entry, value } : entry,
                            ),
                          });
                        }}
                      >
                        {(['pass', 'fail', 'na'] as const).map((value) => (
                          <Label
                            key={value}
                            htmlFor={`answer-${item.id}-${value}`}
                            className={answer.value === value ? 'answer selected' : 'answer'}
                          >
                            <RadioGroupItem id={`answer-${item.id}-${value}`} value={value} />
                            {value === 'pass' ? 'Pass' : value === 'fail' ? 'Issue found' : 'N/A'}
                          </Label>
                        ))}
                      </RadioGroup>
                    )}
                    <Label className="item-note">
                      <span className="sr-only">Notes: {item.label}</span>
                      <Input
                        placeholder="Add a note (optional)"
                        value={answer.note}
                        maxLength={1000}
                        onChange={(event) =>
                          void save({
                            ...draft,
                            answers: draft.answers.map((entry) =>
                              entry.itemId === item.id
                                ? { ...entry, note: event.target.value }
                                : entry,
                            ),
                          })
                        }
                      />
                    </Label>
                    {item.requiresPhoto && (
                      <div className="item-photo-evidence">
                        <p className="muted">{hasPhoto ? 'Photo attached' : 'Photo required'}</p>
                        {!hasPhoto && (
                          <Button
                            type="button"
                            variant="outline"
                            aria-label={`Add photo for ${checklistItemLabel(item)}`}
                            disabled={busy || draft.photos.length >= MAX_REPORT_PHOTOS}
                            onClick={() => {
                              photoItem.current = item.id;
                              itemPhotoInput.current?.click();
                            }}
                          >
                            <ImageSquareIcon aria-hidden="true" /> Add photo
                          </Button>
                        )}
                      </div>
                    )}
                  </FieldSet>
                );
              })}
              <Label className="report-summary">
                Inspection summary
                <Textarea
                  className="resize-none"
                  aria-label="Inspection summary"
                  required
                  maxLength={4000}
                  rows={4}
                  placeholder="Describe the condition of the site and any follow-up work."
                  value={draft.summary}
                  onChange={(event) => void save({ ...draft, summary: event.target.value })}
                />
              </Label>
              <section className="photo-section">
                <h2>
                  Site photos{' '}
                  <span className="muted">
                    {draft.photos.length}/{MAX_REPORT_PHOTOS}
                  </span>
                </h2>
                {order.template.requiresPhoto && (
                  <p className="muted">
                    At least one site photo is required for each submission, including corrections.
                  </p>
                )}
                <div className="photos">
                  {draft.photos.map((photo, index) => (
                    <div key={photo.id}>
                      <img
                        alt={`Site attachment ${index + 1}`}
                        src={`data:${photo.mimeType};base64,${photo.data}`}
                      />
                      {photo.itemId && <p>{reportItemLabel(order.template, photo.itemId)}</p>}
                      <IconButton
                        label={`Remove photo ${index + 1}`}
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void save({
                            ...currentDraft.current,
                            photos: currentDraft.current.photos.filter(
                              (entry) => entry.id !== photo.id,
                            ),
                          })
                        }
                      >
                        <TrashIcon aria-hidden="true" />
                      </IconButton>
                    </div>
                  ))}
                </div>
                {itemPhotosRequired && (
                  <>
                    <input
                      hidden
                      type="file"
                      ref={itemPhotoInput}
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => {
                        const itemId = photoItem.current;
                        if (itemId)
                          void photos(Array.from(event.currentTarget.files ?? []), itemId);
                        event.currentTarget.value = '';
                      }}
                    />
                    {sitePhotoSlots === 0 && draft.photos.length < MAX_REPORT_PHOTOS && (
                      <p className="muted">
                        Remaining photo slots are reserved for checklist questions.
                      </p>
                    )}
                    {draft.photos.length === MAX_REPORT_PHOTOS &&
                      !order.template.items.every(
                        (item) =>
                          !item.requiresPhoto ||
                          draft.photos.some((photo) => photo.itemId === item.id),
                      ) && (
                        <p className="muted">Remove a photo to make room for required evidence.</p>
                      )}
                  </>
                )}
                <FileUpload onFiles={photos} disabled={busy || sitePhotoSlots === 0} busy={busy} />
              </section>
              {error && <FieldError>{error}</FieldError>}
              <div className="submit-bar">
                <p>Your report stays on this device until the server confirms it.</p>
                <Button className="primary" disabled={busy || saving}>
                  {busy
                    ? 'Saving report…'
                    : navigator.onLine
                      ? 'Submit inspection'
                      : 'Save report for sync'}
                </Button>
              </div>
            </Form>
          )}
          {order.report && !editable && (
            <Card className="report">
              <div className="section-heading">
                <h2>Inspection report</h2>
                <span className="muted">
                  Submitted {new Date(order.report.submittedAt).toLocaleString()}
                </span>
              </div>
              <ul className="report-checklist">
                {order.report.answers.map((answer) => (
                  <li key={answer.itemId}>
                    <strong>{reportItemLabel(order.template, answer.itemId)}</strong>
                    <span
                      className={`preserve-lines ${answer.value === 'fail' ? 'amber' : 'muted'}`}
                    >
                      {answerLabel(answer)}
                    </span>
                    {answer.note && <p>{answer.note}</p>}
                  </li>
                ))}
              </ul>
              <h3>Summary</h3>
              <p className="preserve-lines">{order.report.summary}</p>
              {order.report.photos.length > 0 && (
                <div className="photos">
                  {order.report.photos.map((photo, index) => (
                    <a
                      key={photo.id}
                      href={client.photoUrl(photo.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <img
                        src={client.photoUrl(photo.id)}
                        alt={`Submitted site photo ${index + 1}`}
                      />
                      {photo.itemId && <p>{reportItemLabel(order.template, photo.itemId)}</p>}
                    </a>
                  ))}
                </div>
              )}
              {user.role === 'manager' && order.status === 'SUBMITTED' && (
                <section className="review-box">
                  <h2>Manager review</h2>
                  <Label>
                    Review note
                    <Textarea
                      className="resize-none"
                      aria-label="Review note"
                      maxLength={2000}
                      rows={3}
                      value={review}
                      onChange={(event) => setReview(event.target.value)}
                      placeholder="Add feedback or explain what needs to change."
                    />
                  </Label>
                  {error && <FieldError>{error}</FieldError>}
                  <ActionGroup className="review-actions">
                    <Button
                      className="quiet"
                      disabled={busy || !review.trim()}
                      onClick={() => void decide('CHANGES_REQUESTED')}
                    >
                      Request changes
                    </Button>
                    <Button
                      className="primary"
                      disabled={busy}
                      onClick={() => void decide('APPROVED')}
                    >
                      {busy ? 'Saving review…' : 'Approve inspection'}
                    </Button>
                  </ActionGroup>
                </section>
              )}
            </Card>
          )}
          {user.role === 'manager' && !order.report && (
            <Empty
              title="Waiting for the field report"
              description="The assigned worker can complete this checklist offline. Their report will appear here after it syncs."
            />
          )}
        </div>
        <aside className="inspection-context" aria-label="Order tools and location">
          <Card className="order-tools">
            <PanelHeader title="Order tools" />
            {user.role === 'manager' &&
              ['ASSIGNED', 'CHANGES_REQUESTED'].includes(order.status) && (
                <>
                  <ReassignOrder
                    order={order}
                    workers={workers}
                    online={online}
                    onSaved={async (updated) => {
                      await repo.cacheOrder(updated);
                    }}
                    onNotice={onNotice}
                  />
                  <RescheduleOrder
                    order={order}
                    online={online}
                    onSaved={async (updated) => {
                      await repo.cacheOrder(updated);
                    }}
                    onNotice={onNotice}
                  />
                </>
              )}
            {order.report && <ReportPrint order={order} report={order.report} />}
            <ReportHistory orderId={order.id} online={online} />
          </Card>
          <SiteLocation
            key={order.site.id}
            site={order.site}
            online={online}
            beforeReload={async () => {
              if (busy || pendingWrites.current > 0)
                throw new Error('Wait for the current report action to finish before reloading.');
              if (review.trim())
                throw new Error('Your review has unsaved text. Send or clear it before reloading.');
              if (editable) {
                const snapshot = currentDraft.current;
                await repo.saveDraft(order.id, snapshot);
                if (pendingWrites.current > 0 || snapshot !== currentDraft.current)
                  throw new Error(
                    'Your draft changed while saving. Wait for it to finish before reloading.',
                  );
              }
            }}
          />
        </aside>
      </div>
    </article>
  );
}
