import type { PaletteAction } from '../commands/types';
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
export type RpcRequest = { type: 'GET_SNAPSHOT' } | { type: 'RUN_ACTION'; action: PaletteAction };

/** Maps each request `type` to its response payload. */
export interface RpcResponseMap {
  GET_SNAPSHOT: PaletteSnapshot;
  RUN_ACTION: { ok: true };
}

export type RpcResponseFor<T extends RpcRequest['type']> = RpcResponseMap[T];

/** One-way messages pushed from the background worker to content scripts. */
export type BackgroundPush =
  { type: 'TOGGLE_PALETTE' } | { type: 'SNAPSHOT_CHANGED'; snapshot: PaletteSnapshot };

/** Type guard for narrowing untyped `chrome.runtime.onMessage` payloads. */
export function isBackgroundPush(value: unknown): value is BackgroundPush {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return type === 'TOGGLE_PALETTE' || type === 'SNAPSHOT_CHANGED';
}

/** Type guard for narrowing untyped RPC requests on the background side. */
export function isRpcRequest(value: unknown): value is RpcRequest {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return type === 'GET_SNAPSHOT' || type === 'RUN_ACTION';
}
