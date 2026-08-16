import { memo } from 'react';

interface PaginationProps {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}

/** Renders 1 2 3 4 … 40 style page windows around the current page. */
export function pageWindow(page: number, pageCount: number): (number | 'gap')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);

  const items: (number | 'gap')[] = [];
  const first = 1;
  const last = pageCount;
  const start = Math.max(first + 1, page - 1);
  const end = Math.min(last - 1, page + 1);

  items.push(first);
  if (start > first + 1) items.push('gap');
  for (let candidate = start; candidate <= end; candidate += 1) items.push(candidate);
  if (end < last - 1) items.push('gap');
  items.push(last);

  return items;
}

function PaginationComponent({ page, pageCount, onChange }: PaginationProps): JSX.Element {
  return (
    <nav className="pagination" aria-label="Pagination">
      <button
        type="button"
        className="page-btn"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="Previous page"
      >
        ‹
      </button>
      {pageWindow(page, pageCount).map((item, index) =>
        item === 'gap' ? (
          <span className="ellipsis" key={`gap-${index}`}>
            …
          </span>
        ) : (
          <button
            type="button"
            key={item}
            className={`page-btn${item === page ? ' active' : ''}`}
            aria-current={item === page ? 'page' : undefined}
            onClick={() => onChange(item)}
          >
            {item}
          </button>
        ),
      )}
      <button
        type="button"
        className="page-btn"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
        aria-label="Next page"
      >
        ›
      </button>
    </nav>
  );
}

export const Pagination = memo(PaginationComponent);
