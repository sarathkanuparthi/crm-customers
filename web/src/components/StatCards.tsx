import { memo } from 'react';

import type { Stats } from '../types';

interface StatCardsProps {
  stats: Stats | undefined;
  isLoading: boolean;
}

const numberFormat = new Intl.NumberFormat('en-US');

function StatCardsComponent({ stats, isLoading }: StatCardsProps): JSX.Element {
  const cards = [
    {
      label: 'Total Customers',
      value: stats?.totalCustomers,
      icon: '👥',
      delta: '16% this month',
      direction: 'up' as const,
    },
    {
      label: 'Members',
      value: stats?.members,
      icon: '🧑',
      delta: '1% this month',
      direction: 'down' as const,
    },
    {
      label: 'Active Now',
      value: stats?.activeNow,
      icon: '🖥️',
      delta: '',
      direction: 'up' as const,
    },
  ];

  return (
    <section className="card stats" aria-label="Customer summary">
      {cards.map((card) => (
        <div className="stat" key={card.label}>
          <span className="stat-icon" aria-hidden="true">
            {card.icon}
          </span>
          <span>
            <span className="stat-label">{card.label}</span>
            <div className="stat-value">
              {isLoading || card.value === undefined ? '—' : numberFormat.format(card.value)}
            </div>
            {card.delta ? (
              <span className={`stat-delta ${card.direction}`}>
                {card.direction === 'up' ? '↑' : '↓'} {card.delta}
              </span>
            ) : null}
          </span>
        </div>
      ))}
    </section>
  );
}

export const StatCards = memo(StatCardsComponent);
