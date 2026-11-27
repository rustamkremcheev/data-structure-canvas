import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger' | 'subtle';

const VARIANTS: Record<ButtonVariant, string> = {
  default: 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-700',
  primary: 'border border-violet-300 bg-violet-50 hover:bg-violet-100 text-violet-800',
  ghost: 'border border-transparent hover:bg-slate-100 text-slate-600',
  danger: 'border border-rose-200 bg-white hover:bg-rose-50 text-rose-700',
  subtle: 'border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'xs' }>(
  function Button({ variant = 'default', size = 'sm', className, type = 'button', ...rest }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={cx(
          'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
          size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-6 px-2 text-[11px]',
          VARIANTS[variant],
          className,
        )}
        {...rest}
      />
    );
  },
);

export function IconButton({
  label,
  shortcut,
  active,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; shortcut?: string; active?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-pressed={active}
      className={cx(
        'inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:opacity-40',
        active ? 'bg-violet-100 text-violet-800 ring-1 ring-violet-300' : 'text-slate-600 hover:bg-slate-100',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-1.5 mt-3 flex items-center justify-between first:mt-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{children}</h3>
      {right}
    </div>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-7 items-center gap-2 py-0.5">
      <div className="w-24 shrink-0 text-[12px] text-slate-500">{label}</div>
      <div className="min-w-0 flex-1 text-[12px]">{children}</div>
    </div>
  );
}

export const inputClass =
  'h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100';

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-slate-200 bg-slate-50 px-1 font-mono text-[10px] text-slate-500">{children}</kbd>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-slate-200 p-3 text-center text-[12px] text-slate-400">{children}</div>;
}
