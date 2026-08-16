import { memo } from 'react';

import type { Session } from '../types';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: '◎' },
  { key: 'product', label: 'Product', icon: '▣', expandable: true },
  { key: 'customers', label: 'Customers', icon: '👤', expandable: true },
  { key: 'income', label: 'Income', icon: '💳', expandable: true },
  { key: 'promote', label: 'Promote', icon: '◔', expandable: true },
  { key: 'help', label: 'Help', icon: '?', expandable: true },
] as const;

interface SidebarProps {
  session: Session | undefined;
  onSwitchUser: (userId: string) => void;
}

function SidebarComponent({ session, onSwitchUser }: SidebarProps): JSX.Element {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">
          <span />
        </span>
        Dashboard
        <span className="version">v.01</span>
      </div>

      <nav className="nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`nav-item${item.key === 'customers' ? ' active' : ''}`}
            aria-current={item.key === 'customers' ? 'page' : undefined}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
            {'expandable' in item && item.expandable ? (
              <span className="chevron" aria-hidden="true">
                ›
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="nav-spacer" />

      <div className="upsell">
        Upgrade to PRO to get access all Features!
        <button type="button">Get Pro Now!</button>
      </div>

      {session ? (
        <div className="profile">
          <span className="avatar">{session.user.avatar}</span>
          <span>
            <span className="profile-name">{session.user.name}</span>
            <br />
            <span className="profile-title">{session.user.title}</span>
          </span>
          <label className="visually-hidden" htmlFor="user-switch">
            Switch demo user
          </label>
          <select
            id="user-switch"
            value={session.user.id}
            onChange={(event) => onSwitchUser(event.target.value)}
          >
            {session.availableUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} · {user.role}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </aside>
  );
}

export const Sidebar = memo(SidebarComponent);
