import React from 'react';
import { cn } from '../utils/cn';

type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger';

const TONES: Record<Tone, string> = {
  neutral: 'bg-sunken text-muted border-line',
  accent: 'bg-accent/10 text-accent border-accent/25',
  ok: 'bg-ok/10 text-ok border-ok/25',
  warn: 'bg-warn/10 text-warn border-warn/25',
  danger: 'bg-danger/10 text-danger border-danger/25'
};

export interface BadgeProps {
  tone?: Tone;
  mono?: boolean;
  className?: string;
  children: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  tone = 'neutral',
  mono = false,
  className,
  children
}) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded border px-1.5 py-px text-meta font-medium',
      mono && 'font-mono',
      TONES[tone],
      className
    )}
  >
    {children}
  </span>
);
