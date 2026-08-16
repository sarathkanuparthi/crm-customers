import { useState, type ReactNode } from 'react';

import type { Customer, User } from '../types';

interface EditDialogProps {
  customer: Customer;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (patch: Partial<Customer>) => void;
}

export function EditDialog({ customer, isSaving, onCancel, onSave }: EditDialogProps): JSX.Element {
  const [form, setForm] = useState({
    name: customer.name,
    company: customer.company,
    phone: customer.phone,
    email: customer.email,
    country: customer.country,
    status: customer.status,
  });

  return (
    <Backdrop onCancel={onCancel}>
      <h2>Edit customer</h2>
      <p>#{customer.id}</p>

      {(['name', 'company', 'phone', 'email', 'country'] as const).map((field) => (
        <div className="field" key={field}>
          <label htmlFor={`edit-${field}`}>{field}</label>
          <input
            id={`edit-${field}`}
            value={form[field]}
            onChange={(event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))}
          />
        </div>
      ))}

      <div className="field">
        <label htmlFor="edit-status">status</label>
        <select
          id="edit-status"
          value={form.status}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, status: event.target.value as Customer['status'] }))
          }
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={isSaving}>
          Cancel
        </button>
        <button type="button" className="btn primary" onClick={() => onSave(form)} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </Backdrop>
  );
}

interface AssignDialogProps {
  customer: Customer;
  users: User[];
  isSaving: boolean;
  onCancel: () => void;
  onAssign: (ownerId: string) => void;
}

export function AssignDialog({
  customer,
  users,
  isSaving,
  onCancel,
  onAssign,
}: AssignDialogProps): JSX.Element {
  const [ownerId, setOwnerId] = useState(customer.ownerId);

  return (
    <Backdrop onCancel={onCancel}>
      <h2>Assign customer</h2>
      <p>{customer.name}</p>

      <div className="field">
        <label htmlFor="assign-owner">Owner</label>
        <select id="assign-owner" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} · {user.role}
            </option>
          ))}
        </select>
      </div>

      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={isSaving}>
          Cancel
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => onAssign(ownerId)}
          disabled={isSaving}
        >
          {isSaving ? 'Assigning…' : 'Assign'}
        </button>
      </div>
    </Backdrop>
  );
}

interface DeleteDialogProps {
  customer: Customer;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteDialog({
  customer,
  isSaving,
  onCancel,
  onConfirm,
}: DeleteDialogProps): JSX.Element {
  return (
    <Backdrop onCancel={onCancel}>
      <h2>Delete customer</h2>
      <p>
        {customer.name} ({customer.company}) will be removed. This cannot be undone.
      </p>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={isSaving}>
          Cancel
        </button>
        <button type="button" className="btn danger" onClick={onConfirm} disabled={isSaving}>
          {isSaving ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </Backdrop>
  );
}

function Backdrop({
  children,
  onCancel,
}: {
  children: ReactNode;
  onCancel: () => void;
}): JSX.Element {
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}
