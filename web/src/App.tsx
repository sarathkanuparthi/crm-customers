import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import {
  assignCustomer,
  customerQueryKey,
  deleteCustomer,
  fetchCustomers,
  fetchSession,
  fetchStats,
  getActiveUserId,
  setActiveUserId,
  updateCustomer,
} from './api';
import { CustomersTable } from './components/CustomersTable';
import { AssignDialog, DeleteDialog, EditDialog } from './components/Dialogs';
import { Pagination } from './components/Pagination';
import { Sidebar } from './components/Sidebar';
import { StatCards } from './components/StatCards';
import type { Customer, GridQuery, RowAction, SortColumn } from './types';
import { useDebouncedValue } from './useDebouncedValue';

const PAGE_SIZES = [8, 25, 100, 200];

type Dialog = { kind: RowAction; customer: Customer } | null;

const numberFormat = new Intl.NumberFormat('en-US');

export function App(): JSX.Element {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState(getActiveUserId);
  const [searchInput, setSearchInput] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [grid, setGrid] = useState<Omit<GridQuery, 'q'>>({
    status: '',
    country: '',
    sort: 'created_at',
    dir: 'desc',
    page: 1,
    pageSize: 8,
  });

  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const query: GridQuery = useMemo(
    () => ({ ...grid, q: debouncedSearch.trim() }),
    [grid, debouncedSearch],
  );

  const sessionQuery = useQuery({ queryKey: ['session', userId], queryFn: fetchSession });
  const statsQuery = useQuery({ queryKey: ['stats', userId], queryFn: fetchStats });
  const customersQuery = useQuery({
    queryKey: customerQueryKey(query, userId),
    queryFn: () => fetchCustomers(query),
    placeholderData: keepPreviousData,
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['customers'] });
    void queryClient.invalidateQueries({ queryKey: ['stats'] });
  }, [queryClient]);

  const editMutation = useMutation({
    mutationFn: (input: { id: number; patch: Partial<Customer> }) =>
      updateCustomer(input.id, input.patch),
    onSuccess: () => {
      setDialog(null);
      setNotice('Customer updated.');
      invalidate();
    },
    onError: (error: Error) => setNotice(`Update failed: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteCustomer(id),
    onSuccess: () => {
      setDialog(null);
      setNotice('Customer deleted.');
      invalidate();
    },
    onError: (error: Error) => setNotice(`Delete failed: ${error.message}`),
  });

  const assignMutation = useMutation({
    mutationFn: (input: { id: number; ownerId: string }) =>
      assignCustomer(input.id, input.ownerId),
    onSuccess: () => {
      setDialog(null);
      setNotice('Customer reassigned.');
      invalidate();
    },
    onError: (error: Error) => setNotice(`Assign failed: ${error.message}`),
  });

  const handleSwitchUser = useCallback(
    (nextUserId: string) => {
      setActiveUserId(nextUserId);
      setUserId(nextUserId);
      setGrid((prev) => ({ ...prev, page: 1 }));
      void queryClient.invalidateQueries();
    },
    [queryClient],
  );

  const handleSort = useCallback((column: SortColumn) => {
    setGrid((prev) => ({
      ...prev,
      sort: column,
      dir: prev.sort === column && prev.dir === 'asc' ? 'desc' : 'asc',
      page: 1,
    }));
  }, []);

  const handleAction = useCallback((action: RowAction, customer: Customer) => {
    setDialog({ kind: action, customer });
  }, []);

  const handleRetry = useCallback(() => {
    void customersQuery.refetch();
  }, [customersQuery]);

  const page = customersQuery.data;
  const rows = page?.rows ?? [];
  const total = page?.total ?? 0;
  const firstRow = total === 0 ? 0 : (query.page - 1) * query.pageSize + 1;
  const lastRow = Math.min(query.page * query.pageSize, total);
  const canWriteAnything = rows.some((row) => row.actions.length > 0);

  return (
    <div className="app">
      <Sidebar session={sessionQuery.data} onSwitchUser={handleSwitchUser} />

      <main className="main">
        <header className="topbar">
          <h1 className="greeting">
            Hello {sessionQuery.data?.user.name ?? '…'} <span aria-hidden="true">👋</span>,
          </h1>
          <div className="search">
            <span aria-hidden="true">🔍</span>
            <label className="visually-hidden" htmlFor="global-search">
              Search
            </label>
            <input
              id="global-search"
              placeholder="Search"
              value={searchInput}
              onChange={(event) => {
                setSearchInput(event.target.value);
                setGrid((prev) => ({ ...prev, page: 1 }));
              }}
            />
          </div>
        </header>

        <StatCards stats={statsQuery.data} isLoading={statsQuery.isLoading} />

        <section className="card grid-card">
          <div className="grid-header">
            <div>
              <h2 className="grid-title">All Customers</h2>
              <p className="grid-subtitle">
                {sessionQuery.data
                  ? `${sessionQuery.data.user.role} view · ${
                      sessionQuery.data.permissions.includes('customers:read:all')
                        ? 'all records'
                        : 'own records only'
                    }`
                  : 'Active Members'}
              </p>
            </div>

            <div className="grid-controls">
              <div className="control">
                <span aria-hidden="true">🔍</span>
                <label className="visually-hidden" htmlFor="grid-search">
                  Search customers
                </label>
                <input
                  id="grid-search"
                  placeholder="Search"
                  value={searchInput}
                  onChange={(event) => {
                    setSearchInput(event.target.value);
                    setGrid((prev) => ({ ...prev, page: 1 }));
                  }}
                />
              </div>

              <div className="control">
                <label htmlFor="filter-status">Status :</label>
                <select
                  id="filter-status"
                  value={grid.status}
                  onChange={(event) =>
                    setGrid((prev) => ({
                      ...prev,
                      status: event.target.value as GridQuery['status'],
                      page: 1,
                    }))
                  }
                >
                  <option value="">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="control">
                <label htmlFor="filter-country">Country :</label>
                <select
                  id="filter-country"
                  value={grid.country}
                  onChange={(event) =>
                    setGrid((prev) => ({ ...prev, country: event.target.value, page: 1 }))
                  }
                >
                  <option value="">All</option>
                  {statsQuery.data?.countries.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
              </div>

              <div className="control">
                <label htmlFor="sort-by">Short by :</label>
                <select
                  id="sort-by"
                  value={`${grid.sort}:${grid.dir}`}
                  onChange={(event) => {
                    const [sort, dir] = event.target.value.split(':');
                    setGrid((prev) => ({
                      ...prev,
                      sort: sort as SortColumn,
                      dir: dir as GridQuery['dir'],
                      page: 1,
                    }));
                  }}
                >
                  <option value="created_at:desc">Newest</option>
                  <option value="created_at:asc">Oldest</option>
                  <option value="name:asc">Name A–Z</option>
                  <option value="name:desc">Name Z–A</option>
                  <option value="company:asc">Company</option>
                  <option value="country:asc">Country</option>
                  <option value="status:asc">Status</option>
                </select>
              </div>

              <div className="control">
                <label htmlFor="page-size">Rows :</label>
                <select
                  id="page-size"
                  value={grid.pageSize}
                  onChange={(event) =>
                    setGrid((prev) => ({ ...prev, pageSize: Number(event.target.value), page: 1 }))
                  }
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {notice ? (
            <div className="banner info" role="status">
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice(null)}>
                Dismiss
              </button>
            </div>
          ) : null}

          {!canWriteAnything && rows.length > 0 ? (
            <div className="banner info">
              <span>
                Read-only role — row actions are disabled because the server did not grant write
                permissions.
              </span>
            </div>
          ) : null}

          <CustomersTable
            rows={rows}
            query={query}
            isLoading={customersQuery.isLoading}
            isFetching={customersQuery.isFetching}
            error={customersQuery.error as Error | null}
            onSort={handleSort}
            onAction={handleAction}
            onRetry={handleRetry}
          />

          <div className="grid-footer">
            <span className="summary">
              Showing data {numberFormat.format(firstRow)} to {numberFormat.format(lastRow)} of{' '}
              {numberFormat.format(total)} entries
            </span>
            <Pagination
              page={query.page}
              pageCount={page?.pageCount ?? 1}
              onChange={(nextPage) => setGrid((prev) => ({ ...prev, page: nextPage }))}
            />
          </div>
        </section>
      </main>

      {dialog?.kind === 'edit' ? (
        <EditDialog
          customer={dialog.customer}
          isSaving={editMutation.isPending}
          onCancel={() => setDialog(null)}
          onSave={(patch) => editMutation.mutate({ id: dialog.customer.id, patch })}
        />
      ) : null}

      {dialog?.kind === 'assign' && sessionQuery.data ? (
        <AssignDialog
          customer={dialog.customer}
          users={sessionQuery.data.availableUsers}
          isSaving={assignMutation.isPending}
          onCancel={() => setDialog(null)}
          onAssign={(ownerId) => assignMutation.mutate({ id: dialog.customer.id, ownerId })}
        />
      ) : null}

      {dialog?.kind === 'delete' ? (
        <DeleteDialog
          customer={dialog.customer}
          isSaving={deleteMutation.isPending}
          onCancel={() => setDialog(null)}
          onConfirm={() => deleteMutation.mutate(dialog.customer.id)}
        />
      ) : null}
    </div>
  );
}
