import { isRpcRequest } from '../types/messages';
import type { BackgroundPush } from '../types/messages';
import { buildSnapshot, handleRpc } from './rpc';
import { activateTab } from './tabsService';
import type { NavDirection } from './tabHistoryService';
import { navigateHistory } from './tabHistoryService';

/**
 * Palette background service worker.
 *
 * Responsibilities:
 * - Serve typed RPC requests from the UI (snapshot reads, action dispatch).
 * - Toggle the palette overlay when the keyboard command fires.
 * - Walk the MRU tab timeline on the "previous-tab" / "next-tab" commands.
 * - Broadcast a fresh snapshot to open tabs whenever the tab set changes, so an
 *   open palette stays live without re-querying on every keystroke.
 */

const TOGGLE_COMMAND = 'toggle-palette';
const PREVIOUS_TAB_COMMAND = 'previous-tab';
const NEXT_TAB_COMMAND = 'next-tab';
const BROADCAST_DEBOUNCE_MS = 150;

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
  if (command === TOGGLE_COMMAND) void toggleActivePalette();
  else if (command === PREVIOUS_TAB_COMMAND) void navigate('back');
  else if (command === NEXT_TAB_COMMAND) void navigate('forward');
});

// Clicking the toolbar icon opens the settings page.
chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

async function toggleActivePalette(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id === undefined) return;
  await sendToTab(tab.id, { type: 'TOGGLE_PALETTE' });
}

// --- MRU back/forward tab navigation --------------------------------------

async function navigate(direction: NavDirection): Promise<void> {
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const targetId = await navigateHistory(direction, active?.id);
  if (targetId === undefined || targetId === active?.id) return;

  try {
    const tab = await chrome.tabs.get(targetId);
    if (tab.id !== undefined) await activateTab(tab.id, tab.windowId);
  } catch {
    // Tab vanished between lookup and activation — nothing to do.
  }
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
  const snapshot = await buildSnapshot();
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map((tab) =>
      tab.id === undefined
        ? Promise.resolve()
        : sendToTab(tab.id, { type: 'SNAPSHOT_CHANGED', snapshot }),
    ),
  );
}

async function sendToTab(tabId: number, message: BackgroundPush): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // The tab has no Palette content script (e.g. a chrome:// page). Ignore.
  }
}

// Any change to the tab set or relevant tab metadata triggers a rebroadcast.
chrome.tabs.onCreated.addListener(scheduleBroadcast);
chrome.tabs.onRemoved.addListener(scheduleBroadcast);
chrome.tabs.onMoved.addListener(scheduleBroadcast);
chrome.tabs.onAttached.addListener(scheduleBroadcast);
chrome.tabs.onDetached.addListener(scheduleBroadcast);
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
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
