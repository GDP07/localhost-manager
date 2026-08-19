import React from 'react';
import { cn } from '../utils/cn';

type Variant = 'primary' | 'default' | 'subtle' | 'danger' | 'danger-quiet';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent/90 border border-transparent',
  default: 'bg-surface text-ink border border-line hover:bg-sunken hover:border-line-strong',
  subtle: 'bg-transparent text-muted border border-transparent hover:bg-sunken hover:text-ink',
  danger: 'bg-danger text-white hover:bg-danger/90 border border-transparent',
  'danger-quiet': 'bg-transparent text-danger border border-danger/35 hover:bg-danger/10'
};

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 gap-1.5 text-xs',
  md: 'h-8 px-3 gap-1.5 text-xs'
};

export const buttonBase =
  'inline-flex items-center justify-center rounded font-medium whitespace-nowrap ' +
  'transition-colors disabled:opacity-45 disabled:pointer-events-none';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'default',
  size = 'md',
  className,
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    className={cn(buttonBase, VARIANTS[variant], SIZES[size], className)}
    {...rest}
  />
);

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Required: an icon alone is not a label. Also used as the tooltip. */
  label: string;
}

export const IconButton: React.FC<IconButtonProps> = ({
  variant = 'subtle',
  size = 'md',
  label,
  className,
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    title={label}
    aria-label={label}
    className={cn(
      buttonBase,
      VARIANTS[variant],
      size === 'sm' ? 'h-7 w-7' : 'h-8 w-8',
      className
    )}
    {...rest}
  />
);
