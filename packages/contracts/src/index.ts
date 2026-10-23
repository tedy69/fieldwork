import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  role: z.enum(['manager', 'worker']),
});
export type User = z.infer<typeof UserSchema>;
export const SiteSchema = z.object({ id: z.string(), name: z.string(), address: z.string() });
export const ItemSchema = z.object({ id: z.string(), label: z.string() });
export const TemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  items: z.array(ItemSchema),
});
export const PhotoSchema = z.object({
  id: z.uuid(),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  data: z.string().min(1).max(2_800_000),
});
export type Photo = z.infer<typeof PhotoSchema>;
export const AnswerSchema = z.object({
  itemId: z.string().max(100),
  value: z.enum(['pass', 'fail', 'na']),
  note: z.string().max(1000),
});
export const ReportInputSchema = z
  .object({
    mutationId: z.uuid(),
    baseVersion: z.number().int().positive(),
    answers: z.array(AnswerSchema).min(1).max(50),
    summary: z.string().trim().min(1).max(4000),
    photos: z.array(PhotoSchema).max(3),
  })
  .strict();
export type ReportInput = z.infer<typeof ReportInputSchema>;
export const ReportSchema = z.object({
  id: z.string(),
  submittedAt: z.string(),
  submittedBy: z.string(),
  answers: z.array(AnswerSchema),
  summary: z.string(),
  photos: z.array(z.object({ id: z.string(), mimeType: z.string() })),
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
export const RecurrenceSchema = z
  .object({
    dueDate: z.iso.date(),
    frequency: z.enum(['daily', 'weekly']),
    occurrences: z.number().int().min(2).max(52),
  })
  .strict()
  .refine(
    (input) => {
      const last = new Date(`${input.dueDate}T12:00:00Z`);
      last.setUTCDate(
        last.getUTCDate() + (input.occurrences - 1) * (input.frequency === 'weekly' ? 7 : 1),
      );
      return Number.isFinite(last.getTime()) && last.getUTCFullYear() <= 9999;
    },
    { message: 'All occurrences must fall within a four-digit calendar year.', path: ['dueDate'] },
  );
export type Recurrence = z.infer<typeof RecurrenceSchema>;
export function recurrenceDates(input: Recurrence): string[] {
  const schedule = RecurrenceSchema.parse(input);
  const date = new Date(`${schedule.dueDate}T12:00:00Z`);
  return Array.from({ length: schedule.occurrences }, (_, index) => {
    if (index) date.setUTCDate(date.getUTCDate() + (schedule.frequency === 'weekly' ? 7 : 1));
    return date.toISOString().slice(0, 10);
  });
}
export const CreateOrderSeriesSchema = CreateOrderSchema.extend({
  mutationId: z.uuid(),
  expectedActorId: z.string().min(1).max(100).optional(),
  frequency: z.enum(['daily', 'weekly']),
  occurrences: z.number().int().min(2).max(52),
}).refine(
  (input) =>
    RecurrenceSchema.safeParse({
      dueDate: input.dueDate,
      frequency: input.frequency,
      occurrences: input.occurrences,
    }).success,
  { message: 'Choose a valid recurrence within a four-digit calendar year.', path: ['dueDate'] },
);
export type CreateOrderSeries = z.infer<typeof CreateOrderSeriesSchema>;
export const OrderSeriesReceiptSchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  frequency: z.enum(['daily', 'weekly']),
  orders: z.array(WorkOrderSchema).min(2).max(52),
});
export type OrderSeriesReceipt = z.infer<typeof OrderSeriesReceiptSchema>;
export const OrderSeriesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.uuid().optional(),
  })
  .strict();
export type OrderSeriesQuery = Partial<z.infer<typeof OrderSeriesQuerySchema>>;
export const OrderSeriesSummarySchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  createdBy: UserSchema.pick({ id: true, name: true }),
  title: z.string(),
  frequency: z.enum(['daily', 'weekly']),
  occurrences: z.number().int().min(2).max(52),
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
export const CatalogSchema = z.object({
  users: z.array(UserSchema),
  sites: z.array(SiteSchema),
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
export type Draft = {
  answers: { itemId: string; value: '' | 'pass' | 'fail' | 'na'; note: string }[];
  summary: string;
  photos: Photo[];
};
export function blankDraft(order: WorkOrder): Draft {
  return {
    answers: order.template.items.map((item) => ({ itemId: item.id, value: '', note: '' })),
    summary: '',
    photos: [],
  };
}
