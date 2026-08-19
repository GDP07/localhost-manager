import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '../utils/cn';
import { IconButton } from './Button';

/**
 * Only the topmost open dialog responds to Escape, so closing a process tree opened
 * from the inspector returns you to the inspector rather than dismissing both.
 */
const stack: symbol[] = [];

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl'
} as const;

export interface ModalProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Leading glyph in the header; a port number reads better than an icon. */
  marker?: React.ReactNode;
  size?: keyof typeof SIZES;
  onClose: () => void;
  /** Controls in the header, right of the title, before the close button. */
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  /** Fill the viewport height — for log streams that should not resize as they fill. */
  tall?: boolean;
  bodyClassName?: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  title,
  subtitle,
  marker,
  size = 'md',
  onClose,
  actions,
  footer,
  tall = false,
  bodyClassName,
  children
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = Symbol('dialog');
    stack.push(id);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === id) {
        e.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    // Move focus in so Escape and tabbing work without clicking first.
    panelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const i = stack.indexOf(id);
      if (i !== -1) stack.splice(i, 1);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/45 p-6"
      onMouseDown={(e) => {
        // Dismiss only on a press that starts on the backdrop, so a text selection
        // that drifts out of the panel does not close the dialog.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className={cn(
          'flex w-full animate-panel-in flex-col overflow-hidden rounded-lg border',
          'border-line bg-surface shadow-panel focus:outline-none',
          SIZES[size],
          tall ? 'h-[82vh]' : 'max-h-[85vh]'
        )}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
          {marker}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 truncate text-meta text-faint">{subtitle}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {actions}
            <IconButton label="Close" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        </header>

        <div className={cn('scroll-thin min-h-0 flex-1 overflow-y-auto', bodyClassName ?? 'p-4')}>
          {children}
        </div>

        {footer && (
          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-sunken/60 px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
};
