import type { PaletteSnapshot, RpcRequest, RpcResponseMap } from '../types/messages';
import type { PaletteAction } from '../commands/types';
import { activateTab, moveTabToWindow, queryAllTabs } from './tabsService';
import { getMru } from './mruService';
import { commitHudWalkNow, getPendingHudTabId } from './hudMruCommit';
import { recordGenuineVisit } from './mruRecording';
import { sendToTab } from './pushMessaging';
import { performTabNavigation } from './tabNavigation';
import {
  closeCluster,
  closeTab,
  dismissFrequentSite,
  focusCluster,
  listTabGroups,
  moveClusterToWindow,
  openFrequentSite,
} from './groupsService';

/**
 * Builds the snapshot the UI renders from (open tabs + MRU order).
 *
 * `currentTabId` is the palette's own tab when known (from the RPC sender);
 * otherwise we fall back to the focused window's active tab (for broadcasts).
 */
export async function buildSnapshot(currentTabId?: number): Promise<PaletteSnapshot> {
  const [tabs, mru] = await Promise.all([queryAllTabs(), getMru()]);
  const resolvedCurrent = currentTabId ?? (await getFocusedActiveTabId());
  return { tabs, mru, currentTabId: resolvedCurrent };
}

async function getFocusedActiveTabId(): Promise<number | undefined> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.id;
  } catch {
    return undefined;
  }
}

type RpcResult = RpcResponseMap[RpcRequest['type']];

/**
 * Executes a single RPC request and resolves with its typed response.
 *
 * `senderWindowId` is the window the request came from (i.e. the user's current
 * window), used by window-relative actions like "move tab here".
 *
 * This is the only place Chrome side effects are triggered on behalf of the UI.
 * New commands plug in by extending the `PaletteAction` union and adding a case.
 */
export async function handleRpc(
  request: RpcRequest,
  senderWindowId: number | undefined,
  senderTabId: number | undefined,
): Promise<RpcResult> {
  switch (request.type) {
    case 'GET_SNAPSHOT':
      return buildSnapshot(senderTabId);

    case 'RUN_ACTION':
      return runAction(request.action, senderWindowId);

    case 'NAVIGATE_TAB_HISTORY':
      await performTabNavigation(request.direction, request.scope, sendToTab, request.modifiers);
      return { ok: true };

    case 'COMMIT_HUD_WALK': {
      const hudTabId = getPendingHudTabId() ?? senderTabId;
      await commitHudWalkNow();
      const dismissTargets = new Set<number>();
      if (hudTabId !== undefined) dismissTargets.add(hudTabId);
      if (senderTabId !== undefined) dismissTargets.add(senderTabId);
      const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (active?.id !== undefined) dismissTargets.add(active.id);
      await Promise.all(
        [...dismissTargets].map((tabId) => sendToTab(tabId, { type: 'DISMISS_HUD' })),
      );
      return { ok: true };
    }

    case 'GET_TAB_GROUPS':
      return listTabGroups(senderWindowId);

    case 'MOVE_CLUSTER_HERE': {
      const targetWindowId = await resolveCurrentWindowId(senderWindowId);
      await moveClusterToWindow(request.cluster, targetWindowId);
      return { ok: true };
    }

    case 'FOCUS_CLUSTER':
      await focusCluster(request.cluster);
      return { ok: true };

    case 'OPEN_FREQUENT_SITE':
      await openFrequentSite(request.site);
      return { ok: true };

    case 'REMOVE_FREQUENT_SITE':
      await dismissFrequentSite(request.domain);
      return { ok: true };

    case 'CLOSE_TAB':
      await closeTab(request.tabId, senderTabId);
      return { ok: true };

    case 'CLOSE_CLUSTER':
      await closeCluster(request.cluster, senderTabId);
      return { ok: true };

    default:
      return assertNever(request);
  }
}

/**
 * Performs a {@link PaletteAction}. New commands add a branch here (e.g. close
 * tab, mute tab, open URL).
 */
async function runAction(
  action: PaletteAction,
  senderWindowId: number | undefined,
): Promise<{ ok: true }> {
  const hudTabId = getPendingHudTabId();
  if (hudTabId !== undefined) {
    await commitHudWalkNow();
    void sendToTab(hudTabId, { type: 'DISMISS_HUD' });
  }

  // Resolve the URL first so MRU stays accurate even if the tab later closes.
  const url = await getActiveActionUrl(action.tabId);

  switch (action.type) {
    case 'ACTIVATE_TAB':
      await activateTab(action.tabId, action.windowId);
      break;
    case 'MOVE_TAB_TO_CURRENT_WINDOW': {
      const targetWindowId = await resolveCurrentWindowId(senderWindowId);
      await moveTabToWindow(action.tabId, targetWindowId);
      break;
    }
    default:
      return assertNever(action);
  }

  // Tab activation MRU is recorded by `onActivated`; moves don't activate the tab.
  if (action.type === 'MOVE_TAB_TO_CURRENT_WINDOW' && url) await recordGenuineVisit(url);
  return { ok: true };
}

/**
 * Determines the window to move a tab into: the sender's window when known,
 * otherwise the last focused window.
 */
async function resolveCurrentWindowId(senderWindowId: number | undefined): Promise<number> {
  if (senderWindowId !== undefined && senderWindowId !== chrome.windows.WINDOW_ID_NONE) {
    return senderWindowId;
  }
  const win = await chrome.windows.getLastFocused();
  return win.id ?? chrome.windows.WINDOW_ID_CURRENT;
}

async function getActiveActionUrl(tabId: number): Promise<string> {
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab.url ?? '';
  } catch {
    return '';
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled RPC variant: ${JSON.stringify(value)}`);
}
