import type { Hotkey, Keymap, Settings } from '../types/settings';
import { KEY_ACTIONS } from '../types/settings';

/**
 * Reads/writes Palette's user settings in `chrome.storage.sync`, and provides
 * helpers to match, validate, and format hotkeys.
 *
 * The toggle hotkey drives the content script's in-page interceptor; the keymap
 * drives in-palette navigation. Both are fully customizable from the options
 * page (unlike the browser-wide `chrome.commands` shortcuts, which only Chrome's
 * own shortcuts page can change).
 */

const STORAGE_KEY = 'palette:settings';

/** True on macOS, where modifier labels differ (Cmd/Option/Control). */
export function isMac(): boolean {
  const ua = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = ua.userAgentData?.platform ?? navigator.userAgent;
  return /mac/i.test(platform);
}

function chord(key: string, overrides: Partial<Hotkey> = {}): Hotkey {
  return { ctrl: false, meta: false, alt: false, shift: false, key, ...overrides };
}

export function defaultHotkey(): Hotkey {
  // Cmd+J on macOS, Ctrl+J elsewhere. On normal web pages the content-script
  // interceptor catches this in the capture phase; on Windows/Linux this also
  // suppresses Chrome's "Downloads" (Ctrl+J) before it opens. (On restricted
  // pages like chrome:// where content scripts can't run, the browser default
  // still wins — an unavoidable Chrome limit.)
  return isMac() ? chord('j', { meta: true }) : chord('j', { ctrl: true });
}

export function defaultKeymap(): Keymap {
  return {
    navigateDown: chord('arrowdown'),
    navigateUp: chord('arrowup'),
    first: chord('home'),
    last: chord('end'),
    select: chord('enter'),
    selectAlt: chord('enter', { shift: true }),
    close: chord('escape'),
  };
}

export function defaultSettings(): Settings {
  return { toggleHotkey: defaultHotkey(), keymap: defaultKeymap() };
}

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  return normalizeSettings(stored[STORAGE_KEY]);
}

export async function setSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
}

/** Subscribes to settings changes from other contexts. Returns an unsubscribe. */
export function onSettingsChanged(callback: (settings: Settings) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName !== 'sync') return;
    const change = changes[STORAGE_KEY];
    if (change === undefined) return;
    const next: unknown = change.newValue;
    callback(normalizeSettings(next));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}

/** Returns true when a keyboard event exactly matches the hotkey chord. */
export function matchesHotkey(event: KeyboardEvent, hotkey: Hotkey): boolean {
  return (
    event.ctrlKey === hotkey.ctrl &&
    event.metaKey === hotkey.meta &&
    event.altKey === hotkey.alt &&
    event.shiftKey === hotkey.shift &&
    event.key.toLowerCase() === hotkey.key
  );
}

interface ValidateOptions {
  /** Require a Ctrl/Alt/Cmd modifier (used for the page-global toggle). */
  requireModifier?: boolean;
}

/**
 * Validates a chord.
 *
 * - The toggle must include a modifier (it's intercepted anywhere on the page).
 * - In-palette chords may use named keys (Arrow*, Enter, Escape, …) bare, but a
 *   printable single character needs a modifier so it can't clash with typing
 *   in the search box.
 */
export function isValidHotkey(hotkey: Hotkey, options: ValidateOptions = {}): boolean {
  if (hotkey.key.length === 0) return false;
  const hasModifier = hotkey.ctrl || hotkey.meta || hotkey.alt;
  if (options.requireModifier) return hasModifier;
  if (hotkey.key.length === 1) return hasModifier;
  return true;
}

const KEY_LABELS: Record<string, string> = {
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  enter: '↵',
  escape: 'Esc',
  ' ': 'Space',
  home: 'Home',
  end: 'End',
  pageup: 'PgUp',
  pagedown: 'PgDn',
  tab: 'Tab',
  backspace: '⌫',
  delete: 'Del',
};

/** Human-readable chord, e.g. "Ctrl + Shift + P" (platform-aware labels). */
export function formatHotkey(hotkey: Hotkey): string {
  const mac = isMac();
  const parts: string[] = [];
  if (hotkey.ctrl) parts.push(mac ? 'Control' : 'Ctrl');
  if (hotkey.alt) parts.push(mac ? 'Option' : 'Alt');
  if (hotkey.shift) parts.push('Shift');
  if (hotkey.meta) parts.push(mac ? 'Cmd' : 'Win');
  parts.push(formatKey(hotkey.key));
  return parts.join(' + ');
}

function formatKey(key: string): string {
  const label = KEY_LABELS[key];
  if (label !== undefined) return label;
  if (key.length === 1) return key.toUpperCase();
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function normalizeSettings(value: unknown): Settings {
  if (typeof value !== 'object' || value === null) return defaultSettings();
  const record = value as Record<string, unknown>;
  return {
    toggleHotkey: normalizeHotkey(record.toggleHotkey, defaultHotkey()),
    keymap: normalizeKeymap(record.keymap),
  };
}

function normalizeKeymap(value: unknown): Keymap {
  const defaults = defaultKeymap();
  const record =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const result = {} as Keymap;
  for (const action of KEY_ACTIONS) {
    result[action] = normalizeHotkey(record[action], defaults[action]);
  }
  return result;
}

function normalizeHotkey(value: unknown, fallback: Hotkey): Hotkey {
  if (typeof value !== 'object' || value === null) return fallback;
  const record = value as Record<string, unknown>;
  const key = typeof record.key === 'string' ? record.key.toLowerCase() : '';
  if (key === '') return fallback;
  return {
    ctrl: record.ctrl === true,
    meta: record.meta === true,
    alt: record.alt === true,
    shift: record.shift === true,
    key,
  };
}
