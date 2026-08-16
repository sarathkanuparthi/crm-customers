# CRM Customers — scalable data grid prototype

Implementation of the Customers tab from the CRM dashboard design: a 24,000-record grid with
server-side sorting/filtering/pagination and role-based access control enforced on the backend.

It is the first vertical slice of the architecture described in `docs/architecture.md`
(the grid half; the large-document workspace is the second half).

## Running it

```bash
npm install
npm run seed     # creates server/data/crm.db with 24,000 customers and 4 demo users
npm run dev      # API on :4000, web on :5173
```

Open http://localhost:5173.

## What it demonstrates

**Grid at scale.** The browser never receives 24k rows. The API does the sorting, filtering and
paging over indexed columns; the client requests one window at a time and renders it through a
virtualizer once the page size passes 50 rows. Filters are debounced and cached by TanStack Query
with `keepPreviousData`, so changing a filter never flashes an empty table.

**Pagination and keyset cursors in one API.** `GET /api/customers` supports both `page`/`pageSize`
(so the design's numbered pager can jump to page 40) and an opaque `cursor` for keyset paging
(`WHERE (sort_col, id) < (?, ?)`), which stays constant-time at any depth and is stable under
concurrent inserts. Infinite scroll can be layered on the same endpoint without a server change.

**RBAC with the backend as source of truth.** Four demo roles (switch users in the sidebar):

| Role | Sees | Can |
| --- | --- | --- |
| `admin` (Evano) | all records | edit, delete, assign |
| `manager` (Mira) | all records | edit, assign |
| `agent` (Dan) | own records only | edit own |
| `viewer` (Lena) | own records only | nothing |

Enforcement lives in three places, all server-side: a row scope predicate applied to every query,
a permission check per endpoint, and a per-row `actions` array returned with each record. The UI
renders Edit/Assign/Delete straight from that array — it decides what to *show*, never what is
*allowed*. Calling a forbidden endpoint directly returns 403 regardless of what the UI rendered.

**UX states.** Skeleton rows on first load, non-blocking refetch, empty state, error banner with
retry, per-mutation pending labels, and a status banner explaining why actions are disabled for
read-only roles.

## Layout

```
server/   Fastify + SQLite (better-sqlite3)
  src/rbac.ts        roles, permissions, row scope, per-row capabilities
  src/customers.ts   query building, keyset + offset pagination, stats
  src/index.ts       routes, authn (x-user-id demo header), authz gates
web/      React 18 + TypeScript + Vite
  src/App.tsx                grid state, queries, mutations
  src/components/            sidebar, stat cards, virtualized table, pager, dialogs
```

Authentication is a demo header (`x-user-id`); in production this becomes a session/JWT and the
same `AuthUser` flows through the identical authorization path.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | API + web dev servers |
| `npm run seed` | seed/reset the SQLite dataset (`SEED_COUNT` to change volume) |
| `npm run typecheck` | TypeScript across both workspaces |
| `npm run lint` | ESLint |
| `npm run build` | production build |
