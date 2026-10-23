import {
  CatalogSchema,
  WorkerPageSchema,
  WorkerAccountSchema,
  WorkerAccessHistoryPageSchema,
  type WorkerAccessHistoryQuery,
  type WorkerQuery,
  type UpdateWorkerAccess,
  InvitationReceiptSchema,
  InvitationPageSchema,
  InvitationSchema,
  InvitationPreviewSchema,
  InvitationAcceptanceSchema,
  type CreateInvitation,
  type InvitationQuery,
  MapSettingsSchema,
  type Coordinates,
  type UpdateSiteLocation,
  OrderSeriesReceiptSchema,
  OrderSeriesPageSchema,
  OrderSeriesDetailSchema,
  type OrderSeriesQuery,
  type CreateOrderSeries,
  MeSchema,
  OrderPageSchema,
  OrderSearchPageSchema,
  ReportHistoryPageSchema,
  SessionSchema,
  WorkOrderSchema,
  SiteSchema,
  TemplateSchema,
  type CreateOrder,
  type ReportInput,
  type RescheduleOrder,
  type ReassignOrder,
  type OrderSearchQuery,
} from '@fieldwork/contracts';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function createClient(
  baseUrl = '',
  token?: () => string | null,
  fetcher = globalThis.fetch,
  timeoutMs = 15_000,
) {
  async function request<T>(
    path: string,
    schema: { parse(value: unknown): T },
    method = 'GET',
    body?: unknown,
  ): Promise<T> {
    const authorization = token?.();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(`${baseUrl}/api/v1${path}`, {
        signal: controller.signal,
        method,
        credentials: 'include',
        headers: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new ApiError(
          response.status,
          result?.error?.code ?? 'REQUEST_ERROR',
          result?.error?.message ?? `Request failed (${response.status}).`,
        );
      }
      return schema.parse(response.status === 204 ? undefined : await response.json());
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ApiError(
          0,
          'TIMEOUT',
          'The server took too long to respond. Try syncing again when connected.',
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  return {
    login: (email: string, password: string) =>
      request('/sessions', SessionSchema, 'POST', { email, password }),
    logout: () => request('/sessions/current', { parse: () => undefined }, 'DELETE'),
    me: () => request('/me', MeSchema),
    catalog: () => request('/catalog', CatalogSchema),
    workers: (query: WorkerQuery = {}) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query))
        if (value !== undefined) params.set(key, String(value));
      return request(`/workers?${params}`, WorkerPageSchema);
    },
    worker: (id: string) => request(`/workers/${encodeURIComponent(id)}`, WorkerAccountSchema),
    workerAccessHistory: (id: string, query: WorkerAccessHistoryQuery = {}) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query))
        if (value !== undefined) params.set(key, String(value));
      return request(
        `/workers/${encodeURIComponent(id)}/access-history?${params}`,
        WorkerAccessHistoryPageSchema,
      );
    },
    updateWorkerAccess: (id: string, input: UpdateWorkerAccess) =>
      request(`/workers/${encodeURIComponent(id)}/access`, WorkerAccountSchema, 'PATCH', input),
    createInvitation: (input: CreateInvitation) =>
      request('/invitations', InvitationReceiptSchema, 'POST', input),
    invitations: (query: InvitationQuery = {}) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query))
        if (value !== undefined) params.set(key, String(value));
      return request(`/invitations?${params}`, InvitationPageSchema);
    },
    revokeInvitation: (id: string) =>
      request(`/invitations/${encodeURIComponent(id)}`, InvitationSchema, 'DELETE'),
    previewInvitation: (token: string) =>
      request('/invitations/preview', InvitationPreviewSchema, 'POST', { token }),
    acceptInvitation: (token: string, password: string) =>
      request('/invitations/accept', InvitationAcceptanceSchema, 'POST', { token, password }),
    mapSettings: () => request('/map-settings', MapSettingsSchema),
    createSite: (name: string, address: string, coordinates?: Coordinates) =>
      request('/sites', SiteSchema, 'POST', { name, address, coordinates }),
    site: (id: string) => request(`/sites/${encodeURIComponent(id)}`, SiteSchema),
    updateSiteLocation: (id: string, input: UpdateSiteLocation) =>
      request(`/sites/${encodeURIComponent(id)}/location`, SiteSchema, 'PATCH', input),
    createTemplate: (name: string, items: string[], requiresPhoto?: boolean) =>
      request('/templates', TemplateSchema, 'POST', { name, items, requiresPhoto }),
    orders: (offset = 0) => request(`/work-orders?limit=100&offset=${offset}`, OrderPageSchema),
    searchOrders: (query: OrderSearchQuery = {}) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query))
        if (value !== undefined) params.set(key, String(value));
      return request(`/work-orders/search?${params}`, OrderSearchPageSchema);
    },
    order: (id: string) => request(`/work-orders/${encodeURIComponent(id)}`, WorkOrderSchema),
    reportHistory: (id: string, cursor?: string) =>
      request(
        `/work-orders/${encodeURIComponent(id)}/history?limit=10${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        ReportHistoryPageSchema,
      ),
    createOrderSeries: (input: CreateOrderSeries) =>
      request('/work-order-series', OrderSeriesReceiptSchema, 'POST', input),
    orderSeries: (query: OrderSeriesQuery = {}) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query))
        if (value !== undefined) params.set(key, String(value));
      return request(`/work-order-series?${params}`, OrderSeriesPageSchema);
    },
    orderSeriesDetail: (id: string) =>
      request(`/work-order-series/${encodeURIComponent(id)}`, OrderSeriesDetailSchema),
    createOrder: (input: CreateOrder) => request('/work-orders', WorkOrderSchema, 'POST', input),
    rescheduleOrder: (id: string, input: RescheduleOrder) =>
      request(`/work-orders/${encodeURIComponent(id)}/schedule`, WorkOrderSchema, 'PATCH', input),
    reassignOrder: (id: string, input: ReassignOrder) =>
      request(`/work-orders/${encodeURIComponent(id)}/assignee`, WorkOrderSchema, 'PATCH', input),
    submitReport: (id: string, input: ReportInput) =>
      request(`/work-orders/${encodeURIComponent(id)}/reports`, WorkOrderSchema, 'POST', input),
    review: (
      id: string,
      baseVersion: number,
      decision: 'APPROVED' | 'CHANGES_REQUESTED',
      note: string,
    ) =>
      request(`/work-orders/${encodeURIComponent(id)}/reviews`, WorkOrderSchema, 'POST', {
        baseVersion,
        decision,
        note,
      }),
    photoUrl: (id: string) => `${baseUrl}/api/v1/photos/${encodeURIComponent(id)}`,
  };
}
export type Client = ReturnType<typeof createClient>;
