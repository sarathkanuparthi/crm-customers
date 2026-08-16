export type Role = 'admin' | 'manager' | 'agent' | 'viewer';

export type RowAction = 'edit' | 'delete' | 'assign';

export interface User {
  id: string;
  name: string;
  title: string;
  role: Role;
  avatar: string;
}

export interface Session {
  user: User;
  permissions: string[];
  availableUsers: User[];
}

export interface Customer {
  id: number;
  name: string;
  company: string;
  phone: string;
  email: string;
  country: string;
  status: 'active' | 'inactive';
  ownerId: string;
  createdAt: string;
  actions: RowAction[];
}

export interface CustomerPage {
  rows: Customer[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  nextCursor: string | null;
}

export interface Stats {
  totalCustomers: number;
  members: number;
  activeNow: number;
  countries: string[];
}

export type SortColumn = 'name' | 'company' | 'country' | 'status' | 'created_at';

export interface GridQuery {
  q: string;
  status: '' | 'active' | 'inactive';
  country: string;
  sort: SortColumn;
  dir: 'asc' | 'desc';
  page: number;
  pageSize: number;
}
