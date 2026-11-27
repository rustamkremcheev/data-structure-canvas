import { create } from 'zustand';

export type FormField =
  | { name: string; label: string; type: 'text'; defaultValue?: string; placeholder?: string; required?: boolean; hint?: string; autoFocus?: boolean }
  | { name: string; label: string; type: 'number'; defaultValue?: number; min?: number; max?: number; hint?: string; autoFocus?: boolean }
  | { name: string; label: string; type: 'select'; options: { value: string; label: string }[]; defaultValue?: string; hint?: string }
  | { name: string; label: string; type: 'checkbox'; defaultValue?: boolean; hint?: string };

export type FormValues = Record<string, string | number | boolean>;

export interface FormRequest {
  title: string;
  description?: string;
  fields: FormField[];
  submitLabel?: string;
  /** Return an error message to keep the dialog open. */
  onSubmit(values: FormValues): string | void;
}

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm(): void;
}

interface DialogStore {
  form: FormRequest | null;
  confirm: ConfirmRequest | null;
  openForm(f: FormRequest): void;
  closeForm(): void;
  openConfirm(c: ConfirmRequest): void;
  closeConfirm(): void;
}

export const useDialogStore = create<DialogStore>((set) => ({
  form: null,
  confirm: null,
  openForm: (form) => set({ form }),
  closeForm: () => set({ form: null }),
  openConfirm: (confirm) => set({ confirm }),
  closeConfirm: () => set({ confirm: null }),
}));

export const openForm = (f: FormRequest) => useDialogStore.getState().openForm(f);
export const openConfirm = (c: ConfirmRequest) => useDialogStore.getState().openConfirm(c);
