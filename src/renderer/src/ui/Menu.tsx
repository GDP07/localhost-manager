import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../utils/cn';

export interface MenuItem {
  label: string;
  /** Right-aligned annotation, e.g. the signal a stop action sends. */
  note?: string;
  tone?: 'default' | 'warn' | 'danger';
  onSelect: () => void;
}

const TONES = {
  default: 'text-ink',
  warn: 'text-warn',
  danger: 'text-danger'
} as const;

/**
 * Anchored menu that closes on outside press, Escape, and selection.
 * `align` positions it against the trigger; `side` flips it above for footer triggers.
 */
export const Menu: React.FC<{
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  items: MenuItem[];
  align?: 'left' | 'right';
  side?: 'top' | 'bottom';
  className?: string;
}> = ({ trigger, items, align = 'right', side = 'bottom', className }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-40 min-w-[190px] animate-fade-in overflow-hidden rounded-lg',
            'border border-line bg-raised py-1 shadow-pop',
            align === 'right' ? 'right-0' : 'left-0',
            side === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'
          )}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                'flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left',
                'text-xs transition-colors hover:bg-sunken',
                TONES[item.tone ?? 'default']
              )}
            >
              <span>{item.label}</span>
              {item.note && <span className="font-mono text-meta text-faint">{item.note}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
