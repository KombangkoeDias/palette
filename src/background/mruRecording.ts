import { isTrackableUrl, recordUrl, recordUrlAfterHead } from './mruService';
import { markMruRecorded, getLastMruRecordAt } from './mruClock';
import { scheduleSnapshotBroadcast } from './snapshotBroadcast';
import { commitHudWalkNow, getPendingHudTabId, isHudActivation } from './hudMruCommit';
import { sendToTab } from './pushMessaging';

/** Tabs activated before their URL was ready — keyed by tab id. */
const pendingActivations = new Map<number, number>();

/** Records a genuine tab visit and notifies open palettes of the new MRU order. */
export async function recordGenuineVisit(url: string): Promise<void> {
  await recordUrl(url);
  markMruRecorded();
  scheduleSnapshotBroadcast();
}

/** Records MRU for manual activations; skips fly-by HUD steps. */
export async function handleTabActivatedMru(tabId: number, url: string): Promise<void> {
  if (isHudActivation(tabId)) {
    pendingActivations.delete(tabId);
    return;
  }

  const hudTabId = getPendingHudTabId();
  if (hudTabId !== undefined) {
    await commitHudWalkNow();
    if (hudTabId !== tabId) {
      void sendToTab(hudTabId, { type: 'DISMISS_HUD' });
    }
  }

  if (isTrackableUrl(url)) {
    pendingActivations.delete(tabId);
    await recordGenuineVisit(url);
    return;
  }

  // Tab was focused but still loading — record once a trackable URL arrives.
  pendingActivations.set(tabId, Date.now());
}

/**
 * Records MRU when a tab finishes loading after a brief activation with no URL
 * yet (e.g. open tab and switch away before navigation completes).
 */
export function handleTabUrlUpdatedMru(tabId: number, url: string): void {
  if (!isTrackableUrl(url)) return;
  if (isHudActivation(tabId)) {
    pendingActivations.delete(tabId);
    return;
  }

  const activatedAt = pendingActivations.get(tabId);
  if (activatedAt === undefined) return;
  pendingActivations.delete(tabId);

  if (activatedAt >= getLastMruRecordAt()) {
    void recordGenuineVisit(url);
  } else {
    void recordGenuineVisitAfterHead(url);
  }
}

export function clearPendingActivationMru(tabId: number): void {
  pendingActivations.delete(tabId);
}

async function recordGenuineVisitAfterHead(url: string): Promise<void> {
  await recordUrlAfterHead(url);
  markMruRecorded();
  scheduleSnapshotBroadcast();
}
