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

const STORAGE_KEY = 'palette:tabHistory';

export type NavDirection = 'back' | 'forward';

interface HistoryState {
  /** Frozen MRU snapshot for the current walk (index 0 = most recent). */
  order: number[];
  /** Position within `order`. */
  cursor: number;
  /** The tab we last navigated to; used to detect a continuing walk. */
  lastNavId?: number | undefined;
}

async function readState(): Promise<HistoryState> {
  const stored = await chrome.storage.session.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY];
  if (typeof value !== 'object' || value === null) return { order: [], cursor: 0 };
  const record = value as Record<string, unknown>;
  const order = Array.isArray(record.order)
    ? record.order.filter((entry): entry is number => typeof entry === 'number')
    : [];
  const cursor = typeof record.cursor === 'number' ? record.cursor : 0;
  const lastNavId = typeof record.lastNavId === 'number' ? record.lastNavId : undefined;
  return { order, cursor, lastNavId };
}

async function writeState(state: HistoryState): Promise<void> {
  await chrome.storage.session.set({ [STORAGE_KEY]: state });
}

/**
 * Steps `back` (older) or `forward` (more recent) through the tab timeline and
 * returns the tab id to activate, or `undefined` if there's nowhere to go.
 */
export async function navigateHistory(
  direction: NavDirection,
  currentId: number | undefined,
): Promise<number | undefined> {
  const state = await readState();

  // A "continuing" walk is one where we're still sitting on the tab we last
  // jumped to — then we keep the frozen snapshot and just move the cursor.
  let order: number[] = [];
  let cursor = 0;
  if (currentId !== undefined && currentId === state.lastNavId) {
    order = await pruneOrder(state.order);
    const index = order.indexOf(currentId);
    cursor = index === -1 ? Math.min(state.cursor, Math.max(0, order.length - 1)) : index;
  }

  // Fresh walk (first press, or after a manual tab switch): rebuild the MRU
  // snapshot from Chrome's lastAccessed and anchor on the current tab.
  if (order.length === 0) {
    order = await orderByLastAccessed();
    cursor = currentId === undefined ? 0 : Math.max(0, order.indexOf(currentId));
  }

  if (order.length === 0) {
    await writeState({ order, cursor: 0, lastNavId: undefined });
    return undefined;
  }

  cursor = direction === 'back' ? Math.min(cursor + 1, order.length - 1) : Math.max(cursor - 1, 0);

  const target = order[cursor];
  await writeState({ order, cursor, lastNavId: target });
  return target;
}

/** Open tabs sorted by `lastAccessed`, most recent first. */
async function orderByLastAccessed(): Promise<number[]> {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((tab): tab is chrome.tabs.Tab & { id: number } => tab.id !== undefined)
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))
    .map((tab) => tab.id);
}

async function pruneOrder(order: number[]): Promise<number[]> {
  const alive: number[] = [];
  for (const id of order) {
    if (await tabExists(id)) alive.push(id);
  }
  return alive;
}

async function tabExists(id: number): Promise<boolean> {
  try {
    await chrome.tabs.get(id);
    return true;
  } catch {
    return false;
  }
}
