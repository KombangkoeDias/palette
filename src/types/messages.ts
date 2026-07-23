import type { PaletteAction } from '../commands/types';
import type { ChordModifiers } from '../services/settings';
import type { FrequentSite, TabClusterRef, TabGroupsSnapshot } from './groups';
import type { PaletteTab } from './tab';

/**
 * The typed wire protocol between the content script (UI) and the background
 * service worker.
 *
 * Two directions:
 * - {@link RpcRequest}: UI -> background request/response (Chrome API access).
 * - {@link BackgroundPush}: background -> UI one-way notifications.
 */

/** A point-in-time view of the browser that the UI renders from. */
export interface PaletteSnapshot {
  tabs: PaletteTab[];
  /** Tab URLs ordered most-recently-used first. */
  mru: string[];
  /** The tab hosting this palette; hidden from results so it can't switch to itself. */
  currentTabId?: number | undefined;
}

/** Requests the UI can issue to the background worker. */
export type RpcRequest =
  | { type: 'GET_SNAPSHOT' }
  | { type: 'RUN_ACTION'; action: PaletteAction }
  | { type: 'NAVIGATE_TAB_HISTORY'; direction: 'back' | 'forward'; scope: 'all' | 'group'; modifiers?: ChordModifiers }
  | { type: 'COMMIT_HUD_WALK' }
  | { type: 'GET_TAB_GROUPS' }
  | { type: 'MOVE_CLUSTER_HERE'; cluster: TabClusterRef }
  | { type: 'FOCUS_CLUSTER'; cluster: TabClusterRef }
  | { type: 'OPEN_FREQUENT_SITE'; site: FrequentSite }
  | { type: 'REMOVE_FREQUENT_SITE'; domain: string }
  | { type: 'CLOSE_TAB'; tabId: number }
  | { type: 'CLOSE_CLUSTER'; cluster: TabClusterRef };

/** Maps each request `type` to its response payload. */
export interface RpcResponseMap {
  GET_SNAPSHOT: PaletteSnapshot;
  RUN_ACTION: { ok: true };
  NAVIGATE_TAB_HISTORY: { ok: true };
  COMMIT_HUD_WALK: { ok: true };
  GET_TAB_GROUPS: TabGroupsSnapshot;
  MOVE_CLUSTER_HERE: { ok: true };
  FOCUS_CLUSTER: { ok: true };
  OPEN_FREQUENT_SITE: { ok: true };
  REMOVE_FREQUENT_SITE: { ok: true };
  CLOSE_TAB: { ok: true };
  CLOSE_CLUSTER: { ok: true };
}

export type RpcResponseFor<T extends RpcRequest['type']> = RpcResponseMap[T];

/** One-way messages pushed from the background worker to content scripts. */
export type BackgroundPush =
  | { type: 'TOGGLE_PALETTE'; scope?: 'all' | 'group'; groupId?: number | undefined }
  | { type: 'SNAPSHOT_CHANGED'; snapshot: PaletteSnapshot }
  | { type: 'SHOW_TAB_SWITCHER'; tabs: PaletteTab[]; activeIndex: number; walkToken: number }
  | { type: 'DISMISS_HUD' };

/** Type guard for narrowing untyped `chrome.runtime.onMessage` payloads. */
export function isBackgroundPush(value: unknown): value is BackgroundPush {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === 'TOGGLE_PALETTE' || type === 'SNAPSHOT_CHANGED' || type === 'SHOW_TAB_SWITCHER'
    || type === 'DISMISS_HUD'
  );
}

/** Type guard for narrowing untyped RPC requests on the background side. */
export function isRpcRequest(value: unknown): value is RpcRequest {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return type === 'GET_SNAPSHOT' || type === 'RUN_ACTION' || type === 'NAVIGATE_TAB_HISTORY'
    || type === 'COMMIT_HUD_WALK'
    || type === 'GET_TAB_GROUPS' || type === 'MOVE_CLUSTER_HERE' || type === 'FOCUS_CLUSTER'
    || type === 'OPEN_FREQUENT_SITE' || type === 'REMOVE_FREQUENT_SITE'
    || type === 'CLOSE_TAB' || type === 'CLOSE_CLUSTER';
}
