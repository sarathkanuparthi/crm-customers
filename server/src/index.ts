import cors from '@fastify/cors';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';

import {
  assignCustomer,
  customerStats,
  deleteCustomer,
  getCustomer,
  listCustomers,
  SORTABLE_COLUMNS,
  updateCustomer,
  type ListQuery,
  type SortColumn,
} from './customers.js';
import { db, migrate } from './db.js';
import { can, permissionsFor, type AuthUser, type Permission } from './rbac.js';

const PORT = Number(process.env.PORT ?? 4000);
const DEFAULT_USER_ID = 'u-evano';
const MAX_PAGE_SIZE = 200;

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

await app.register(cors, { origin: true });

migrate();

function currentUser(request: FastifyRequest): AuthUser | null {
  const header = request.headers['x-user-id'];
  const id = typeof header === 'string' && header.length > 0 ? header : DEFAULT_USER_ID;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as AuthUser | undefined;
  return user ?? null;
}

function authenticate(request: FastifyRequest, reply: FastifyReply): AuthUser | null {
  const user = currentUser(request);
  if (!user) {
    void reply.code(401).send({ error: 'unknown_user' });
    return null;
  }
  return user;
}

function authorize(user: AuthUser, permission: Permission, reply: FastifyReply): boolean {
  if (can(user, permission)) return true;
  void reply.code(403).send({ error: 'forbidden', permission });
  return false;
}

function parseListQuery(raw: Record<string, string | undefined>): ListQuery {
  const sort = (SORTABLE_COLUMNS as readonly string[]).includes(raw.sort ?? '')
    ? (raw.sort as SortColumn)
    : 'created_at';
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(raw.pageSize ?? 8) || 8));

  return {
    q: raw.q?.trim() || undefined,
    status: raw.status === 'active' || raw.status === 'inactive' ? raw.status : undefined,
    country: raw.country?.trim() || undefined,
    sort,
    dir: raw.dir === 'asc' ? 'asc' : 'desc',
    page: Math.max(1, Number(raw.page ?? 1) || 1),
    pageSize,
    cursor: raw.cursor,
  };
}

app.get('/api/health', () => ({ status: 'ok' }));

app.get('/api/me', (request, reply) => {
  const user = authenticate(request, reply);
  if (!user) return;

  const users = db.prepare('SELECT id, name, title, role, avatar FROM users').all() as AuthUser[];
  return reply.send({
    user,
    permissions: permissionsFor(user.role),
    availableUsers: users,
  });
});

app.get('/api/stats', (request, reply) => {
  const user = authenticate(request, reply);
  if (!user) return;
  if (!authorize(user, 'customers:read', reply)) return;
  return reply.send(customerStats(user));
});

app.get('/api/customers', (request, reply) => {
  const user = authenticate(request, reply);
  if (!user) return;
  if (!authorize(user, 'customers:read', reply)) return;

  const query = parseListQuery(request.query as Record<string, string | undefined>);
  return reply.send(listCustomers(user, query));
});

app.patch('/api/customers/:id', (request, reply) => {
  const user = authenticate(request, reply);
  if (!user) return;
  if (!authorize(user, 'customers:edit', reply)) return;

  const id = Number((request.params as { id: string }).id);
  const existing = getCustomer(user, id);
  if (!existing) return reply.code(404).send({ error: 'not_found' });

  const body = request.body as Partial<Record<string, unknown>>;
  const patch: Record<string, string> = {};
  for (const field of ['name', 'company', 'phone', 'email', 'country', 'status'] as const) {
    const value = body[field];
    if (typeof value === 'string' && value.trim().length > 0) patch[field] = value.trim();
  }
  if (patch.status && patch.status !== 'active' && patch.status !== 'inactive') {
    return reply.code(400).send({ error: 'invalid_status' });
  }

  updateCustomer(id, patch);
  return reply.send(getCustomer(user, id));
});

app.delete('/api/customers/:id', (request, reply) => {
  const user = authenticate(request, reply);
  if (!user) return;
  if (!authorize(user, 'customers:delete', reply)) return;

  const id = Number((request.params as { id: string }).id);
  if (!getCustomer(user, id)) return reply.code(404).send({ error: 'not_found' });

  deleteCustomer(id);
  return reply.code(204).send();
});

app.post('/api/customers/:id/assign', (request, reply) => {
  const user = authenticate(request, reply);
  if (!user) return;
  if (!authorize(user, 'customers:assign', reply)) return;

  const id = Number((request.params as { id: string }).id);
  if (!getCustomer(user, id)) return reply.code(404).send({ error: 'not_found' });

  const ownerId = (request.body as { ownerId?: unknown }).ownerId;
  if (typeof ownerId !== 'string') return reply.code(400).send({ error: 'invalid_owner' });
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(ownerId)) {
    return reply.code(400).send({ error: 'unknown_owner' });
  }

  assignCustomer(id, ownerId);
  return reply.send(getCustomer(user, id));
});

await app.listen({ port: PORT, host: '0.0.0.0' });
