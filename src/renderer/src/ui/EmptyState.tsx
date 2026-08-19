import React from 'react';

export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  body?: string;
  children?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, body, children }) => (
  <div className="mx-auto flex max-w-sm flex-col items-center px-6 py-20 text-center">
    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-faint">
      {icon}
    </div>
    <h3 className="text-sm font-semibold text-ink">{title}</h3>
    {body && <p className="mt-1.5 text-xs leading-relaxed text-muted">{body}</p>}
    {children && <div className="mt-4 flex items-center gap-2">{children}</div>}
  </div>
);
