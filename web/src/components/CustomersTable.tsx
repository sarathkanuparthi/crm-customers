import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useCallback, useRef } from 'react';

import type { Customer, GridQuery, RowAction, SortColumn } from '../types';

const COLUMNS: { key: SortColumn | 'phone' | 'email' | 'actions'; label: string; sortable: boolean; width: string }[] =
  [
    { key: 'name', label: 'Customer Name', sortable: true, width: '18%' },
    { key: 'company', label: 'Company', sortable: true, width: '13%' },
    { key: 'phone', label: 'Phone Number', sortable: false, width: '14%' },
    { key: 'email', label: 'Email', sortable: false, width: '20%' },
    { key: 'country', label: 'Country', sortable: true, width: '13%' },
    { key: 'status', label: 'Status', sortable: true, width: '10%' },
    { key: 'actions', label: '', sortable: false, width: '12%' },
  ];

const ROW_HEIGHT = 57;
const VIRTUALIZE_THRESHOLD = 50;

interface CustomersTableProps {
  rows: Customer[];
  query: GridQuery;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  onSort: (column: SortColumn) => void;
  onAction: (action: RowAction, customer: Customer) => void;
  onRetry: () => void;
}

interface RowProps {
  customer: Customer;
  onAction: (action: RowAction, customer: Customer) => void;
}

const CustomerRow = memo(function CustomerRow({ customer, onAction }: RowProps): JSX.Element {
  const renderAction = (action: RowAction, label: string, danger = false) => {
    const allowed = customer.actions.includes(action);
    return (
      <button
        type="button"
        className={`action${danger ? ' danger' : ''}`}
        disabled={!allowed}
        title={allowed ? label : `You do not have permission to ${label.toLowerCase()} this record`}
        onClick={() => onAction(action, customer)}
      >
        {label}
      </button>
    );
  };

  return (
    <tr>
      <td title={customer.name}>{customer.name}</td>
      <td title={customer.company}>{customer.company}</td>
      <td>{customer.phone}</td>
      <td title={customer.email}>{customer.email}</td>
      <td title={customer.country}>{customer.country}</td>
      <td>
        <span className={`badge ${customer.status}`}>
          {customer.status === 'active' ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td>
        <div className="row-actions">
          {renderAction('edit', 'Edit')}
          {renderAction('assign', 'Assign')}
          {renderAction('delete', 'Delete', true)}
        </div>
      </td>
    </tr>
  );
});

function SkeletonRows({ count }: { count: number }): JSX.Element {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <tr className="skeleton-row" key={index}>
          {COLUMNS.map((column) => (
            <td key={column.key}>
              <span />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function CustomersTableComponent({
  rows,
  query,
  isLoading,
  isFetching,
  error,
  onSort,
  onAction,
  onRetry,
}: CustomersTableProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldVirtualize = rows.length > VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  const renderHeader = useCallback(
    () => (
      <thead>
        <tr>
          {COLUMNS.map((column) => (
            <th key={column.key} style={{ width: column.width }} scope="col">
              {column.sortable ? (
                <button type="button" onClick={() => onSort(column.key as SortColumn)}>
                  {column.label}
                  {query.sort === column.key ? (
                    <span aria-hidden="true">{query.dir === 'asc' ? '▲' : '▼'}</span>
                  ) : null}
                </button>
              ) : (
                column.label
              )}
            </th>
          ))}
        </tr>
      </thead>
    ),
    [onSort, query.dir, query.sort],
  );

  if (error) {
    return (
      <div className="banner error" role="alert">
        <span>Could not load customers: {error.message}</span>
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }

  const virtualRows = shouldVirtualize ? virtualizer.getVirtualItems() : [];
  const paddingTop = virtualRows.length > 0 ? (virtualRows[0]?.start ?? 0) : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? virtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1]?.end ?? 0)
      : 0;

  return (
    <div className="table-wrapper" ref={scrollRef} aria-busy={isFetching}>
      <table className="grid">
        {renderHeader()}
        <tbody>
          {isLoading ? (
            <SkeletonRows count={Math.min(query.pageSize, 8)} />
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS.length}>
                <div className="state">No customers match the current filters.</div>
              </td>
            </tr>
          ) : shouldVirtualize ? (
            <>
              {paddingTop > 0 ? (
                <tr style={{ height: paddingTop }}>
                  <td colSpan={COLUMNS.length} />
                </tr>
              ) : null}
              {virtualRows.map((virtualRow) => {
                const customer = rows[virtualRow.index];
                return customer ? (
                  <CustomerRow key={customer.id} customer={customer} onAction={onAction} />
                ) : null;
              })}
              {paddingBottom > 0 ? (
                <tr style={{ height: paddingBottom }}>
                  <td colSpan={COLUMNS.length} />
                </tr>
              ) : null}
            </>
          ) : (
            rows.map((customer) => (
              <CustomerRow key={customer.id} customer={customer} onAction={onAction} />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export const CustomersTable = memo(CustomersTableComponent);
