import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { Hotkey, PaletteKeyAction, Settings } from '../types/settings';
import {
  defaultSettings,
  getSettings,
  isValidHotkey,
  setSettings as saveSettings,
} from '../services/settings';
import { HotkeyRecorder } from './HotkeyRecorder';
import logoUrl from './logo.png';

type Status = 'idle' | 'saved' | 'invalid';

const PALETTE_ACTIONS: { id: PaletteKeyAction; label: string }[] = [
  { id: 'navigateDown', label: 'Move selection down' },
  { id: 'navigateUp', label: 'Move selection up' },
  { id: 'first', label: 'Jump to first result' },
  { id: 'last', label: 'Jump to last result' },
  { id: 'select', label: 'Switch to selected tab' },
  { id: 'selectAlt', label: 'Move selected tab to current window' },
  { id: 'close', label: 'Close palette' },
];

export function Options(): ReactElement {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [status, setStatus] = useState<Status>('idle');

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch((error: unknown) => {
        console.error('[Palette] failed to load settings', error);
      });
  }, []);

  const updateToggle = useCallback((toggleHotkey: Hotkey) => {
    setSettings((prev) => ({ ...prev, toggleHotkey }));
    setStatus('idle');
  }, []);

  const updateKey = useCallback((action: PaletteKeyAction, hotkey: Hotkey) => {
    setSettings((prev) => ({ ...prev, keymap: { ...prev.keymap, [action]: hotkey } }));
    setStatus('idle');
  }, []);

  const updateNavigationHotkey = useCallback((field: keyof Pick<
    Settings,
    'backHotkey' | 'forwardHotkey' | 'groupBackHotkey' | 'groupForwardHotkey'
  >, hotkey: Hotkey) => {
    setSettings((prev) => ({ ...prev, [field]: hotkey }));
    setStatus('idle');
  }, []);

  const save = useCallback(() => {
    const toggleOk = isValidHotkey(settings.toggleHotkey, { requireModifier: true });
    const groupToggleOk = isValidHotkey(settings.toggleGroupHotkey, { requireModifier: true });
    const backOk = isValidHotkey(settings.backHotkey, { requireModifier: true });
    const forwardOk = isValidHotkey(settings.forwardHotkey, { requireModifier: true });
    const groupBackOk = isValidHotkey(settings.groupBackHotkey, { requireModifier: true });
    const groupForwardOk = isValidHotkey(settings.groupForwardHotkey, { requireModifier: true });
    const keysOk = PALETTE_ACTIONS.every((action) => isValidHotkey(settings.keymap[action.id]));
    if (!toggleOk || !groupToggleOk || !backOk || !forwardOk || !groupBackOk || !groupForwardOk || !keysOk) {
      setStatus('invalid');
      return;
    }
    saveSettings(settings)
      .then(() => {
        setStatus('saved');
      })
      .catch((error: unknown) => {
        console.error('[Palette] failed to save settings', error);
      });
  }, [settings]);

  const reset = useCallback(() => {
    const next = defaultSettings();
    setSettings(next);
    setStatus('idle');
    saveSettings(next)
      .then(() => {
        setStatus('saved');
      })
      .catch((error: unknown) => {
        console.error('[Palette] failed to reset settings', error);
      });
  }, []);

  const openBrowserShortcuts = useCallback(() => {
    void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  }, []);

  const toggleInvalid = !isValidHotkey(settings.toggleHotkey, { requireModifier: true });

  return (
    <main className="opt">
      <header className="opt__header">
        <img className="opt__logo" src={logoUrl} alt="Palette logo" width={56} height={56} />
        <div>
          <h1 className="opt__title">Palette</h1>
          <p className="opt__subtitle">Keyboard-first tab switching</p>
        </div>
      </header>

      <section className="opt__card">
        <div className="opt__row">
          <div>
            <h2 className="opt__heading">Open palette (in-page)</h2>
            <p className="opt__help">
              Opens the palette on web pages. Needs a modifier (Ctrl, Alt, or Cmd) so it can&apos;t
              fire while typing.
            </p>
          </div>
          <HotkeyRecorder
            value={settings.toggleHotkey}
            onChange={updateToggle}
            invalid={toggleInvalid}
          />
        </div>
      </section>

      <section className="opt__card">
        <div className="opt__row">
          <div>
            <h2 className="opt__heading">Open palette in current group</h2>
            <p className="opt__help">
              Opens the palette filtered to tabs in the same native Chrome tab group as the
              current tab. Default: Cmd/Ctrl + Shift + J.
            </p>
          </div>
          <HotkeyRecorder
            value={settings.toggleGroupHotkey}
            onChange={(toggleGroupHotkey) => {
              setSettings((prev) => ({ ...prev, toggleGroupHotkey }));
              setStatus('idle');
            }}
            invalid={!isValidHotkey(settings.toggleGroupHotkey, { requireModifier: true })}
          />
        </div>
      </section>

      <section className="opt__card">
        <p className="opt__help">
          Walk the tab timeline without opening the palette. Needs a modifier so it can&apos;t fire
          while typing. On restricted pages (e.g. <code>chrome://</code>) where the in-page
          interceptor can&apos;t run, rebind the matching command at Chrome&apos;s shortcuts page.
        </p>
        <ul className="opt__list">
          <li className="opt__list-row">
            <span className="opt__list-label">Previous tab (all tabs)</span>
            <HotkeyRecorder
              value={settings.backHotkey}
              onChange={(hotkey) => {
                updateNavigationHotkey('backHotkey', hotkey);
              }}
              invalid={!isValidHotkey(settings.backHotkey, { requireModifier: true })}
            />
          </li>
          <li className="opt__list-row">
            <span className="opt__list-label">Next tab (all tabs)</span>
            <HotkeyRecorder
              value={settings.forwardHotkey}
              onChange={(hotkey) => {
                updateNavigationHotkey('forwardHotkey', hotkey);
              }}
              invalid={!isValidHotkey(settings.forwardHotkey, { requireModifier: true })}
            />
          </li>
          <li className="opt__list-row">
            <span className="opt__list-label">Previous tab (current group)</span>
            <HotkeyRecorder
              value={settings.groupBackHotkey}
              onChange={(hotkey) => {
                updateNavigationHotkey('groupBackHotkey', hotkey);
              }}
              invalid={!isValidHotkey(settings.groupBackHotkey, { requireModifier: true })}
            />
          </li>
          <li className="opt__list-row">
            <span className="opt__list-label">Next tab (current group)</span>
            <HotkeyRecorder
              value={settings.groupForwardHotkey}
              onChange={(hotkey) => {
                updateNavigationHotkey('groupForwardHotkey', hotkey);
              }}
              invalid={!isValidHotkey(settings.groupForwardHotkey, { requireModifier: true })}
            />
          </li>
        </ul>
      </section>

      <section className="opt__card">
        <div className="opt__row">
          <div>
            <h2 className="opt__heading">Group tabs by domain</h2>
            <p className="opt__help">
              When a tab navigates to a site, place it in a native Chrome tab group labeled and
              colored by domain. If other tabs share the domain, move it into that domain&apos;s
              window and group them together.
            </p>
          </div>
          <label className="opt__toggle">
            <input
              type="checkbox"
              checked={settings.groupByDomain}
              onChange={(event) => {
                setSettings((prev) => ({ ...prev, groupByDomain: event.target.checked }));
                setStatus('idle');
              }}
            />
            <span className="opt__toggle-label">
              {settings.groupByDomain ? 'On' : 'Off'}
            </span>
          </label>
        </div>
      </section>

      <section className="opt__card">
        <p className="opt__help">
          These keys work while the palette is open. Named keys (arrows, Enter, Esc…) can be used on
          their own; letters need a modifier.
        </p>
        <ul className="opt__list">
          {PALETTE_ACTIONS.map((action) => (
            <li className="opt__list-row" key={action.id}>
              <span className="opt__list-label">{action.label}</span>
              <HotkeyRecorder
                value={settings.keymap[action.id]}
                onChange={(hotkey) => {
                  updateKey(action.id, hotkey);
                }}
                invalid={!isValidHotkey(settings.keymap[action.id])}
              />
            </li>
          ))}
        </ul>
      </section>

      {status === 'invalid' ? (
        <p className="opt__status opt__status--error">
          One or more shortcuts are invalid. Letters and characters need a modifier; named keys are
          fine on their own.
        </p>
      ) : null}
      {status === 'saved' ? <p className="opt__status opt__status--ok">Saved.</p> : null}

      <div className="opt__actions">
        <button type="button" className="opt__btn opt__btn--primary" onClick={save}>
          Save
        </button>
        <button type="button" className="opt__btn opt__btn--ghost" onClick={reset}>
          Reset to defaults
        </button>
      </div>

      <section className="opt__card opt__card--muted">
        <h2 className="opt__heading">Restricted pages</h2>
        <p className="opt__help">
          Palette shortcuts that run in the page (toggle, tab back/forward) can&apos;t intercept keys
          on browser-internal pages. Use Chrome&apos;s extension shortcuts page to set fallbacks for
          those commands.
        </p>
        <button type="button" className="opt__btn opt__btn--ghost" onClick={openBrowserShortcuts}>
          Open Chrome shortcuts
        </button>
      </section>
    </main>
  );
}
