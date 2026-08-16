# Large-Dataset + Large-Document Web Application — Design

Scope assumption: documents are 100 MB–1 GB (the brief says both "100 MB–1 GB" and
"1500 MB–1 GB"; the numbers below hold up to ~2 GB with the same patterns). Primary
document type assumed to be PDF (split/merge/page comments/annotations imply paginated
docs); the same architecture works for TIFF/DOCX-converted-to-PDF.

---

## 1. Executive summary

Two hard problems, one answer each:

1. **20k+ row grid** → do *nothing* on the client. Server-side sort/filter/paginate over a
   keyset-paginated API, rendered into a virtualized table. Never ship 20k rows to the browser.
2. **1 GB documents** → never download the document. The browser only ever sees
   **per-page rendered tiles/images + a lightweight page manifest**. All heavy operations
   (split/merge/render) happen server-side on object storage; the client issues
   *page-index operations*, not byte operations.

Everything else (RBAC, reliability, UX) follows from those two decisions.

```
Browser (React)
  ├─ Grid route:  TanStack Query ──► GET /records?cursor&sort&filter   (server-side ops)
  │                                   └─ virtualized rows (TanStack Virtual)
  └─ Workspace:   GET /documents/:id/manifest  (pages, sizes, tokens)
                  GET /documents/:id/pages/:n?dpi=  ──► CDN-cached page image/tile
                  WS  /documents/:id/events        (job progress, collab annotations)

API gateway (authn) → Service layer (authz = source of truth)
  ├─ Records service ──► Postgres (indexed, RLS-backed)
  ├─ Document service ─► Postgres (manifest, pages, annotations) + S3 (blobs)
  └─ Job workers ──────► render / split / merge / OCR   (queue: SQS/Redis, idempotent)
```

---

## 2. Data grid: 20,000+ records

### Recommendation
**Server-side operations + windowed (virtualized) rendering + keyset pagination**, with
"load more"/infinite scroll on top of the same cursor API. Not client-side filtering.

| Option | Verdict |
|---|---|
| Classic numbered pagination | Good default for auditable, jump-to-page workflows; `OFFSET` degrades on deep pages and page numbers shift under concurrent writes. |
| Infinite scroll | Best perceived performance for browse/scan; bad for "row 12,480", bad for deep-linking, breaks the footer. |
| Client-side virtualization of *all* 20k rows | Only viable if the full set is small (20k × ~1 KB ≈ 20 MB JSON) and filters must be instant offline. Memory + parse cost + staleness make it the wrong default; it also cannot scale to 200k. |

**Chosen:** keyset (cursor) pagination `WHERE (sort_key, id) < (:k, :id) ORDER BY sort_key DESC, id DESC LIMIT 100`,
fetched in windows of ~100–200 rows, rendered through a virtualizer so only ~30 DOM rows exist.
The UI exposes it as infinite scroll **plus** a jump-to-page control backed by a
count-estimate (`reltuples` / `count(*) FILTER` cached per filter hash). This gets both
affordances off one API.

### Why keyset over offset
Stable under inserts, constant-time at any depth, and it composes with the virtualizer's
scroll position. Cost: no arbitrary page jumps — solved by the estimate + "filter, don't scroll" UX.

### Rendering rules (minimal re-renders)
- Row components memoized (`React.memo`) with a stable `rowId` key; row action handlers
  come from a stable callback ref, not inline closures.
- Selection, hover, and edit state live in a **separate store** (Zustand/`useSyncExternalStore`)
  keyed by row id, so selecting a row re-renders one row, not the table.
- Column widths fixed/`table-layout: fixed`; no per-row measurement (variable height only
  with a measured virtualizer if the design demands it).
- Filter/sort inputs debounced (250–300 ms), requests keyed and de-duplicated by
  TanStack Query, `placeholderData: keepPreviousData` so the grid never flashes empty.
- Bulk actions operate on a *selection descriptor* (`{mode: 'all', filter}` or explicit ids),
  never on a materialized 20k-id array.

### Backend
- Composite indexes per sortable column `(sort_col, id)`; trigram/GIN index for text search;
  filters restricted to an allow-list of indexed columns (prevents accidental full scans).
- Response payload trimmed to grid-visible columns; detail loaded on row expand.
- p95 target: ≤150 ms server, ≤16 ms per frame client.

---

## 3. RBAC

**Backend is the single source of truth. The frontend only decides what to *show*.**

Three enforcement layers:

1. **Row scope (data):** every records query is scoped by the caller's tenant/team/ownership.
   Enforce in one place — a repository-level `visibleTo(user)` predicate, ideally reinforced by
   Postgres Row-Level Security so a forgotten `WHERE` cannot leak data.
2. **Operation authz (actions):** each endpoint checks a permission
   (`records:edit`, `records:delete`, `records:assign`, `documents:split`, `documents:annotate`)
   against the *specific resource*, not just the role. Deny by default.
3. **UI affordance:** the session/`/me` response returns the permission set, and each row
   response carries an `_actions: ["edit","assign"]` capability array computed server-side.
   The grid renders Edit/Delete/Assign as enabled / disabled+tooltip / hidden from that array.

Rule of thumb: **hide** what the user can never do in this context; **disable with a reason**
what they could do if state or ownership changed (better discoverability, fewer support tickets).

Document access uses **short-lived, scoped tokens** (5–15 min, signed, bound to document +
user + permission), because page images are served through a CDN. Annotation write
permission is checked on the API, never inferred from possession of a read token.

---

## 4. Row → document transition

Selecting a row must feel instant even though the document is a gigabyte.

1. **Prefetch on intent:** on row hover/focus, prefetch `GET /documents/:id/manifest`
   (a few KB: page count, per-page dimensions, thumbnail URLs, version, capability flags).
2. **Route transition with a skeleton workspace** rendered from the manifest — correct page
   count, correct page aspect ratios, gray placeholders. The layout never shifts later.
3. **Progressive fidelity:** page 1 arrives first as a low-DPI image (~50–150 KB), replaced by
   a high-DPI tile once decoded; thumbnails stream into the rail lazily.
4. Only pages in/near the viewport are fetched (±2 pages), so time-to-first-page is
   independent of document size — ~300–600 ms for a 1 GB, 10,000-page file.

The key insight: **the browser never holds the document.** It holds a manifest and a handful
of page images.

---

## 5. Document workspace (100 MB–1 GB)

### Storage & representation
- Original blob in object storage (S3), immutable, content-addressed.
- An **ingest job** (on upload) parses the page index and writes a `pages` table:
  `(document_id, page_no, byte_offset, byte_len, width, height, rendered_key)`.
  For PDFs this is a linearization/xref pass, not a full re-render.
- Rendered page images (WebP/AVIF, 2–3 DPI tiers, tiled for very large pages) written to S3
  and served via CDN with immutable cache keys `.../v{version}/p{n}@{dpi}.webp`.
  Rendering is lazy-on-first-view with a background warm of the first N pages.

### Viewing
- Virtualized page list (same virtualizer approach as the grid) with a hard cap on decoded
  images in memory (LRU of ~20–40 pages); `URL.revokeObjectURL` / explicit bitmap release
  on eviction to keep the tab under ~300–500 MB.
- Zoom uses tiles at the next DPI tier rather than upscaling a full-page bitmap.
- Text layer (for search/selection) fetched per page as JSON, not for the whole document.
- Web Workers for anything CPU-bound that must stay client-side: text-layer parsing,
  search index over fetched pages, image decode via `createImageBitmap` off the main thread.

### Operations — all page-index based, all server-side
| Operation | Client sends | Server does |
|---|---|---|
| Split | `{pageRanges: [[1,120],[121,300]]}` | Copy-on-write: new documents referencing the same object with a new page index; only the xref is rewritten. Near-instant, no gigabyte copy. |
| Merge | `{documentIds: [...], order}` | New manifest stitching page ranges; physical concatenation deferred to a background job (or never, if the reader can serve from ranges). |
| Delete pages | `{pages: [...]}` | New version of the manifest with those pages omitted; blob untouched. |
| Edit (rotate/reorder/replace page) | page-level ops | Manifest mutation + re-render of affected pages only. |
| Comment / annotate | `{pageNo, rect, body, anchor}` | Row in `annotations`, stored **separately from the blob** — annotations survive split/merge and never require rewriting the document. |

Everything is **versioned and immutable**: an operation produces `version = n+1`.
That makes undo trivial, makes CDN caching safe (version is in the URL), and makes partial
failure harmless — a failed job simply never publishes a new version.

### Long-running jobs
- `POST /documents/:id/operations` returns `202` + `jobId`; progress over WebSocket/SSE.
- **Idempotency keys** on submit (safe retry), **cancel** endpoint that marks the job aborted
  and workers check between chunks, exponential-backoff retry for transient failures.
- Optimistic UI for cheap, reversible things (annotations, comments, rename).
  Pessimistic + explicit progress for split/merge/delete-pages — users must not see a
  reordered document that the server later rejects.

### Upload path (implied by 1 GB files)
Multipart/resumable upload direct to S3 via presigned URLs (5–10 MB parts, parallel, resumable
after a dropped connection). The API never proxies the bytes.

---

## 6. State management & caching

| Concern | Tool | Why |
|---|---|---|
| Server state (records, manifests, annotations) | TanStack Query | Request de-dup, stale-while-revalidate, cursor caches, retry, invalidation on mutation. |
| Ephemeral UI state (selection, zoom, panel open) | Zustand / URL params | Keeps re-renders local; URL params make grid filters and page number deep-linkable and shareable. |
| Page image cache | Custom LRU + HTTP cache | Bounded memory is a correctness requirement here, not an optimization. |
| Cross-tab / collab | WebSocket channel per document | Annotation fan-out and job progress. |

Cache layers: CDN (immutable page images) → Redis (manifests, permission sets, filter counts)
→ Postgres. Invalidate by bumping document `version` rather than purging.

---

## 7. Reliability

- Every mutating operation is a **job with a state machine** (`queued → running → published | failed | cancelled`)
  persisted in Postgres; workers are idempotent and resumable per chunk.
- Manifest updates commit in a single transaction; blob writes happen *before* the commit, so
  a crash leaves orphaned blobs (cleaned by a sweeper), never a dangling manifest.
- Optimistic concurrency on documents (`If-Match: version`) → concurrent split/merge conflicts
  surface as a 409 with a "document changed, reload" recovery prompt instead of silent corruption.
- Annotations are append-only with soft delete, so they cannot be lost by a document operation.

---

## 8. Key trade-offs, stated plainly

- **Server-side grid ops** cost a round-trip per filter change (mitigated by debounce +
  keepPreviousData) but are the only thing that scales past 20k and the only place RBAC
  filtering can be trusted.
- **Keyset pagination** loses exact page jumps; bought stability and constant-time deep access.
- **Server-side rendering of pages** costs render infrastructure and cold-start latency on
  first view; bought a client that uses ~10 MB instead of 1 GB and works on a laptop.
  (A pure client-side `pdf.js` viewer is simpler and needs no render tier — it is defensible
  up to ~50–100 MB documents, and falls over on 1 GB.)
- **Copy-on-write split/merge** makes operations near-instant but adds a compaction/GC
  background job and makes "download the file" require an assembly step.
- **Optimistic updates** only where reversal is cheap; destructive structural ops stay pessimistic.
- **Annotations outside the blob** mean exported PDFs need a flatten step — worth it to keep
  operations cheap and annotations durable.

---

## 9. Rough delivery plan (my own throughput)

| Phase | Content |
|---|---|
| 1 | Grid: keyset API + virtualized table + server sort/filter + row actions, Figma-faithful. |
| 2 | RBAC: permission set, per-row capability array, disabled/hidden affordances, RLS. |
| 3 | Workspace shell: manifest API, virtualized page viewer, progressive page loading, LRU. |
| 4 | Operations: split/merge/delete-pages as versioned jobs + progress/cancel/retry UX. |
| 5 | Annotations & page comments, collab fan-out, export/flatten. |

Each phase is roughly one working session for a demonstrable vertical slice
(seeded data, real API, real UI) — not production hardening, but runnable and reviewable.

---

## 10. What I'd need from you to build it

1. The Figma file + the UX/UI standards doc (tokens, component library — MUI? shadcn? in-house?).
2. Preferred stack: I'd default to **React + TypeScript + TanStack Query/Table/Virtual + Vite**
   on the front end, and **Node (Fastify/Nest)** or **Python (FastAPI)** + Postgres + S3 +
   a worker queue on the back end. Tell me if you're locked to something else.
3. Document type(s) — is PDF the primary format?
4. Whether this is a working prototype (mock/seeded backend, deployable) or a
   written design deliverable for a review/interview.
