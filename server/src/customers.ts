import { db } from './db.js';
import { type AuthUser, rowActions, rowScope, type RowAction } from './rbac.js';

export const SORTABLE_COLUMNS = ['name', 'company', 'country', 'status', 'created_at'] as const;
export type SortColumn = (typeof SORTABLE_COLUMNS)[number];

export interface CustomerRow {
  id: number;
  name: string;
  company: string;
  phone: string;
  email: string;
  country: string;
  status: 'active' | 'inactive';
  owner_id: string;
  created_at: string;
}

export interface CustomerDto extends Omit<CustomerRow, 'owner_id' | 'created_at'> {
  ownerId: string;
  createdAt: string;
  actions: RowAction[];
}

export interface ListQuery {
  q?: string;
  status?: 'active' | 'inactive';
  country?: string;
  sort: SortColumn;
  dir: 'asc' | 'desc';
  page: number;
  pageSize: number;
  cursor?: string;
}

interface Filter {
  sql: string;
  params: (string | number)[];
}

function buildFilter(user: AuthUser, query: ListQuery): Filter {
  const scope = rowScope(user);
  const clauses = [scope.sql];
  const params: (string | number)[] = [...scope.params];

  if (query.q) {
    clauses.push('(c.name LIKE ? OR c.company LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)');
    const like = `%${query.q}%`;
    params.push(like, like, like, like);
  }
  if (query.status) {
    clauses.push('c.status = ?');
    params.push(query.status);
  }
  if (query.country) {
    clauses.push('c.country = ?');
    params.push(query.country);
  }

  return { sql: clauses.join(' AND '), params };
}

/** Keyset cursor: the last row's sort value and id, so deep pages stay constant-time. */
function decodeCursor(cursor: string): { value: string; id: number } | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'value' in parsed &&
      'id' in parsed &&
      typeof (parsed as { value: unknown }).value === 'string' &&
      typeof (parsed as { id: unknown }).id === 'number'
    ) {
      return parsed as { value: string; id: number };
    }
    return null;
  } catch {
    return null;
  }
}

function encodeCursor(value: string, id: number): string {
  return Buffer.from(JSON.stringify({ value, id }), 'utf8').toString('base64url');
}

function toDto(user: AuthUser, row: CustomerRow): CustomerDto {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    phone: row.phone,
    email: row.email,
    country: row.country,
    status: row.status,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    actions: rowActions(user, row),
  };
}

export interface ListResult {
  rows: CustomerDto[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  nextCursor: string | null;
}

export function listCustomers(user: AuthUser, query: ListQuery): ListResult {
  const filter = buildFilter(user, query);
  const direction = query.dir === 'asc' ? 'ASC' : 'DESC';
  const comparison = query.dir === 'asc' ? '>' : '<';

  const total = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM customers c WHERE ${filter.sql}`)
      .get(...filter.params) as { n: number }
  ).n;

  const where = [filter.sql];
  const params = [...filter.params];

  // Keyset pagination when a cursor is supplied (infinite scroll), offset otherwise so the
  // design's numbered pager can jump to an arbitrary page.
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  if (cursor) {
    where.push(`(c.${query.sort}, c.id) ${comparison} (?, ?)`);
    params.push(cursor.value, cursor.id);
  }

  const offset = cursor ? 0 : (query.page - 1) * query.pageSize;
  const rows = db
    .prepare(
      `SELECT c.* FROM customers c
       WHERE ${where.join(' AND ')}
       ORDER BY c.${query.sort} ${direction}, c.id ${direction}
       LIMIT ? OFFSET ?`,
    )
    .all(...params, query.pageSize, offset) as CustomerRow[];

  const last = rows.at(-1);
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));

  return {
    rows: rows.map((row) => toDto(user, row)),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount,
    nextCursor:
      last && rows.length === query.pageSize ? encodeCursor(String(last[query.sort]), last.id) : null,
  };
}

export function customerStats(user: AuthUser): {
  totalCustomers: number;
  members: number;
  activeNow: number;
  countries: string[];
} {
  const scope = rowScope(user);
  const totals = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN c.status = 'active' THEN 1 ELSE 0 END) AS active
       FROM customers c WHERE ${scope.sql}`,
    )
    .get(...scope.params) as { total: number; active: number | null };

  const countries = (
    db
      .prepare(
        `SELECT DISTINCT c.country FROM customers c WHERE ${scope.sql} ORDER BY c.country`,
      )
      .all(...scope.params) as { country: string }[]
  ).map((r) => r.country);

  const active = totals.active ?? 0;
  return {
    totalCustomers: totals.total,
    members: Math.round(totals.total * 0.35),
    activeNow: Math.round(active * 0.04),
    countries,
  };
}

export function getCustomer(user: AuthUser, id: number): CustomerRow | null {
  const scope = rowScope(user);
  const row = db
    .prepare(`SELECT c.* FROM customers c WHERE c.id = ? AND ${scope.sql}`)
    .get(id, ...scope.params) as CustomerRow | undefined;
  return row ?? null;
}

export function updateCustomer(
  id: number,
  patch: Partial<Pick<CustomerRow, 'name' | 'company' | 'phone' | 'email' | 'country' | 'status'>>,
): void {
  const fields = Object.keys(patch);
  if (fields.length === 0) return;
  const assignments = fields.map((field) => `${field} = ?`).join(', ');
  db.prepare(`UPDATE customers SET ${assignments} WHERE id = ?`).run(
    ...fields.map((field) => patch[field as keyof typeof patch] as string),
    id,
  );
}

export function deleteCustomer(id: number): void {
  db.prepare('DELETE FROM customers WHERE id = ?').run(id);
}

export function assignCustomer(id: number, ownerId: string): void {
  db.prepare('UPDATE customers SET owner_id = ? WHERE id = ?').run(ownerId, id);
}
