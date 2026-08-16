import type { Customer, CustomerPage, GridQuery, Session, Stats } from './types';

const USER_STORAGE_KEY = 'crm.userId';

export function getActiveUserId(): string {
  return localStorage.getItem(USER_STORAGE_KEY) ?? 'u-evano';
}

export function setActiveUserId(id: string): void {
  localStorage.setItem(USER_STORAGE_KEY, id);
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-user-id': getActiveUserId(),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(body.error ?? `Request failed (${response.status})`, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function fetchSession(): Promise<Session> {
  return request<Session>('/me');
}

export function fetchStats(): Promise<Stats> {
  return request<Stats>('/stats');
}

export function customerQueryKey(query: GridQuery, userId: string): unknown[] {
  return ['customers', userId, query];
}

export function fetchCustomers(query: GridQuery, cursor?: string): Promise<CustomerPage> {
  const params = new URLSearchParams({
    sort: query.sort,
    dir: query.dir,
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.q) params.set('q', query.q);
  if (query.status) params.set('status', query.status);
  if (query.country) params.set('country', query.country);
  if (cursor) params.set('cursor', cursor);

  return request<CustomerPage>(`/customers?${params.toString()}`);
}

export function updateCustomer(id: number, patch: Partial<Customer>): Promise<Customer> {
  return request<Customer>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export function deleteCustomer(id: number): Promise<void> {
  return request<void>(`/customers/${id}`, { method: 'DELETE' });
}

export function assignCustomer(id: number, ownerId: string): Promise<Customer> {
  return request<Customer>(`/customers/${id}/assign`, {
    method: 'POST',
    body: JSON.stringify({ ownerId }),
  });
}
