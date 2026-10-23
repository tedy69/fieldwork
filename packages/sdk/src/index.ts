import {
  CatalogSchema,
  MeSchema,
  OrderPageSchema,
  ReportHistoryPageSchema,
  SessionSchema,
  WorkOrderSchema,
  SiteSchema,
  TemplateSchema,
  type CreateOrder,
  type ReportInput,
  type RescheduleOrder,
  type ReassignOrder,
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
    createSite: (name: string, address: string) =>
      request('/sites', SiteSchema, 'POST', { name, address }),
    createTemplate: (name: string, items: string[]) =>
      request('/templates', TemplateSchema, 'POST', { name, items }),
    orders: (offset = 0) => request(`/work-orders?limit=100&offset=${offset}`, OrderPageSchema),
    order: (id: string) => request(`/work-orders/${encodeURIComponent(id)}`, WorkOrderSchema),
    reportHistory: (id: string, cursor?: string) =>
      request(
        `/work-orders/${encodeURIComponent(id)}/history?limit=10${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        ReportHistoryPageSchema,
      ),
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
