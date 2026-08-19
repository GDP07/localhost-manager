import { useCallback, useEffect, useState } from 'react';
import { AppConfig } from '../../../shared/types/config';

export type Theme = AppConfig['theme'];

const STORAGE_KEY = 'lm.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function apply(theme: Theme): void {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia(DARK_QUERY).matches);
  document.documentElement.classList.toggle('dark', dark);
}

/**
 * Applied from main.tsx before the first render, so the UI never paints in the
 * wrong theme while the config round-trip is in flight. The mirror in localStorage
 * exists purely to make this synchronous.
 */
export function applyStoredTheme(): void {
  try {
    apply((localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'dark');
  } catch {
    // localStorage unavailable: the class on <html> stays as authored.
  }
}

/**
 * Theme lives in the persisted AppConfig so it survives relaunch. A mirror in
 * localStorage lets index.html apply the class before first paint, avoiding a flash.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'dark'
  );

  // Config is the authority; adopt it once the main process answers.
  useEffect(() => {
    let cancelled = false;
    window.localhostManagerAPI?.getAppConfig().then((config) => {
      if (!cancelled && config.theme) {
        setThemeState(config.theme);
        localStorage.setItem(STORAGE_KEY, config.theme);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    apply(theme);
    if (theme !== 'system') return;

    // Follow the OS while set to 'system'.
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => apply('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
    window.localhostManagerAPI?.updateAppConfig({ theme: next });
  }, []);

  const resolved: 'dark' | 'light' =
    theme === 'system'
      ? window.matchMedia(DARK_QUERY).matches
        ? 'dark'
        : 'light'
      : theme;

  return { theme, resolved, setTheme };
}
