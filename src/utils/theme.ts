import type { ThemePreference } from '../types';

export type ResolvedTheme = 'light' | 'dark';

function getSystemPrefersDark(): boolean {
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

/**
 * Resolves a theme preference against the current system appearance.
 */
export function resolveThemePreference(
  preference: ThemePreference,
  systemPrefersDark: boolean = getSystemPrefersDark(),
): ResolvedTheme {
  if (preference === 'system') {
    return systemPrefersDark ? 'dark' : 'light';
  }

  return preference;
}

/**
 * Applies the resolved PromptBridge theme to the document root.
 */
export function applyThemePreference(
  preference: ThemePreference,
  root: HTMLElement = document.documentElement,
): ResolvedTheme {
  const resolvedTheme = resolveThemePreference(preference);
  root.dataset.theme = resolvedTheme;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolvedTheme;
  return resolvedTheme;
}

/**
 * Returns the next manual theme preference for the header toggle.
 */
export function getNextManualTheme(
  preference: ThemePreference,
  resolvedTheme: ResolvedTheme,
): ThemePreference {
  if (preference === 'system') {
    return resolvedTheme === 'dark' ? 'light' : 'dark';
  }

  return preference === 'dark' ? 'light' : 'dark';
}

/**
 * Subscribes to system theme changes for pages using the system preference.
 */
export function subscribeToSystemTheme(
  onChange: (resolvedTheme: ResolvedTheme) => void,
): () => void {
  const mediaQueryList = globalThis.matchMedia?.('(prefers-color-scheme: dark)');

  if (!mediaQueryList) {
    return () => undefined;
  }

  const listener = (event: MediaQueryListEvent): void => {
    onChange(event.matches ? 'dark' : 'light');
  };

  if (typeof mediaQueryList.addEventListener === 'function') {
    mediaQueryList.addEventListener('change', listener);

    return () => {
      mediaQueryList.removeEventListener('change', listener);
    };
  }

  mediaQueryList.addListener(listener);

  return () => {
    mediaQueryList.removeListener(listener);
  };
}
