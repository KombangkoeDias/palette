import { useCallback, useEffect, useRef, useState } from 'react';
import { Palette } from '../components/Palette';
import { TabSwitcher } from '../components/TabSwitcher';
import { isBackgroundPush } from '../types/messages';
import type { PaletteTab } from '../types/tab';
import { useSettings } from '../hooks/useSettings';
import { matchesHotkey } from '../services/settings';

// If both the background command and the in-page interceptor react to the same
// keypress, ignore the second toggle that lands within this window.
const TOGGLE_DEBOUNCE_MS = 150;

// How long the quick-switch HUD lingers after the last back/forward press.
const SWITCHER_VISIBLE_MS = 1500;

interface SwitcherState {
  tabs: PaletteTab[];
  activeIndex: number;
}

/**
 * Root content-script component.
 *
 * Owns only the open/closed state of the overlay. When closed it renders
 * nothing, so the palette has zero runtime cost while idle. The heavy lifting
 * (data, search, keyboard) lives in {@link Palette}, which mounts fresh on each
 * open and therefore always starts from an up-to-date snapshot.
 */
export function App(): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  const [switcher, setSwitcher] = useState<SwitcherState | null>(null);
  const switcherTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastToggleAt = useRef(0);
  const settings = useSettings();
  // Kept in a ref so the keydown listener always sees the latest hotkey without
  // being torn down and re-attached on every settings change.
  const hotkeyRef = useRef(settings.toggleHotkey);
  useEffect(() => {
    hotkeyRef.current = settings.toggleHotkey;
  }, [settings.toggleHotkey]);

  // Single, debounced toggle shared by both trigger paths so a single keypress
  // can never flip the palette twice.
  const toggle = useCallback(() => {
    const now = Date.now();
    if (now - lastToggleAt.current < TOGGLE_DEBOUNCE_MS) return;
    lastToggleAt.current = now;
    setOpen((prev) => !prev);
  }, []);

  // Show the quick-switch HUD, resetting its auto-hide timer on each press.
  const showSwitcher = useCallback((next: SwitcherState) => {
    setSwitcher(next);
    if (switcherTimer.current !== undefined) clearTimeout(switcherTimer.current);
    switcherTimer.current = setTimeout(() => {
      setSwitcher(null);
    }, SWITCHER_VISIBLE_MS);
  }, []);

  // Background pushes: toggle the palette, or show the back/forward HUD.
  useEffect(() => {
    const listener = (message: unknown): void => {
      if (!isBackgroundPush(message)) return;
      if (message.type === 'TOGGLE_PALETTE') toggle();
      else if (message.type === 'SHOW_TAB_SWITCHER') {
        showSwitcher({ tabs: message.tabs, activeIndex: message.activeIndex });
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [toggle, showSwitcher]);

  useEffect(
    () => () => {
      if (switcherTimer.current !== undefined) clearTimeout(switcherTimer.current);
    },
    [],
  );

  // In-page interceptor for the configured hotkey (default Cmd/Ctrl+J).
  //
  // We must handle this in the page and call preventDefault(), otherwise the
  // browser's native action for the chord (e.g. Ctrl+J Downloads) fires.
  // Running in the capture phase lets us beat both the page's own handlers and
  // the default.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!matchesHotkey(event, hotkeyRef.current)) return;
      event.preventDefault();
      event.stopPropagation();
      toggle();
    };
    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      document.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [toggle]);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  if (!open && switcher === null) return null;
  return (
    <>
      {switcher !== null ? (
        <TabSwitcher tabs={switcher.tabs} activeIndex={switcher.activeIndex} />
      ) : null}
      {open ? <Palette onClose={close} /> : null}
    </>
  );
}
