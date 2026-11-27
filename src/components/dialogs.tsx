import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useDialogStore, type FormRequest, type FormValues } from '../stores/dialogStore';
import { useProjectStore } from '../stores/projectStore';
import { useUiStore } from '../stores/uiStore';
import { Button, cx, inputClass } from './ui';

export function Modal({ title, onClose, children, width = 'w-[420px]', testId }: { title: string; onClose(): void; children: ReactNode; width?: string; testId?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/10 pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={title}
        data-testid={testId}
        className={cx('max-h-[76vh] overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm dc-scroll', width)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <h2 className="text-[13px] font-semibold text-slate-800">{title}</h2>
          <button className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function defaultValues(form: FormRequest): FormValues {
  const init: FormValues = {};
  for (const f of form.fields) {
    if (f.type === 'checkbox') init[f.name] = f.defaultValue ?? false;
    else if (f.type === 'number') init[f.name] = f.defaultValue ?? 0;
    else init[f.name] = f.defaultValue ?? (f.type === 'select' ? (f.options[0]?.value ?? '') : '');
  }
  return init;
}

export function FormDialog() {
  const form = useDialogStore((s) => s.form);
  const close = useDialogStore((s) => s.closeForm);
  const [values, setValues] = useState<FormValues>({});
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement | null>(null);

  useLayoutEffect(() => {
    if (!form) return;
    setValues(defaultValues(form));
    setError(null);
    setTimeout(() => firstRef.current?.select(), 0);
  }, [form]);

  if (!form) return null;
  const submit = () => {
    for (const f of form.fields) {
      if (f.type === 'text' && f.required && !String(values[f.name] ?? '').trim()) {
        setError(`${f.label} is required`);
        return;
      }
    }
    const err = form.onSubmit({ ...defaultValues(form), ...values });
    if (err) setError(err);
    else close();
  };
  let focusAssigned = false;
  return (
    <Modal title={form.title} onClose={close} testId="form-dialog">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-3"
      >
        {form.description && <p className="text-[12px] leading-relaxed text-slate-500">{form.description}</p>}
        {form.fields.map((f) => {
          const wantsFocus = !focusAssigned && (f.type === 'text' || f.type === 'number');
          if (wantsFocus) focusAssigned = true;
          return (
            <label key={f.name} className={cx('block', f.type === 'checkbox' && 'flex items-center gap-2')}>
              {f.type !== 'checkbox' && <span className="mb-1 block text-[12px] font-medium text-slate-600">{f.label}</span>}
              {f.type === 'text' && (
                <input
                  ref={wantsFocus ? firstRef : undefined}
                  name={f.name}
                  className={inputClass}
                  value={String(values[f.name] ?? '')}
                  placeholder={f.placeholder}
                  onChange={(e) => setValues((prev) => ({ ...prev, [f.name]: e.target.value }))}
                />
              )}
              {f.type === 'number' && (
                <input
                  ref={wantsFocus ? firstRef : undefined}
                  name={f.name}
                  type="number"
                  className={inputClass}
                  min={f.min}
                  max={f.max}
                  value={Number(values[f.name] ?? 0)}
                  onChange={(e) => setValues((prev) => ({ ...prev, [f.name]: Number(e.target.value) }))}
                />
              )}
              {f.type === 'select' && (
                <select name={f.name} className={inputClass} value={String(values[f.name] ?? '')} onChange={(e) => setValues((prev) => ({ ...prev, [f.name]: e.target.value }))}>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
              {f.type === 'checkbox' && (
                <>
                  <input name={f.name} type="checkbox" checked={Boolean(values[f.name])} onChange={(e) => setValues((prev) => ({ ...prev, [f.name]: e.target.checked }))} />
                  <span className="text-[12px] text-slate-700">{f.label}</span>
                </>
              )}
              {f.hint && <span className="mt-1 block text-[11px] text-slate-400">{f.hint}</span>}
            </label>
          );
        })}
        {error && <div className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[12px] text-rose-700">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" data-testid="form-submit">
            {form.submitLabel ?? 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function ConfirmDialog() {
  const c = useDialogStore((s) => s.confirm);
  const close = useDialogStore((s) => s.closeConfirm);
  if (!c) return null;
  return (
    <Modal title={c.title} onClose={close} testId="confirm-dialog">
      <p className="text-[12px] leading-relaxed text-slate-600">{c.message}</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button
          variant={c.danger ? 'danger' : 'primary'}
          data-testid="confirm-ok"
          onClick={() => {
            close();
            c.onConfirm();
          }}
        >
          {c.confirmLabel ?? 'Confirm'}
        </Button>
      </div>
    </Modal>
  );
}

/** Shown when the user acts while viewing a past state. */
export function BranchDialog() {
  const pending = useProjectStore((s) => s.pendingBranch);
  const confirm = useProjectStore((s) => s.confirmBranch);
  const cancel = useProjectStore((s) => s.cancelBranch);
  if (!pending) return null;
  return (
    <Modal title="You are viewing a past state" onClose={cancel} testId="branch-dialog">
      <p className="text-[12px] leading-relaxed text-slate-600">
        This action would continue from an earlier point in the timeline. The {pending.futureCount} later operation
        {pending.futureCount === 1 ? '' : 's'} will not be deleted — they are kept as a separate branch you can switch back to from the timeline.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={cancel}>
          Cancel
        </Button>
        <Button variant="primary" data-testid="branch-confirm" onClick={confirm}>
          Create branch and continue
        </Button>
      </div>
    </Modal>
  );
}

export function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2" data-testid="toasts">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          onClick={() => dismiss(t.id)}
          className={cx(
            'pointer-events-auto max-w-[520px] rounded-md border px-3 py-1.5 text-[12px] shadow-sm',
            t.kind === 'error' && 'border-rose-200 bg-rose-50 text-rose-800',
            t.kind === 'info' && 'border-slate-200 bg-white text-slate-700',
            t.kind === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-800',
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
