import { useCallback, useEffect, useState } from 'react';
import type { Theme } from '../types/settings';
import { getSettings, onSettingsChanged, setSettings } from '../services/settings';

/** Synced dark/light theme for the new-tab page. */
export function useNewTabTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    getSettings()
      .then((settings) => setTheme(settings.theme))
      .catch((error: unknown) => {
        console.error('[Palette] failed to load theme', error);
      });
    return onSettingsChanged((settings) => setTheme(settings.theme));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.paletteTheme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const toggleTheme = useCallback(() => {
    void getSettings()
      .then((settings) => {
        const next: Theme = settings.theme === 'dark' ? 'light' : 'dark';
        return setSettings({ ...settings, theme: next }).then(() => setTheme(next));
      })
      .catch((error: unknown) => {
        console.error('[Palette] failed to save theme', error);
      });
  }, []);

  return { theme, toggleTheme };
}
