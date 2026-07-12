/**
 * A keyboard chord. Used both for the in-page open shortcut and for each action
 * inside the palette.
 *
 * `key` is the non-modifier key, normalized to lowercase. For named keys it
 * matches `KeyboardEvent.key` lowercased (e.g. "arrowdown", "enter", "escape",
 * "home"); for character keys it's the character (e.g. "p", "k").
 */
export interface Hotkey {
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

/** Actions handled by the palette's keyboard navigation. */
export const KEY_ACTIONS = [
  'navigateDown',
  'navigateUp',
  'first',
  'last',
  'select',
  'selectAlt',
  'close',
] as const;

export type PaletteKeyAction = (typeof KEY_ACTIONS)[number];

/** A configurable chord for every in-palette action. */
export type Keymap = Record<PaletteKeyAction, Hotkey>;

export type PaletteScope = 'all' | 'group';

export type Theme = 'dark' | 'light';

export interface Settings {
  /** In-page chord that opens/closes the palette (intercepted by the content script). */
  toggleHotkey: Hotkey;
  /** In-page chord that opens the palette scoped to the current tab group. */
  toggleGroupHotkey: Hotkey;
  /** Walk back through the MRU tab timeline across all tabs. */
  backHotkey: Hotkey;
  /** Walk forward through the MRU tab timeline across all tabs. */
  forwardHotkey: Hotkey;
  /** Walk back through the MRU tab timeline within the current tab group. */
  groupBackHotkey: Hotkey;
  /** Walk forward through the MRU tab timeline within the current tab group. */
  groupForwardHotkey: Hotkey;
  /** Chords for actions while the palette is open. */
  keymap: Keymap;
  /** Auto-group tabs by domain and move new tabs into the matching window. */
  groupByDomain: boolean;
  /** New-tab page appearance. */
  theme: Theme;
}
