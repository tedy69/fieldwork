import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  role: z.enum(['manager', 'worker']),
});
export type User = z.infer<typeof UserSchema>;
export const WorkerAccountSchema = z.object({
  user: UserSchema.extend({ role: z.literal('worker') }),
  enabled: z.boolean(),
  version: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime().nullable(),
  updatedBy: UserSchema.pick({ id: true, name: true }).nullable(),
});
export type WorkerAccount = z.infer<typeof WorkerAccountSchema>;
export const UpdateWorkerAccessSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    enabled: z.boolean(),
  })
  .strict();
export type UpdateWorkerAccess = z.infer<typeof UpdateWorkerAccessSchema>;
export const WorkerQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(100).optional(),
  })
  .strict();
export type WorkerQuery = Partial<z.infer<typeof WorkerQuerySchema>>;
export const WorkerPageSchema = z.object({
  data: z.array(WorkerAccountSchema),
  total: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
});
export const WorkerAccessEventSchema = z.object({
  id: z.number().int().positive(),
  workerId: z.string(),
  enabled: z.boolean(),
  at: z.iso.datetime(),
  actor: UserSchema.pick({ id: true, name: true }),
});
export const WorkerAccessHistoryQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.coerce.number().int().positive().optional(),
  })
  .strict();
export type WorkerAccessHistoryQuery = Partial<z.infer<typeof WorkerAccessHistoryQuerySchema>>;
export const WorkerAccessHistoryPageSchema = z.object({
  data: z.array(WorkerAccessEventSchema),
  total: z.number().int().nonnegative(),
  nextCursor: z.number().int().positive().nullable(),
});
export const InvitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const CreateInvitationSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
  })
  .strict();
export type CreateInvitation = z.infer<typeof CreateInvitationSchema>;
export const InvitationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  createdBy: UserSchema.pick({ id: true, name: true }),
  status: z.enum(['pending', 'accepted', 'revoked', 'expired']),
  acceptedAt: z.iso.datetime().nullable(),
  acceptedUserId: z.uuid().nullable(),
  revokedAt: z.iso.datetime().nullable(),
});
export type Invitation = z.infer<typeof InvitationSchema>;
export const InvitationReceiptSchema = z.object({
  invitation: InvitationSchema,
  token: InvitationTokenSchema,
});
export const InvitationQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.uuid().optional(),
  })
  .strict();
export type InvitationQuery = Partial<z.infer<typeof InvitationQuerySchema>>;
export const InvitationPageSchema = z.object({
  data: z.array(InvitationSchema),
  total: z.number().int().nonnegative(),
  nextCursor: z.uuid().nullable(),
});
export const InvitationAccessSchema = z.object({ token: InvitationTokenSchema }).strict();
export const AcceptInvitationSchema = InvitationAccessSchema.extend({
  password: z.string().min(12).max(256),
});
export const InvitationPreviewSchema = z.object({
  name: z.string(),
  email: z.email(),
  expiresAt: z.iso.datetime(),
});
export const InvitationAcceptanceSchema = z.object({
  user: UserSchema.extend({ role: z.literal('worker') }),
});
export const CreatePasswordResetSchema = z
  .object({ expectedAccessVersion: z.number().int().nonnegative() })
  .strict();
export type CreatePasswordReset = z.infer<typeof CreatePasswordResetSchema>;
export const PasswordResetSchema = z.object({
  id: z.uuid(),
  workerId: z.string(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  createdBy: UserSchema.pick({ id: true, name: true }),
  status: z.enum(['pending', 'used', 'revoked', 'expired', 'unavailable']),
  usedAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
});
export const PasswordResetReceiptSchema = z.object({
  reset: PasswordResetSchema,
  token: InvitationTokenSchema,
});
export const PasswordResetCurrentSchema = z.object({ reset: PasswordResetSchema.nullable() });
export const PasswordResetAccessSchema = InvitationAccessSchema;
export const CompletePasswordResetSchema = AcceptInvitationSchema;
export const PasswordResetPreviewSchema = InvitationPreviewSchema;
export const PasswordResetCompletionSchema = InvitationAcceptanceSchema;
export const CoordinatesSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .strict();
export type Coordinates = z.infer<typeof CoordinatesSchema>;
export const SiteSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  coordinates: CoordinatesSchema.optional(),
});
export type Site = z.infer<typeof SiteSchema>;
export const CreateSiteSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    address: z.string().trim().min(3).max(250),
    coordinates: CoordinatesSchema.optional(),
  })
  .strict();
export const UpdateSiteLocationSchema = z
  .object({
    expectedCoordinates: CoordinatesSchema.nullable(),
    coordinates: CoordinatesSchema.nullable(),
  })
  .strict();
export type UpdateSiteLocation = z.infer<typeof UpdateSiteLocationSchema>;
const secureUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
};
export const MapProviderSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    tileUrlTemplate: z
      .string()
      .max(2000)
      .refine(
        (value) => {
          const tokens = ['{z}', '{x}', '{y}'];
          if (/\s/.test(value) || tokens.some((token) => value.split(token).length !== 2))
            return false;
          const resolved = tokens.reduce((url, token) => url.replace(token, '0'), value);
          return !/[{}]/.test(resolved) && secureUrl(resolved) && !new URL(resolved).hash;
        },
        {
          message:
            'Use an HTTPS tile URL with one each of {z}, {x}, and {y}, without credentials or a fragment.',
        },
      ),
    attributionText: z.string().trim().min(1).max(200),
    attributionUrl: z
      .string()
      .max(1000)
      .refine(secureUrl, { message: 'Use an HTTPS attribution URL without credentials.' }),
    maxZoom: z.number().int().min(1).max(19),
  })
  .strict();
export type MapProvider = z.infer<typeof MapProviderSchema>;
export const MapSettingsSchema = z.object({ provider: MapProviderSchema.nullable() });
export const ResponseTypeSchema = z.enum(['check', 'text', 'number']);
function decimalReading(value: number): string {
  const [mantissa, exponent] = Math.abs(value).toString().split('e');
  if (!exponent) return String(value);
  const [whole, fraction = ''] = mantissa.split('.');
  const digits = whole + fraction;
  const point = whole.length + Number(exponent);
  const decimal =
    point <= 0
      ? `0.${'0'.repeat(-point)}${digits}`
      : point >= digits.length
        ? digits.padEnd(point, '0')
        : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return value < 0 ? `-${decimal}` : decimal;
}
const ReadingBoundSchema = z.number().refine((value) => decimalReading(value).length <= 100, {
  message: 'Use a limit that fits in 100 decimal characters.',
});
const ReadingRuleSchema = z
  .object({
    unit: z
      .string()
      .trim()
      .min(1)
      .max(24)
      .regex(/^[^\u0000-\u001f\u007f]+$/u)
      .optional(),
    min: ReadingBoundSchema.optional(),
    max: ReadingBoundSchema.optional(),
  })
  .strict()
  .refine(({ min, max }) => min === undefined || max === undefined || min <= max, {
    path: ['max'],
    message: 'Maximum must be at least the minimum.',
  });
const ItemResponseFields = {
  responseType: ResponseTypeSchema.optional(),
  readingRule: ReadingRuleSchema.optional(),
  requiresPhoto: z.boolean().optional(),
};
function validItemResponse(item: {
  responseType?: z.infer<typeof ResponseTypeSchema>;
  readingRule?: unknown;
}) {
  return !item.readingRule || item.responseType === 'number';
}
const readingRuleIssue = {
  path: ['readingRule'],
  message: 'Units and limits are available only for numeric readings.',
};
const ItemSchemaBase = z.object({ id: z.string(), label: z.string(), ...ItemResponseFields });
export const ItemSchema = ItemSchemaBase.refine(validItemResponse, readingRuleIssue);
export type ChecklistItem = z.infer<typeof ItemSchema>;
export const CreateItemSchema = z.union([
  z.string().trim().min(2).max(250),
  z
    .object({
      label: z.string().trim().min(2).max(250),
      ...ItemResponseFields,
      responseType: ResponseTypeSchema,
    })
    .strict()
    .refine(validItemResponse, readingRuleIssue),
]);
export const TemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  items: z.array(ItemSchema),
  requiresPhoto: z.boolean().optional(),
});
export type CreateItem = z.infer<typeof CreateItemSchema>;
export const MAX_REPORT_PHOTOS = 3;
export const CreateTemplateSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    items: z.array(CreateItemSchema).min(1).max(50),
    requiresPhoto: z.boolean().optional(),
  })
  .strict()
  .refine(
    ({ items }) =>
      items.filter((item) => typeof item !== 'string' && item.requiresPhoto).length <=
      MAX_REPORT_PHOTOS,
    { path: ['items'], message: 'Require photos for up to 3 checklist items.' },
  );
export const PHOTO_REQUIRED_MESSAGE =
  'Attach at least one site photo before submitting this checklist.';
export const PhotoSchema = z.object({
  id: z.uuid(),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  data: z.string().min(1).max(2_800_000),
  itemId: z.string().min(1).max(100).optional(),
});
export type Photo = z.infer<typeof PhotoSchema>;
function missingItemPhotos(
  template: z.infer<typeof TemplateSchema>,
  photos: Pick<Photo, 'itemId'>[],
) {
  return template.items.filter(
    (item) => item.requiresPhoto && !photos.some((photo) => photo.itemId === item.id),
  );
}
export function availableSitePhotoSlots(
  template: z.infer<typeof TemplateSchema>,
  photos: Pick<Photo, 'itemId'>[],
) {
  return Math.max(
    0,
    MAX_REPORT_PHOTOS - photos.length - missingItemPhotos(template, photos).length,
  );
}
export function reportPhotoError(
  template: z.infer<typeof TemplateSchema>,
  photos: Pick<Photo, 'itemId'>[],
  copy?: { invalidItem: string; missingItem: (label: string) => string; missingSite: string },
) {
  if (
    photos.some(
      (photo) =>
        photo.itemId !== undefined && !template.items.some((item) => item.id === photo.itemId),
    )
  )
    return {
      code: 'PHOTO_ITEM',
      message: copy?.invalidItem ?? 'Link each item photo to a question on this checklist.',
    };
  const [missing] = missingItemPhotos(template, photos);
  if (missing)
    return {
      code: 'PHOTO_REQUIRED',
      message:
        copy?.missingItem(checklistItemLabel(missing)) ??
        `Attach a photo for ${checklistItemLabel(missing)}.`,
    };
  if (template.requiresPhoto && photos.length === 0)
    return { code: 'PHOTO_REQUIRED', message: copy?.missingSite ?? PHOTO_REQUIRED_MESSAGE };
}
const AnswerFieldsSchema = z.object({
  itemId: z.string().max(100),
  value: z.enum(['pass', 'fail', 'na', 'text', 'number']),
  note: z.string().max(1000),
  text: z.string().max(1000).optional(),
  reading: z.number().optional(),
});
export const AnswerSchema = AnswerFieldsSchema.superRefine((answer, context) => {
  if (answer.value === 'text' && !answer.text?.trim())
    context.addIssue({ code: 'custom', path: ['text'], message: 'Enter a text response.' });
  if (answer.value !== 'text' && answer.text !== undefined)
    context.addIssue({
      code: 'custom',
      path: ['text'],
      message: 'Text belongs only to a text response.',
    });
  if (answer.value === 'number' && answer.reading === undefined)
    context.addIssue({ code: 'custom', path: ['reading'], message: 'Enter a numeric reading.' });
  if (answer.value !== 'number' && answer.reading !== undefined)
    context.addIssue({
      code: 'custom',
      path: ['reading'],
      message: 'Readings belong only to a numeric response.',
    });
});
export function answerLabel(answer: z.infer<typeof AnswerSchema>): string {
  if (answer.value === 'text') return answer.text!;
  if (answer.value === 'number') return String(answer.reading);
  return answer.value === 'pass' ? 'Pass' : answer.value === 'fail' ? 'Issue found' : 'N/A';
}
export function checklistItemLabel(item: ChecklistItem): string {
  return item.readingRule?.unit ? `${item.label} (${item.readingRule.unit})` : item.label;
}
export function reportItemLabel(template: z.infer<typeof TemplateSchema>, itemId: string): string {
  const item = template.items.find((entry) => entry.id === itemId);
  return item ? checklistItemLabel(item) : itemId;
}
export function readingBounds(
  item: ChecklistItem,
  copy = {
    atMost: (max: string) => `at most ${max}`,
    atLeast: (min: string) => `at least ${min}`,
    between: (min: string, max: string) => `from ${min} to ${max}`,
  },
): string | undefined {
  const { min, max, unit } = item.readingRule ?? {};
  if (min === undefined && max === undefined) return undefined;
  const range =
    min === undefined
      ? copy.atMost(decimalReading(max!))
      : max === undefined
        ? copy.atLeast(decimalReading(min))
        : copy.between(decimalReading(min), decimalReading(max));
  return unit ? `${range} ${unit}` : range;
}
function readingRangeError(item: ChecklistItem, reading: number): string | undefined {
  const { min, max } = item.readingRule ?? {};
  if ((min !== undefined && reading < min) || (max !== undefined && reading > max))
    return `Reading must be ${readingBounds(item)}.`;
}
export function reportReadingError(
  template: z.infer<typeof TemplateSchema>,
  answers: z.infer<typeof AnswerSchema>[],
): string | undefined {
  for (const item of template.items) {
    if (!item.readingRule) continue;
    const reading = answers.find((entry) => entry.itemId === item.id)?.reading;
    if (reading === undefined) continue;
    const error = readingRangeError(item, reading);
    if (error) return `${checklistItemLabel(item)}: ${error}`;
  }
}
export function answersMatchTemplate(
  template: z.infer<typeof TemplateSchema>,
  answers: z.infer<typeof AnswerSchema>[],
): boolean {
  const ids = new Set(answers.map((answer) => answer.itemId));
  return (
    answers.length === template.items.length &&
    ids.size === answers.length &&
    template.items.every((item) => {
      const answer = answers.find((entry) => entry.itemId === item.id);
      return (
        answer &&
        (item.responseType === 'text' || item.responseType === 'number'
          ? answer.value === item.responseType
          : ['pass', 'fail', 'na'].includes(answer.value))
      );
    })
  );
}
export const ReportInputSchema = z
  .object({
    mutationId: z.uuid(),
    baseVersion: z.number().int().positive(),
    answers: z.array(AnswerSchema).min(1).max(50),
    summary: z.string().trim().min(1).max(4000),
    photos: z.array(PhotoSchema).max(MAX_REPORT_PHOTOS),
  })
  .strict();
export type ReportInput = z.infer<typeof ReportInputSchema>;
export const ReportSchema = z.object({
  id: z.string(),
  submittedAt: z.string(),
  submittedBy: z.string(),
  answers: z.array(AnswerSchema),
  summary: z.string(),
  photos: z.array(
    z.object({ id: z.string(), mimeType: z.string(), itemId: PhotoSchema.shape.itemId }),
  ),
});
export const StatusSchema = z.enum(['ASSIGNED', 'SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED']);
export const WorkOrderSchema = z.object({
  id: z.string(),
  reference: z.string(),
  title: z.string(),
  instructions: z.string(),
  site: SiteSchema,
  assignee: UserSchema,
  template: TemplateSchema,
  dueDate: z.string(),
  priority: z.enum(['routine', 'urgent']),
  status: StatusSchema,
  version: z.number().int(),
  createdAt: z.string(),
  report: ReportSchema.nullable(),
  review: z
    .object({
      decision: z.enum(['APPROVED', 'CHANGES_REQUESTED']),
      note: z.string(),
      reviewedAt: z.string(),
      reviewedBy: z.string(),
    })
    .nullable(),
});
export type WorkOrder = z.infer<typeof WorkOrderSchema>;

export function localDate(now = new Date()) {
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function isOverdue(order: Pick<WorkOrder, 'dueDate' | 'status'>, today: string) {
  return order.status !== 'APPROVED' && order.dueDate < today;
}

export function isDueToday(order: Pick<WorkOrder, 'dueDate' | 'status'>, today: string) {
  return order.status !== 'APPROVED' && order.dueDate === today;
}

export const ReportSnapshotSchema = WorkOrderSchema.omit({
  status: true,
  version: true,
  createdAt: true,
  review: true,
  report: true,
}).extend({
  assignee: UserSchema.pick({ id: true, name: true }),
  report: ReportSchema,
});
export const ReportRevisionSchema = z
  .object({
    snapshot: ReportSnapshotSchema,
    submissionVersion: z.number().int().positive().nullable(),
    source: z.enum(['submission', 'saved_snapshot']),
    reviewStatus: z.enum(['awaiting_review', 'reviewed', 'not_retained']),
    review: WorkOrderSchema.shape.review,
  })
  .refine((revision) => (revision.reviewStatus === 'reviewed') === (revision.review !== null), {
    message: 'Recorded review status must match its saved review.',
  });
export type ReportRevision = z.infer<typeof ReportRevisionSchema>;
export const ReportHistoryPageSchema = z.object({
  data: z.array(ReportRevisionSchema),
  total: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
});
export const CreateOrderSchema = z
  .object({
    title: z.string().trim().min(3).max(140),
    instructions: z.string().max(4000),
    siteId: z.string(),
    assigneeId: z.string(),
    templateId: z.string(),
    dueDate: z.iso.date(),
    priority: z.enum(['routine', 'urgent']),
  })
  .strict();
export type CreateOrder = z.infer<typeof CreateOrderSchema>;
export const RecurrenceFrequencySchema = z.enum([
  'daily',
  'weekly',
  'biweekly',
  'weekdays',
  'monthly',
  'month-end',
  'month-end-weekday',
  'quarterly',
]);
function lastDayOfMonth(date: Date, weekdaysOnly: boolean) {
  const end = new Date(date);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  if (weekdaysOnly) {
    while (end.getUTCDay() === 0 || end.getUTCDay() === 6) end.setUTCDate(end.getUTCDate() - 1);
  }
  return end.getUTCDate();
}

function advanceRecurrence(
  date: Date,
  frequency: z.infer<typeof RecurrenceFrequencySchema>,
  originalDay: number,
) {
  const anchored = frequency === 'monthly' || frequency === 'quarterly';
  if (anchored || frequency === 'month-end' || frequency === 'month-end-weekday') {
    const months = frequency === 'quarterly' ? 3 : 1;
    date.setUTCMonth(date.getUTCMonth() + months, 1);
    const lastDay = lastDayOfMonth(date, frequency === 'month-end-weekday');
    date.setUTCDate(anchored ? Math.min(originalDay, lastDay) : lastDay);
    return;
  }
  const days = { daily: 1, weekdays: 1, weekly: 7, biweekly: 14 }[frequency];
  date.setUTCDate(date.getUTCDate() + days);
  if (frequency === 'weekdays')
    while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1);
}
export const SkippedDatesSchema = z
  .array(z.iso.date())
  .max(52)
  .refine((dates) => new Set(dates).size === dates.length, {
    message: 'Choose each skipped date only once.',
  });
const MAX_RECURRENCE_OCCURRENCES = 52;
function scheduledDates(
  input: {
    dueDate: string;
    frequency: z.infer<typeof RecurrenceFrequencySchema>;
    occurrences: number;
    skipDates?: string[];
  },
  through?: string,
): string[] | null {
  const date = new Date(`${input.dueDate}T12:00:00Z`);
  const originalDay = date.getUTCDate();
  const skipped = new Set(input.skipDates);
  const dates: string[] = [];
  // A bounded set of exclusions adds at most that many candidate dates.
  for (let index = 0; index < input.occurrences + skipped.size; index++) {
    if (!Number.isFinite(date.getTime())) return null;
    if (date.getUTCFullYear() > 9999) return through ? dates : null;
    const value = date.toISOString().slice(0, 10);
    if (through && value > through) return dates;
    if (!skipped.has(value)) dates.push(value);
    if (dates.length === input.occurrences) return dates;
    advanceRecurrence(date, input.frequency, originalDay);
  }
  return null;
}
export const RecurrenceSchema = z
  .object({
    dueDate: z.iso.date(),
    frequency: RecurrenceFrequencySchema,
    occurrences: z.number().int().min(2).max(MAX_RECURRENCE_OCCURRENCES),
    skipDates: SkippedDatesSchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      !Number.isInteger(input.occurrences) ||
      input.occurrences < 2 ||
      input.occurrences > MAX_RECURRENCE_OCCURRENCES
    )
      return;
    const first = new Date(`${input.dueDate}T12:00:00Z`);
    if (input.skipDates && input.skipDates.length > 52) return;
    if (input.skipDates?.some((date) => date <= input.dueDate))
      context.addIssue({
        code: 'custom',
        message:
          'Skipped dates must be after the first due date. Change the first date to skip it.',
        path: ['skipDates'],
      });
    if (input.frequency === 'weekdays' && (first.getUTCDay() === 0 || first.getUTCDay() === 6))
      context.addIssue({
        code: 'custom',
        message: 'Choose a Monday–Friday first date for weekday repeats.',
        path: ['dueDate'],
      });
    const weekdayEnd = input.frequency === 'month-end-weekday';
    if (
      (input.frequency === 'month-end' || weekdayEnd) &&
      first.getUTCDate() !== lastDayOfMonth(first, weekdayEnd)
    )
      context.addIssue({
        code: 'custom',
        message: `Choose the last ${weekdayEnd ? 'weekday' : 'day'} of a month for the first visit.`,
        path: ['dueDate'],
      });
    if (!scheduledDates(input))
      context.addIssue({
        code: 'custom',
        message: 'All occurrences must fall within a four-digit calendar year.',
        path: ['dueDate'],
      });
  });
export type Recurrence = z.infer<typeof RecurrenceSchema>;
export function recurrenceDates(input: Recurrence): string[] {
  const schedule = RecurrenceSchema.parse(input);
  return scheduledDates(schedule)!;
}
export function recurrenceDatesThrough(
  input: Omit<Recurrence, 'occurrences'>,
  through: string,
): string[] {
  const end = z.iso.date().parse(through);
  const schedule = RecurrenceSchema.parse({ ...input, occurrences: 2 });
  const dates = scheduledDates({ ...schedule, occurrences: MAX_RECURRENCE_OCCURRENCES + 1 }, end);
  return dates && dates.length >= 2 && dates.length <= MAX_RECURRENCE_OCCURRENCES ? dates : [];
}
export const CreateOrderSeriesSchema = CreateOrderSchema.extend({
  mutationId: z.uuid(),
  expectedActorId: z.string().min(1).max(100).optional(),
  frequency: RecurrenceFrequencySchema,
  occurrences: z.number().int().min(2).max(MAX_RECURRENCE_OCCURRENCES),
  skipDates: SkippedDatesSchema.optional(),
}).refine(
  (input) =>
    RecurrenceSchema.safeParse({
      dueDate: input.dueDate,
      frequency: input.frequency,
      occurrences: input.occurrences,
      skipDates: input.skipDates,
    }).success,
  { message: 'Choose a valid recurrence within a four-digit calendar year.', path: ['dueDate'] },
);
export type CreateOrderSeries = z.infer<typeof CreateOrderSeriesSchema>;
export const OrderSeriesReceiptSchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  frequency: RecurrenceFrequencySchema,
  skipDates: SkippedDatesSchema.optional(),
  orders: z.array(WorkOrderSchema).min(2).max(52),
});
export type OrderSeriesReceipt = z.infer<typeof OrderSeriesReceiptSchema>;
export const OrderSeriesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.uuid().optional(),
    q: z.string().trim().max(200).optional(),
  })
  .strict();
export type OrderSeriesQuery = Partial<z.infer<typeof OrderSeriesQuerySchema>>;
export const OrderSeriesSummarySchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  createdBy: UserSchema.pick({ id: true, name: true }),
  title: z.string(),
  frequency: RecurrenceFrequencySchema,
  skipDates: SkippedDatesSchema.optional(),
  occurrences: z.number().int().min(2).max(MAX_RECURRENCE_OCCURRENCES),
  firstDueDate: z.iso.date(),
  lastDueDate: z.iso.date(),
  assignee: UserSchema.pick({ id: true, name: true }),
});
export type OrderSeriesSummary = z.infer<typeof OrderSeriesSummarySchema>;
export const OrderSeriesPageSchema = z.object({
  data: z.array(OrderSeriesSummarySchema),
  total: z.number().int().nonnegative(),
  nextCursor: z.uuid().nullable(),
});
export const OrderSeriesDetailSchema = OrderSeriesSummarySchema.extend({
  orders: z
    .array(
      z.object({
        occurrence: z.number().int().min(1).max(52),
        plannedDueDate: z.iso.date(),
        order: WorkOrderSchema,
      }),
    )
    .min(2)
    .max(52),
});
export type OrderSeriesDetail = z.infer<typeof OrderSeriesDetailSchema>;
export const RescheduleOrderSchema = z
  .object({ baseVersion: z.number().int().positive(), dueDate: z.iso.date() })
  .strict();
export type RescheduleOrder = z.infer<typeof RescheduleOrderSchema>;
export const ReassignOrderSchema = z
  .object({ baseVersion: z.number().int().positive(), assigneeId: z.string().min(1).max(100) })
  .strict();
export type ReassignOrder = z.infer<typeof ReassignOrderSchema>;
export const ReviewSchema = z
  .object({
    baseVersion: z.number().int().positive(),
    decision: z.enum(['APPROVED', 'CHANGES_REQUESTED']),
    note: z.string().trim().max(2000),
  })
  .strict()
  .refine((value) => value.decision !== 'CHANGES_REQUESTED' || value.note.length > 0, {
    message: 'Explain what needs to change.',
    path: ['note'],
  });
export const CatalogSiteSchema = SiteSchema.extend({
  closureDates: SkippedDatesSchema.optional(),
});
export type CatalogSite = z.infer<typeof CatalogSiteSchema>;
export const UpdateSiteClosuresSchema = z
  .object({
    expectedDates: SkippedDatesSchema,
    dates: SkippedDatesSchema,
  })
  .strict();
export type UpdateSiteClosures = z.infer<typeof UpdateSiteClosuresSchema>;
export const CatalogSchema = z.object({
  users: z.array(UserSchema),
  sites: z.array(CatalogSiteSchema),
  templates: z.array(TemplateSchema),
});
export type Catalog = z.infer<typeof CatalogSchema>;
export const OrderPageSchema = z.object({
  data: z.array(WorkOrderSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});
export const OrderSearchQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    status: StatusSchema.optional(),
    assigneeId: z.string().min(1).max(100).optional(),
    priority: z.enum(['routine', 'urgent']).optional(),
    dueFrom: z.iso.date().optional(),
    dueThrough: z.iso.date().optional(),
    overdueBefore: z.iso.date().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().min(1).max(100).optional(),
  })
  .strict()
  .refine((query) => !query.dueFrom || !query.dueThrough || query.dueFrom <= query.dueThrough, {
    message: 'The end date must be on or after the start date.',
    path: ['dueThrough'],
  });
export type OrderSearchQuery = Partial<z.infer<typeof OrderSearchQuerySchema>>;
export const OrderSearchPageSchema = z.object({
  data: z.array(WorkOrderSchema),
  total: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
});
export const SessionSchema = z.object({ user: UserSchema, token: z.string() });
export const MeSchema = z.object({ user: UserSchema });
export const DraftSchema = z.object({
  answers: z
    .array(
      AnswerFieldsSchema.extend({
        value: z.enum(['', 'pass', 'fail', 'na', 'text', 'number']),
        reading: z.string().max(100).optional(),
      }),
    )
    .max(50),
  summary: z.string().max(4000),
  photos: z.array(PhotoSchema).max(MAX_REPORT_PHOTOS),
});
export type Draft = z.infer<typeof DraftSchema>;
export function parseReading(value: string | undefined): number | null {
  const text = value?.trim() ?? '';
  if (text.length > 100 || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const reading = Number(text);
  return Number.isFinite(reading) ? reading : null;
}
export function answerComplete(answer: Draft['answers'][number]): boolean {
  if (answer.value === 'number') return parseReading(answer.reading) !== null;
  return answer.value === 'text' ? Boolean(answer.text?.trim()) : Boolean(answer.value);
}
export function readingInputError(
  item: ChecklistItem,
  input: string | undefined,
): string | undefined {
  if (!input) return undefined;
  const reading = parseReading(input);
  return reading === null
    ? 'Enter a number, such as 12.5 or -3.'
    : readingRangeError(item, reading);
}
export function completedAnswers(
  template: z.infer<typeof TemplateSchema>,
  answers: Draft['answers'],
): number {
  return template.items.filter((item) => {
    const answer = answers.find((entry) => entry.itemId === item.id);
    return (
      answer &&
      answerComplete(answer) &&
      (answer.value !== 'number' || !readingInputError(item, answer.reading))
    );
  }).length;
}
export function reportAnswers(answers: Draft['answers']): ReportInput['answers'] {
  return z
    .array(AnswerSchema)
    .parse(
      answers.map((answer) =>
        answer.value === 'number'
          ? { ...answer, reading: parseReading(answer.reading) ?? undefined }
          : answer,
      ),
    );
}
export const LocalReportExportSchema = z
  .object({
    format: z.literal('fieldwork-local-report'),
    formatVersion: z.literal(1),
    exportedAt: z.iso.datetime(),
    orderId: z.string(),
    assignment: WorkOrderSchema.pick({
      id: true,
      reference: true,
      title: true,
      instructions: true,
      site: true,
      template: true,
      dueDate: true,
      priority: true,
      version: true,
    }).nullable(),
    draft: DraftSchema.nullable(),
    queuedReport: z
      .object({
        input: ReportInputSchema,
        createdAt: z.string(),
        state: z.enum(['pending', 'blocked']),
      })
      .nullable(),
  })
  .refine((file) => file.draft !== null || file.queuedReport !== null, {
    message: 'No local draft or queued report is saved for this assignment.',
  });
export type LocalReportExport = z.infer<typeof LocalReportExportSchema>;
export function blankDraft(order: WorkOrder): Draft {
  return {
    answers: order.template.items.map((item) =>
      item.responseType === 'text'
        ? { itemId: item.id, value: 'text', text: '', note: '' }
        : item.responseType === 'number'
          ? { itemId: item.id, value: 'number', reading: '', note: '' }
          : { itemId: item.id, value: '', note: '' },
    ),
    summary: '',
    photos: [],
  };
}
