import React from 'react';
import { cn } from '../utils/cn';

/** A labelled value. Label above, value below — never "Label: value" inline. */
export const Metric: React.FC<{
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  className?: string;
}> = ({ label, value, mono = true, className }) => (
  <div className={cn('min-w-0', className)}>
    <div className="text-meta uppercase tracking-wide text-faint">{label}</div>
    <div
      className={cn(
        'tnum mt-0.5 truncate text-xs text-ink',
        mono && 'font-mono'
      )}
    >
      {value}
    </div>
  </div>
);

/** Recessed well for command lines and paths. Always selectable. */
export const CodeBlock: React.FC<{
  children: React.ReactNode;
  title?: string;
  wrap?: boolean;
  className?: string;
}> = ({ children, title, wrap = false, className }) => (
  <code
    title={title}
    className={cn(
      'block rounded border border-line bg-sunken px-2 py-1.5 font-mono text-meta text-muted',
      wrap ? 'whitespace-pre-wrap break-all' : 'truncate',
      className
    )}
  >
    {children}
  </code>
);
