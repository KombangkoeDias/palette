import { isRpcRequest } from '../types/messages';
import { buildSnapshot, handleRpc } from './rpc';
import { cleanupSingletonGroups, handleTabNavigation } from './groupingService';
import { recordUrl } from './mruService';
import { sendToTab } from './pushMessaging';
import { performTabNavigation } from './tabNavigation';
import { registerOmnibox } from './omniboxService';

/**
 * Palette background service worker.
 *
 * Responsibilities:
 * - Serve typed RPC requests from the UI (snapshot reads, action dispatch).
 * - Toggle the palette overlay when the keyboard command fires.
 * - Walk the MRU tab timeline on the "previous-tab" / "next-tab" commands.
 *   Group-scoped back/forward (Cmd/Ctrl+Shift+,/.) are intercepted by the
 *   content script — Chrome allows at most four manifest commands.
 * - Broadcast a fresh snapshot to open tabs whenever the tab set changes, so an
 *   open palette stays live without re-querying on every keystroke.
 */

const TOGGLE_COMMAND = 'toggle-palette';
const TOGGLE_GROUP_COMMAND = 'toggle-palette-group';
const PREVIOUS_TAB_COMMAND = 'previous-tab';
const NEXT_TAB_COMMAND = 'next-tab';
const BROADCAST_DEBOUNCE_MS = 150;

registerOmnibox();

// --- RPC: UI -> background -------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message: unknown, sender, sendResponse: (response?: unknown) => void) => {
    if (!isRpcRequest(message)) return undefined;
    handleRpc(message, sender.tab?.windowId, sender.tab?.id)
      .then(sendResponse)
      .catch((error: unknown) => {
        console.error('[Palette] RPC handler failed', error);
        sendResponse(undefined);
      });
    // Returning true keeps the message channel open for the async response.
    return true;
  },
);

// --- Keyboard command -> toggle overlay on the active tab ------------------

chrome.commands.onCommand.addListener((command) => {
  if (command === TOGGLE_COMMAND) void toggleActivePalette('all');
  else if (command === TOGGLE_GROUP_COMMAND) void toggleActivePalette('group');
  else if (command === PREVIOUS_TAB_COMMAND) void performTabNavigation('back', 'all', sendToTab);
  else if (command === NEXT_TAB_COMMAND) void performTabNavigation('forward', 'all', sendToTab);
});

// Clicking the toolbar icon opens the settings page.
chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

async function toggleActivePalette(scope: 'all' | 'group' = 'all'): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id === undefined) return;

  let groupId: number | undefined;
  if (scope === 'group' && tab.groupId !== -1) {
    groupId = tab.groupId;
  }

  await sendToTab(tab.id, { type: 'TOGGLE_PALETTE', scope, groupId });
}

// --- Live snapshot broadcasting -------------------------------------------

let broadcastTimer: ReturnType<typeof setTimeout> | undefined;

/** Coalesces bursts of tab events into a single broadcast. */
function scheduleBroadcast(): void {
  if (broadcastTimer !== undefined) clearTimeout(broadcastTimer);
  broadcastTimer = setTimeout(() => {
    broadcastTimer = undefined;
    void broadcastSnapshot();
  }, BROADCAST_DEBOUNCE_MS);
}

async function broadcastSnapshot(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id === undefined) return;
      const snapshot = await buildSnapshot(tab.id);
      await sendToTab(tab.id, { type: 'SNAPSHOT_CHANGED', snapshot });
    }),
  );
}

// Any change to the tab set or relevant tab metadata triggers a rebroadcast.
chrome.tabs.onCreated.addListener(scheduleBroadcast);
chrome.tabs.onActivated.addListener((activeInfo) => {
  void chrome.tabs
    .get(activeInfo.tabId)
    .then((tab) => {
      const url = tab.url ?? tab.pendingUrl ?? '';
      return recordUrl(url);
    })
    .catch(() => undefined);
});
chrome.tabs.onRemoved.addListener(() => {
  scheduleBroadcast();
  void cleanupSingletonGroups();
});
chrome.tabs.onMoved.addListener(scheduleBroadcast);
chrome.tabs.onAttached.addListener(scheduleBroadcast);
chrome.tabs.onDetached.addListener(() => {
  scheduleBroadcast();
  void cleanupSingletonGroups();
});
chrome.tabGroups.onUpdated.addListener(scheduleBroadcast);
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url !== undefined) {
    void handleTabNavigation(tabId);
  }

  // Only rebroadcast on fields the palette actually displays.
  if (
    changeInfo.title !== undefined ||
    changeInfo.url !== undefined ||
    changeInfo.favIconUrl !== undefined ||
    changeInfo.audible !== undefined ||
    changeInfo.mutedInfo !== undefined ||
    changeInfo.pinned !== undefined ||
    changeInfo.status === 'complete'
  ) {
    scheduleBroadcast();
  }
});
