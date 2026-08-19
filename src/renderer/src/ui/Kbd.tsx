import React from 'react';
import { cn } from '../utils/cn';

export const Kbd: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className
}) => (
  <kbd
    className={cn(
      'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded',
      'border border-line bg-sunken px-1 font-sans text-meta text-faint',
      className
    )}
  >
    {children}
  </kbd>
);
