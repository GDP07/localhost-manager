import { useEffect, useRef } from 'react';

interface ShortcutHandlers {
  onCommandPalette?: () => void;
  onRefresh?: () => void;
}

/**
 * Handlers are held in a ref so the listener is attached once, rather than being torn
 * down and rebuilt on every render by callers passing a fresh object literal.
 *
 * Escape is deliberately absent: each dialog owns its own dismissal (see ui/Modal).
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();

      // ⌘K and ⌘⇧P both open the palette; it is the only search surface.
      if (key === 'k' || (e.shiftKey && key === 'p')) {
        e.preventDefault();
        ref.current.onCommandPalette?.();
        return;
      }

      if (key === 'r') {
        e.preventDefault();
        ref.current.onRefresh?.();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
