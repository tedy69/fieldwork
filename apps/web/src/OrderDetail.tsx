import { Button } from './components/ui/button';
import { IconButton } from './components/ui/icon-button';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { CopyIcon } from '@phosphor-icons/react/dist/csr/Copy';
import { PencilSimpleIcon } from '@phosphor-icons/react/dist/csr/PencilSimple';
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
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ReportInputSchema,
  MAX_REPORT_PHOTOS,
  answerLabel,
  availableSitePhotoSlots,
  blankDraft,
  checklistItemLabel,
  completedAnswers,
  parseReading,
  readingBounds,
  readingInputError,
  reportAnswers,
  reportItemLabel,
  reportPhotoError,
  type Draft,
  type Photo,
  type User,
  type WorkOrder,
} from '@fieldwork/contracts';
import type { State, OfflineRepository } from '@fieldwork/offline';
import {
  inspectionCopy,
  languageTags,
  notebookCopy,
  signInCopy,
  type Locale,
} from '@fieldwork/strings';
import { client, dateLabel, message } from './lib';
import { Empty, PanelHeader, ActionGroup } from './components';
import ReportPrint from './ReportPrint';
import RescheduleOrder from './RescheduleOrder';
import ReassignOrder from './ReassignOrder';
import ReportHistory from './ReportHistory';
import SiteLocation from './SiteLocation';
import DraftExport from './DraftExport';
import { workerInspectionCopy } from './worker-inspection-copy';
import { workerMapCopy } from './worker-map-copy';
import { managerReviewCopy } from './manager-review-copy';
export default function OrderDetail({
  user,
  order,
  workers,
  closureDates,
  repo,
  state,
  online,
  locale = 'en',
  queuedRecovery,
  onBack,
  onRefresh,
  onNotice,
}: {
  user: User;
  order: WorkOrder;
  workers: User[];
  closureDates?: string[];
  repo: OfflineRepository;
  state: State;
  online: boolean;
  locale?: Locale;
  queuedRecovery?: ReactNode;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  onNotice: (notice: string) => void;
}) {
  const copy = inspectionCopy[locale];
  const web = workerInspectionCopy[locale];
  const manager = managerReviewCopy[locale];
  const status = notebookCopy[locale].status;
  const dateLocale = languageTags[locale];
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
  const [referenceCopy, setReferenceCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const queued = state.outbox.find((item) => item.orderId === order.id);
  const editable =
    user.role === 'worker' && ['ASSIGNED', 'CHANGES_REQUESTED'].includes(order.status) && !queued;
  const completed = completedAnswers(order.template, draft.answers);
  const sitePhotoSlots = availableSitePhotoSlots(order.template, draft.photos);
  const itemPhotosRequired = order.template.items.some((item) => item.requiresPhoto);
  async function copyReference() {
    try {
      await navigator.clipboard.writeText(order.reference);
      setReferenceCopy('copied');
    } catch {
      setReferenceCopy('failed');
    }
  }

  async function save(next: Draft) {
    currentDraft.current = next;
    setDraft(next);
    pendingWrites.current += 1;
    setSaving(true);
    setError('');
    try {
      await repo.saveDraft(order.id, next);
    } catch {
      setError(web.saveFailed);
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
      if (existing.length + files.length > MAX_REPORT_PHOTOS) throw new Error(web.photoLimit);
      if (itemId && existing.some((photo) => photo.itemId === itemId)) return;
      if (!itemId && files.length > availableSitePhotoSlots(order.template, existing))
        throw new Error(web.photoSpace);
      const added: Photo[] = [];
      for (const file of Array.from(files)) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2_000_000)
          throw new Error(web.photoFormat);
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
      setError(web.incomplete);
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
      const photoError = reportPhotoError(order.template, input.photos, copy.photoErrors);
      if (photoError) throw new Error(photoError.message);
      await repo.enqueue(order.id, input);
      onNotice(web.sentToOutbox);
      await onRefresh();
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  async function decide(decision: 'APPROVED' | 'CHANGES_REQUESTED') {
    if (!online || busy) return;
    setBusy(true);
    setError('');
    try {
      await client.review(order.id, order.version, decision, review);
      await onRefresh();
      onNotice(decision === 'APPROVED' ? manager.approved : manager.changesRequested);
    } catch (error) {
      setError(locale === 'en' ? message(error) : manager.failed);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="detail">
      <IconButton className="quiet back" label={web.back} onClick={onBack}>
        <ArrowLeftIcon aria-hidden="true" />
      </IconButton>
      <div className="detail-heading">
        <div>
          <div className="detail-identity">
            <div className="detail-reference">
              <span className="reference">{order.reference}</span>
              <IconButton
                label={copy.copyReference}
                tooltip={referenceCopy === 'copied' ? copy.referenceCopied : copy.copyReference}
                variant="ghost"
                onClick={() => void copyReference()}
              >
                {referenceCopy === 'copied' ? (
                  <CheckIcon aria-hidden="true" />
                ) : (
                  <CopyIcon aria-hidden="true" />
                )}
              </IconButton>
            </div>
            <span className="muted">{order.template.name}</span>
          </div>
          <div aria-live="polite" className={referenceCopy === 'failed' ? 'muted' : 'sr-only'}>
            {referenceCopy === 'copied' && copy.referenceCopied}
            {referenceCopy === 'failed' && copy.referenceCopyFailed}
          </div>
          <h1>{order.title}</h1>
        </div>
        <Badge className={`status status-${order.status.toLowerCase()}`}>
          {status[order.status]}
        </Badge>
      </div>
      <dl className="order-meta">
        <div>
          <dt>{copy.site}</dt>
          <dd>
            {order.site.name}
            <small>{order.site.address}</small>
          </dd>
        </div>
        <div>
          <dt>{copy.assignee}</dt>
          <dd>{order.assignee.name}</dd>
        </div>
        <div>
          <dt>{copy.duePriority}</dt>
          <dd>
            {dateLabel(order.dueDate, dateLocale)} · {copy.priority[order.priority]}
          </dd>
        </div>
      </dl>
      <div className="inspection-layout">
        <div className="inspection-content">
          <Card className="brief">
            <h2>{copy.brief}</h2>
            <p>{order.instructions || copy.defaultInstructions}</p>
          </Card>
          {order.review && (
            <Alert role="status" className="banner notice">
              <strong>
                {web.reviewer(status[order.review.decision], order.review.reviewedBy)}
              </strong>
              <p>{order.review.note || copy.accepted}</p>
            </Alert>
          )}
          {queued &&
            (queuedRecovery ?? (
              <Alert role="status" className="banner notice">
                <strong>{queued.state === 'blocked' ? copy.queueBlocked : copy.queued}</strong>
                <p>{queued.error ?? web.queuedHint}</p>
              </Alert>
            ))}
          {user.role === 'worker' && (state.drafts[order.id] || queued) && (
            <DraftExport orderId={order.id} repo={repo} disabled={saving || busy} locale={locale} />
          )}
          {editable && (
            <Form
              noValidate
              className="inspection-form"
              onSubmit={submit}
              validationCopy={signInCopy[locale].web}
            >
              <div className="section-heading">
                <h2>{copy.checklist}</h2>
                <span className="muted" role="status">
                  {saving ? copy.savingLocally : copy.draftSaved}
                </span>
              </div>
              <p className="inspection-progress" role="status">
                <strong>{completed}</strong> {web.progress(order.template.items.length)}
              </p>
              {order.template.items.map((item, index) => {
                const answer = draft.answers.find((answer) => answer.itemId === item.id)!;
                const bounds = readingBounds(item, copy.bounds);
                const readingError = readingInputError(item, answer.reading)
                  ? bounds && parseReading(answer.reading) !== null
                    ? copy.invalidBounds(bounds)
                    : copy.invalidNumber
                  : undefined;
                const hasPhoto = draft.photos.some((photo) => photo.itemId === item.id);
                return (
                  <FieldSet className="checklist-item" key={item.id}>
                    <FieldLegend id={`item-${item.id}`}>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      {checklistItemLabel(item)}
                    </FieldLegend>
                    {item.responseType === 'text' ? (
                      <Label>
                        <span className="sr-only">
                          {copy.response}: {item.label}
                        </span>
                        <Textarea
                          aria-label={`${copy.response}: ${item.label}`}
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
                          <span className="sr-only">
                            {copy.reading}: {checklistItemLabel(item)}
                          </span>
                          <Input
                            aria-label={`${copy.reading}: ${checklistItemLabel(item)}`}
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
                            {copy.readingHint(bounds)}
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
                            {copy.results[value]}
                          </Label>
                        ))}
                      </RadioGroup>
                    )}
                    <Label className="item-note">
                      <span className="sr-only">
                        {web.notes}: {item.label}
                      </span>
                      <Input
                        placeholder={copy.notePlaceholder}
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
                        <p className="muted">
                          {hasPhoto ? copy.photoAttached : copy.photoRequired}
                        </p>
                        {!hasPhoto && (
                          <Button
                            type="button"
                            variant="outline"
                            aria-label={web.addPhotoFor(checklistItemLabel(item))}
                            disabled={busy || draft.photos.length >= MAX_REPORT_PHOTOS}
                            onClick={() => {
                              photoItem.current = item.id;
                              itemPhotoInput.current?.click();
                            }}
                          >
                            <ImageSquareIcon aria-hidden="true" /> {web.addPhoto}
                          </Button>
                        )}
                      </div>
                    )}
                  </FieldSet>
                );
              })}
              <Label className="report-summary">
                {copy.summary}
                <Textarea
                  className="resize-none"
                  aria-label={copy.summary}
                  required
                  maxLength={4000}
                  rows={4}
                  placeholder={web.summaryHint}
                  value={draft.summary}
                  onChange={(event) => void save({ ...draft, summary: event.target.value })}
                />
              </Label>
              <section className="photo-section">
                <h2>
                  {copy.photos}{' '}
                  <span className="muted">
                    {draft.photos.length}/{MAX_REPORT_PHOTOS}
                  </span>
                </h2>
                {order.template.requiresPhoto && <p className="muted">{copy.photosRequired}</p>}
                <div className="photos">
                  {draft.photos.map((photo, index) => (
                    <div key={photo.id}>
                      <img
                        alt={`${web.attachment} ${index + 1}`}
                        src={`data:${photo.mimeType};base64,${photo.data}`}
                      />
                      {photo.itemId && <p>{reportItemLabel(order.template, photo.itemId)}</p>}
                      <IconButton
                        label={`${copy.removePhoto} ${index + 1}`}
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
                      <p className="muted">{copy.reservedPhotos}</p>
                    )}
                    {draft.photos.length === MAX_REPORT_PHOTOS &&
                      !order.template.items.every(
                        (item) =>
                          !item.requiresPhoto ||
                          draft.photos.some((photo) => photo.itemId === item.id),
                      ) && <p className="muted">{web.freeSpace}</p>}
                  </>
                )}
                <FileUpload
                  onFiles={photos}
                  disabled={busy || sitePhotoSlots === 0}
                  busy={busy}
                  locale={locale}
                />
              </section>
              {error && <FieldError>{error}</FieldError>}
              <div className="submit-bar">
                <p>{copy.retention}</p>
                <Button className="primary" disabled={busy || saving}>
                  {busy ? copy.savingReport : navigator.onLine ? web.submit : web.saveOffline}
                </Button>
              </div>
            </Form>
          )}
          {order.report && !editable && (
            <Card className="report">
              <div className="section-heading">
                <h2>{copy.report}</h2>
                <span className="muted">
                  {copy.submitted} {new Date(order.report.submittedAt).toLocaleString(dateLocale)}
                </span>
              </div>
              <ul className="report-checklist">
                {order.report.answers.map((answer) => (
                  <li key={answer.itemId}>
                    <strong>{reportItemLabel(order.template, answer.itemId)}</strong>
                    <span
                      className={`preserve-lines ${answer.value === 'fail' ? 'amber' : 'muted'}`}
                    >
                      {answer.value === 'text' || answer.value === 'number'
                        ? answerLabel(answer)
                        : copy.results[answer.value]}
                    </span>
                    {answer.note && <p>{answer.note}</p>}
                  </li>
                ))}
              </ul>
              <h3>{copy.reportSummary}</h3>
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
                        alt={`${copy.submittedPhoto} ${index + 1}`}
                      />
                      {photo.itemId && <p>{reportItemLabel(order.template, photo.itemId)}</p>}
                    </a>
                  ))}
                </div>
              )}
              {user.role === 'manager' && order.status === 'SUBMITTED' && (
                <section className="review-box">
                  <h2>{manager.heading}</h2>
                  <Label>
                    {manager.note}
                    <Textarea
                      className="resize-none"
                      aria-label={manager.note}
                      maxLength={2000}
                      rows={3}
                      value={review}
                      onChange={(event) => setReview(event.target.value)}
                      placeholder={manager.noteHint}
                    />
                  </Label>
                  {error && <FieldError>{error}</FieldError>}
                  {!online && <p className="muted">{manager.offline}</p>}
                  <ActionGroup className="review-actions">
                    <Button
                      className="quiet"
                      disabled={!online || busy || !review.trim()}
                      onClick={() => void decide('CHANGES_REQUESTED')}
                    >
                      <PencilSimpleIcon aria-hidden="true" /> {manager.requestChanges}
                    </Button>
                    <Button
                      className="primary"
                      disabled={!online || busy}
                      onClick={() => void decide('APPROVED')}
                    >
                      <CheckIcon aria-hidden="true" /> {busy ? manager.saving : manager.approve}
                    </Button>
                  </ActionGroup>
                </section>
              )}
            </Card>
          )}
          {user.role === 'manager' && !order.report && (
            <Empty title={manager.waiting} description={manager.waitingHint} />
          )}
        </div>
        <aside className="inspection-context" aria-label={web.toolsRegion} lang={locale}>
          <Card className="order-tools">
            <PanelHeader title={web.tools} />
            {user.role === 'manager' &&
              ['ASSIGNED', 'CHANGES_REQUESTED'].includes(order.status) && (
                <>
                  <ReassignOrder
                    order={order}
                    workers={workers}
                    online={online}
                    locale={locale}
                    onSaved={async (updated) => {
                      await repo.cacheOrder(updated);
                    }}
                    onNotice={onNotice}
                  />
                  <RescheduleOrder
                    order={order}
                    closureDates={closureDates}
                    online={online}
                    locale={locale}
                    onSaved={async (updated) => {
                      await repo.cacheOrder(updated);
                    }}
                    onNotice={onNotice}
                  />
                </>
              )}
            {order.report && <ReportPrint order={order} report={order.report} locale={locale} />}
            <ReportHistory orderId={order.id} online={online} locale={locale} />
          </Card>
          <SiteLocation
            key={order.site.id}
            site={order.site}
            online={online}
            locale={locale}
            beforeReload={async () => {
              const map = workerMapCopy[locale];
              if (busy || pendingWrites.current > 0) throw new Error(map.waitBeforeReload);
              if (review.trim()) throw new Error(manager.unsaved);
              if (editable) {
                const snapshot = currentDraft.current;
                await repo.saveDraft(order.id, snapshot);
                if (pendingWrites.current > 0 || snapshot !== currentDraft.current)
                  throw new Error(map.draftChanged);
              }
            }}
          />
        </aside>
      </div>
    </article>
  );
}
