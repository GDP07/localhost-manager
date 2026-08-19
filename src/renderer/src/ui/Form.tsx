import React from 'react';
import { cn } from '../utils/cn';

const CONTROL =
  'w-full rounded border border-line bg-canvas px-2.5 text-xs text-ink ' +
  'placeholder:text-faint transition-colors hover:border-line-strong ' +
  'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25';

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({
  className,
  ...rest
}) => <input className={cn(CONTROL, 'h-8 selectable', className)} {...rest} />;

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({
  className,
  ...rest
}) => <select className={cn(CONTROL, 'h-8 cursor-pointer pr-1.5', className)} {...rest} />;

export interface FieldProps {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

export const Field: React.FC<FieldProps> = ({
  label,
  hint,
  required,
  className,
  children
}) => (
  <label className={cn('block', className)}>
    <span className="mb-1.5 flex items-baseline gap-1.5">
      <span className="text-xs font-medium text-ink">{label}</span>
      {required && <span className="text-meta text-danger">required</span>}
    </span>
    {children}
    {hint && <span className="mt-1.5 block text-meta text-faint">{hint}</span>}
  </label>
);

export interface ToggleProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export const Toggle: React.FC<ToggleProps> = ({ label, hint, checked, onChange }) => (
  <label className="flex cursor-pointer items-start justify-between gap-4">
    <span className="min-w-0">
      <span className="block text-xs font-medium text-ink">{label}</span>
      {hint && <span className="mt-0.5 block text-meta text-faint">{hint}</span>}
    </span>
    <input
      type="checkbox"
      role="switch"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className={cn(
        'relative mt-0.5 h-[18px] w-8 shrink-0 cursor-pointer appearance-none rounded-full',
        'border border-line bg-sunken transition-colors',
        'checked:border-accent checked:bg-accent',
        // Knob.
        'before:absolute before:left-0.5 before:top-1/2 before:h-3 before:w-3',
        'before:-translate-y-1/2 before:rounded-full before:bg-faint before:transition-transform',
        'checked:before:translate-x-[14px] checked:before:bg-white'
      )}
    />
  </label>
);
