import { useCallback, useEffect, useRef, useState } from 'react';
import { Palette } from '../components/Palette';
import { isBackgroundPush } from '../types/messages';
import { useSettings } from '../hooks/useSettings';
import { matchesHotkey } from '../services/settings';

// If both the background command and the in-page interceptor react to the same
// keypress, ignore the second toggle that lands within this window.
const TOGGLE_DEBOUNCE_MS = 150;

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

  // Toggle from the background keyboard command (works browser-wide, e.g. even
  // when focus is in the address bar).
  useEffect(() => {
    const listener = (message: unknown): void => {
      if (isBackgroundPush(message) && message.type === 'TOGGLE_PALETTE') {
        toggle();
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [toggle]);

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

  if (!open) return null;
  return <Palette onClose={close} />;
}
