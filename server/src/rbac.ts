export type Role = 'admin' | 'manager' | 'agent' | 'viewer';

export type Permission =
  | 'customers:read'
  | 'customers:read:all'
  | 'customers:edit'
  | 'customers:delete'
  | 'customers:assign';

export interface AuthUser {
  id: string;
  name: string;
  title: string;
  role: Role;
  avatar: string;
}

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'customers:read',
    'customers:read:all',
    'customers:edit',
    'customers:delete',
    'customers:assign',
  ],
  manager: ['customers:read', 'customers:read:all', 'customers:edit', 'customers:assign'],
  agent: ['customers:read', 'customers:edit'],
  viewer: ['customers:read'],
};

export function permissionsFor(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function can(user: AuthUser, permission: Permission): boolean {
  return ROLE_PERMISSIONS[user.role].includes(permission);
}

/**
 * Row scope: agents and viewers only see the records they own. Applied to every query
 * so a missing filter in a route cannot leak rows.
 */
export function rowScope(user: AuthUser): { sql: string; params: string[] } {
  if (can(user, 'customers:read:all')) return { sql: '1 = 1', params: [] };
  return { sql: 'c.owner_id = ?', params: [user.id] };
}

export type RowAction = 'edit' | 'delete' | 'assign';

/**
 * Per-row capabilities computed server-side; the UI renders Edit/Delete/Assign from this
 * array and never derives permissions on its own.
 */
export function rowActions(user: AuthUser, row: { owner_id: string; status: string }): RowAction[] {
  const actions: RowAction[] = [];
  const owns = row.owner_id === user.id;

  if (can(user, 'customers:edit') && (owns || can(user, 'customers:read:all'))) {
    actions.push('edit');
  }
  if (can(user, 'customers:delete')) actions.push('delete');
  if (can(user, 'customers:assign')) actions.push('assign');

  return actions;
}
