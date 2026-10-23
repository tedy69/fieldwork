import { Button } from './components/ui/button';
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
  blankDraft,
  type Draft,
  type Photo,
  type User,
  type WorkOrder,
} from '@fieldwork/contracts';
import type { State, OfflineRepository } from '@fieldwork/offline';
import { client, labels, dateLabel, message } from './lib';
import { Empty } from './components';
import ReportPrint from './ReportPrint';
import RescheduleOrder from './RescheduleOrder';
import ReassignOrder from './ReassignOrder';
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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState('');
  const queued = state.outbox.find((item) => item.orderId === order.id);
  const editable =
    user.role === 'worker' && ['ASSIGNED', 'CHANGES_REQUESTED'].includes(order.status) && !queued;
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
  async function photos(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    setError('');
    try {
      if (draft.photos.length + files.length > 3) throw new Error('Attach up to 3 photos.');
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
        added.push({ id: crypto.randomUUID(), mimeType: file.type as Photo['mimeType'], data });
      }
      await save({ ...currentDraft.current, photos: [...currentDraft.current.photos, ...added] });
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const input = ReportInputSchema.parse({
        ...draft,
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
      <Button className="text-button back" onClick={onBack}>
        ← Work orders
      </Button>
      <div className="detail-heading">
        <div>
          <span className="reference">
            {order.reference} / {order.template.name}
          </span>
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
      {user.role === 'manager' && ['ASSIGNED', 'CHANGES_REQUESTED'].includes(order.status) && (
        <ReassignOrder
          order={order}
          workers={workers}
          online={online}
          onSaved={async (updated) => {
            await repo.cacheOrder(updated);
          }}
          onNotice={onNotice}
        />
      )}
      {user.role === 'manager' && ['ASSIGNED', 'CHANGES_REQUESTED'].includes(order.status) && (
        <RescheduleOrder
          order={order}
          online={online}
          onSaved={async (updated) => {
            await repo.cacheOrder(updated);
          }}
          onNotice={onNotice}
        />
      )}
      {order.report && <ReportPrint order={order} report={order.report} />}
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
      {editable && (
        <form className="inspection-form" onSubmit={submit}>
          <div className="section-heading">
            <h2>Inspection checklist</h2>
            <span className="muted" role="status">
              {saving ? 'Saving locally…' : 'Draft saved on this device'}
            </span>
          </div>
          {order.template.items.map((item, index) => {
            const answer = draft.answers.find((answer) => answer.itemId === item.id)!;
            return (
              <FieldSet className="checklist-item" key={item.id}>
                <FieldLegend id={`item-${item.id}`}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  {item.label}
                </FieldLegend>
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
                          entry.itemId === item.id ? { ...entry, note: event.target.value } : entry,
                        ),
                      })
                    }
                  />
                </Label>
              </FieldSet>
            );
          })}
          <Label className="report-summary">
            Inspection summary
            <Textarea
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
              Site photos <span className="muted">{draft.photos.length}/3</span>
            </h2>
            <div className="photos">
              {draft.photos.map((photo, index) => (
                <div key={photo.id}>
                  <img
                    alt={`Site attachment ${index + 1}`}
                    src={`data:${photo.mimeType};base64,${photo.data}`}
                  />
                  <Button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      void save({
                        ...draft,
                        photos: draft.photos.filter((entry) => entry.id !== photo.id),
                      })
                    }
                  >
                    Remove photo {index + 1}
                  </Button>
                </div>
              ))}
            </div>
            <FileUpload onFiles={photos} disabled={busy || draft.photos.length >= 3} busy={busy} />
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
        </form>
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
                <strong>
                  {order.template.items.find((item) => item.id === answer.itemId)?.label}
                </strong>
                <span className={answer.value === 'fail' ? 'amber' : 'muted'}>
                  {answer.value === 'fail'
                    ? 'Issue found'
                    : answer.value === 'pass'
                      ? 'Pass'
                      : 'N/A'}
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
                  <img src={client.photoUrl(photo.id)} alt={`Submitted site photo ${index + 1}`} />
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
                  aria-label="Review note"
                  maxLength={2000}
                  rows={3}
                  value={review}
                  onChange={(event) => setReview(event.target.value)}
                  placeholder="Add feedback or explain what needs to change."
                />
              </Label>
              {error && <FieldError>{error}</FieldError>}
              <div className="review-actions">
                <Button
                  className="quiet"
                  disabled={busy || !review.trim()}
                  onClick={() => void decide('CHANGES_REQUESTED')}
                >
                  Request changes
                </Button>
                <Button className="primary" disabled={busy} onClick={() => void decide('APPROVED')}>
                  {busy ? 'Saving review…' : 'Approve inspection'}
                </Button>
              </div>
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
    </article>
  );
}
