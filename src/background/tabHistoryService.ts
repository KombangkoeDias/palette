/**
 * Navigable tab-activation history, powering "previous/next tab" without opening
 * the palette.
 *
 * Model: an MRU cycle, like walking a back/forward timeline over the order in
 * which tabs were focused.
 * - `Cmd+<` (back) steps to progressively older tabs.
 * - `Cmd+>` (forward) steps back toward the most recent tab.
 *
 * The source of truth for "how recent" is Chrome's own `tab.lastAccessed`. On a
 * *fresh* navigation (the first press, or any press after you manually switched
 * tabs) we rebuild the MRU snapshot from `lastAccessed`, so the first `Cmd+<`
 * always lands on the tab you were just on. While you keep pressing (a
 * *continuing* walk) we reuse that frozen snapshot and only move the cursor —
 * otherwise our own programmatic activations would reshuffle `lastAccessed` and
 * corrupt the timeline.
 *
 * State lives in `chrome.storage.session` so it survives service-worker restarts
 * within a session but resets when the browser closes.
 */

import { isNewTabUrl } from '../utils/url';

const GLOBAL_STORAGE_KEY = 'palette:tabHistory';
const GROUP_STORAGE_KEY = 'palette:tabHistoryGroup';

export type NavDirection = 'back' | 'forward';
export type NavScope = 'all' | 'group';

export interface NavigateOptions {
  scope?: NavScope;
  /** Required when `scope` is `'group'`; use `-1` for ungrouped tabs. */
  groupId?: number;
}

export interface NavResult {
  /** The tab to activate. */
  targetId: number;
  /** The frozen MRU snapshot being walked (index 0 = most recent). */
  order: number[];
  /** Position of the target within `order`. */
  cursor: number;
}

interface HistoryState {
  /** Frozen MRU snapshot for the current walk (index 0 = most recent). */
  order: number[];
  /** Position within `order`. */
  cursor: number;
  /** The tab we last navigated to; used to detect a continuing walk. */
  lastNavId?: number | undefined;
  /** Which tab group the frozen snapshot belongs to (group scope only). */
  groupId?: number | undefined;
}

function storageKey(scope: NavScope): string {
  return scope === 'group' ? GROUP_STORAGE_KEY : GLOBAL_STORAGE_KEY;
}

async function readState(scope: NavScope): Promise<HistoryState> {
  const key = storageKey(scope);
  const stored = await chrome.storage.session.get(key);
  const value = stored[key];
  if (typeof value !== 'object' || value === null) return { order: [], cursor: 0 };
  const record = value as Record<string, unknown>;
  const order = Array.isArray(record.order)
    ? record.order.filter((entry): entry is number => typeof entry === 'number')
    : [];
  const cursor = typeof record.cursor === 'number' ? record.cursor : 0;
  const lastNavId = typeof record.lastNavId === 'number' ? record.lastNavId : undefined;
  const groupId = typeof record.groupId === 'number' ? record.groupId : undefined;
  return { order, cursor, lastNavId, groupId };
}

async function writeState(scope: NavScope, state: HistoryState): Promise<void> {
  await chrome.storage.session.set({ [storageKey(scope)]: state });
}

/**
 * Steps `back` (older) or `forward` (more recent) through the tab timeline and
 * returns the tab id to activate, or `undefined` if there's nowhere to go.
 */
export async function navigateHistory(
  direction: NavDirection,
  currentId: number | undefined,
  options: NavigateOptions = {},
): Promise<NavResult | undefined> {
  const scope = options.scope ?? 'all';
  const groupId = scope === 'group' ? (options.groupId ?? -1) : undefined;
  const state = await readState(scope);

  // A "continuing" walk is one where we're still sitting on the tab we last
  // jumped to — then we keep the frozen snapshot and just move the cursor.
  let order: number[] = [];
  let cursor = 0;
  const sameGroup = scope !== 'group' || state.groupId === groupId;
  if (currentId !== undefined && currentId === state.lastNavId && sameGroup) {
    order = await pruneOrder(state.order);
    const index = order.indexOf(currentId);
    cursor = index === -1 ? Math.min(state.cursor, Math.max(0, order.length - 1)) : index;
  }

  // Fresh walk (first press, or after a manual tab switch): rebuild the MRU
  // snapshot from Chrome's lastAccessed and anchor on the current tab.
  if (order.length === 0) {
    order = await orderByLastAccessed(groupId);
    if (currentId === undefined) {
      cursor = 0;
    } else {
      const index = order.indexOf(currentId);
      // Anchor before the MRU list when the active tab isn't navigable (e.g. new-tab page).
      cursor = index === -1 ? -1 : index;
    }
  }

  if (order.length === 0) {
    await writeState(scope, { order, cursor: 0, lastNavId: undefined, groupId });
    return undefined;
  }

  cursor = direction === 'back' ? Math.min(cursor + 1, order.length - 1) : Math.max(cursor - 1, 0);

  const target = order[cursor];
  if (target === undefined) return undefined;
  await writeState(scope, { order, cursor, lastNavId: target, groupId });
  return { targetId: target, order, cursor };
}

function isNavigableTab(tab: chrome.tabs.Tab): tab is chrome.tabs.Tab & { id: number } {
  if (tab.id === undefined) return false;
  const url = tab.url ?? tab.pendingUrl ?? '';
  return !isNewTabUrl(url);
}

/** Open tabs sorted by `lastAccessed`, most recent first. */
async function orderByLastAccessed(groupId?: number): Promise<number[]> {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((tab): tab is chrome.tabs.Tab & { id: number } => {
      if (!isNavigableTab(tab)) return false;
      if (groupId === undefined) return true;
      return (tab.groupId ?? -1) === groupId;
    })
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))
    .map((tab) => tab.id);
}

async function pruneOrder(order: number[]): Promise<number[]> {
  const alive: number[] = [];
  for (const id of order) {
    try {
      if (isNavigableTab(await chrome.tabs.get(id))) alive.push(id);
    } catch {
      // Tab closed between snapshot and lookup — skip it.
    }
  }
  return alive;
}
