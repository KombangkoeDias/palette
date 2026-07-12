import type { PaletteTab } from '../types/tab';

/**
 * The command system is the extensibility seam of Palette.
 *
 * Today there is a single provider (tabs), but bookmarks, history, tab actions
 * ("close current tab", "mute tab"), quick links, and AI commands can all be
 * added later by implementing {@link CommandProvider} and registering it — no
 * changes to the UI or messaging layers required.
 */

/** Visual badges rendered on the right of a result row. */
export type BadgeKind = 'pinned' | 'audible' | 'muted';

export interface PaletteBadge {
  kind: BadgeKind;
  /** Accessible label, e.g. "Pinned". */
  label: string;
  /** Glyph rendered in the row, e.g. an emoji. */
  glyph: string;
}

/** Switches to (and focuses the window of) a specific tab. */
export interface ActivateTabAction {
  type: 'ACTIVATE_TAB';
  tabId: number;
  windowId: number;
}

/**
 * Moves a tab into the user's current window (the window the palette was opened
 * in) and activates it there. The target window is resolved by the background
 * from the message sender, so no window id is needed here.
 */
export interface MoveTabToCurrentWindowAction {
  type: 'MOVE_TAB_TO_CURRENT_WINDOW';
  tabId: number;
}

/**
 * A serializable description of a side effect to run in the background worker.
 *
 * Actions are a discriminated union so new commands extend it (e.g.
 * `| CloseTabAction | OpenUrlAction`) without breaking existing handlers. The
 * UI never touches Chrome APIs directly — it dispatches an action and the
 * background performs it.
 */
export type PaletteAction = ActivateTabAction | MoveTabToCurrentWindowAction;

/** A single, selectable row in the palette. */
export interface PaletteItem {
  /** Stable, unique id (e.g. `tab:123`); used as the React key and for selection. */
  id: string;
  title: string;
  subtitle?: string | undefined;
  favIconUrl?: string | undefined;
  badges: PaletteBadge[];
  /** The effect performed when the item is chosen (Enter / click). */
  action: PaletteAction;
  /** Optional secondary effect, triggered with Shift+Enter / Shift+click. */
  altAction?: PaletteAction | undefined;
  /** Ranking score; lower is better. Set by the provider during search. */
  score?: number;
  /** Native tab group label when the tab belongs to a group. */
  groupTitle?: string | undefined;
  /** Native tab group color name (`blue`, `red`, …). */
  groupColor?: string | undefined;
}

/**
 * Shared signals passed to every provider so ranking stays consistent.
 */
export interface ProviderContext {
  /** All open tabs (already projected to {@link PaletteTab}). */
  tabs: readonly PaletteTab[];
  /** Tab URLs ordered most-recently-used first. */
  mru: readonly string[];
}

/**
 * Turns a user query into palette items. Implementations should be pure with
 * respect to `context` and must return items already sorted best-first.
 */
export interface CommandProvider {
  readonly id: string;
  getItems(query: string, context: ProviderContext): PaletteItem[] | Promise<PaletteItem[]>;
}
