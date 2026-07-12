import { useEffect, useState } from 'react';
import type { Settings } from '../types/settings';
import { defaultSettings, getSettings, onSettingsChanged } from '../services/settings';

/**
 * Loads user settings and keeps them in sync with `chrome.storage` changes from
 * other contexts (e.g. saving from the options page updates the live palette).
 */
export function useSettings(): Settings {
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  useEffect(() => {
    let active = true;
    getSettings()
      .then((next) => {
        if (active) setSettings(next);
      })
      .catch((error: unknown) => {
        console.error('[Palette] failed to load settings', error);
      });

    const unsubscribe = onSettingsChanged((next) => {
      setSettings(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return settings;
}
