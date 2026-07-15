/**
 * Navigable tab-activation history, powering "previous/next tab" without opening
 * the palette.
 *
 * Model: an MRU cycle, like walking a back/forward timeline over the order in
 * which tabs were focused.
 * - `Cmd+<` (back) steps to progressively older tabs.
 * - `Cmd+>` (forward) steps back toward the most recent tab.
 *
 * The source of truth for "how recent" is the persisted URL MRU list (genuine
 * visits only — HUD fly-by previews do not reorder it). Chrome's `lastAccessed`
 * breaks ties for duplicate URLs and tabs missing from MRU. On a *fresh*
 * navigation (the first press, or any press after you manually switched tabs) we
 * rebuild the snapshot from MRU. While you keep pressing (a *continuing* walk)
 * we reuse that frozen snapshot and only move the cursor — otherwise our own
 * programmatic activations would corrupt the timeline mid-walk. After the HUD
 * settles and MRU commits, the frozen snapshot is cleared so the next walk
 * rebuilds from the updated MRU even if you stayed on the same tab.
 *
 * State lives in `chrome.storage.session` so it survives service-worker restarts
 * within a session but resets when the browser closes.
 */

import { getMru } from './mruService';
import { isNewTabUrl } from '../utils/url';
import { sortByMruRecency } from '../utils/mruOrder';

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

/** Clears frozen walk snapshots so the next navigation rebuilds from MRU. */
export async function resetWalkState(scope?: NavScope): Promise<void> {
  const scopes: NavScope[] = scope === undefined ? ['all', 'group'] : [scope];
  await Promise.all(
    scopes.map((entry) =>
      writeState(entry, { order: [], cursor: 0, lastNavId: undefined, groupId: undefined }),
    ),
  );
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
  // snapshot from the persisted URL list and anchor on the current tab.
  if (order.length === 0) {
    order = await orderByMru(groupId);
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

interface MruSortableTab {
  id: number;
  url: string;
  lastAccessed: number;
}

/** Open tabs sorted by persisted MRU, most recent first. */
async function orderByMru(groupId?: number): Promise<number[]> {
  const [rawTabs, mru] = await Promise.all([chrome.tabs.query({}), getMru()]);
  const tabs: MruSortableTab[] = rawTabs
    .filter((tab): tab is chrome.tabs.Tab & { id: number } => {
      if (!isNavigableTab(tab)) return false;
      if (groupId === undefined) return true;
      return tab.groupId === groupId;
    })
    .map((tab) => ({
      id: tab.id,
      url: tab.url ?? tab.pendingUrl ?? '',
      lastAccessed: tab.lastAccessed ?? 0,
    }));

  return sortByMruRecency(tabs, mru).map((tab) => tab.id);
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
