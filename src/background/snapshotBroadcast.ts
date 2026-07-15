import { buildSnapshot } from './rpc';
import { sendToTab } from './pushMessaging';

const BROADCAST_DEBOUNCE_MS = 150;

let broadcastTimer: ReturnType<typeof setTimeout> | undefined;

/** Coalesces bursts of snapshot updates into a single broadcast. */
export function scheduleSnapshotBroadcast(): void {
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
