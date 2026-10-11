'use client';

// Componentes base al estilo shadcn/ui (copiados y adaptados, sin la CLI).
import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  forwardRef,
  useEffect,
} from 'react';

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'bg-muted text-foreground hover:bg-border',
  ghost: 'hover:bg-muted',
  danger: 'bg-danger text-white hover:bg-danger/90',
  outline: 'border border-border bg-card hover:bg-muted',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }
>(function Button({ variant = 'primary', size = 'md', className, ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
});

const field =
  'w-full rounded-md border border-border bg-card px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { highlight?: boolean }>(
  function Input({ className, highlight, ...props }, ref) {
    return <input ref={ref} className={cn(field, 'h-9', highlight && 'border-warn bg-orange-50', className)} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(field, 'py-2', className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { highlight?: boolean }>(
  function Select({ className, highlight, ...props }, ref) {
    return <select ref={ref} className={cn(field, 'h-9', highlight && 'border-warn bg-orange-50', className)} {...props} />;
  },
);

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
      <span>{children}</span>
      {hint}
    </span>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <Label hint={hint}>{label}</Label>
      {children}
    </label>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium leading-none', className)}>
      {children}
    </span>
  );
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 pt-[6vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className={cn('w-full rounded-lg border border-border bg-card shadow-xl', wide ? 'max-w-3xl' : 'max-w-lg')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button className="text-muted-foreground hover:text-foreground" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">{children}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-3 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-white/40 px-1 text-[10px] opacity-80">{children}</kbd>;
}
