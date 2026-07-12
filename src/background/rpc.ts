import type { PaletteSnapshot, RpcRequest, RpcResponseMap } from '../types/messages';
import type { PaletteAction } from '../commands/types';
import { activateTab, moveTabToWindow, queryAllTabs } from './tabsService';
import { getMru, recordUrl } from './mruService';

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

  if (url) await recordUrl(url);
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
