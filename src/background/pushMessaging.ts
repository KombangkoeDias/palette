import type { BackgroundPush } from '../types/messages';

/** Sends a one-way push to a tab's content script; ignores tabs without Palette. */
export async function sendToTab(tabId: number, message: BackgroundPush): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // The tab has no Palette content script (e.g. a chrome:// page). Ignore.
  }
}
