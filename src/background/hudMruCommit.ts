import type { ChordModifiers } from '../services/settings';
import { isTrackableUrl, getMru, recordUrl } from './mruService';
import { markMruRecorded } from './mruClock';
import { scheduleSnapshotBroadcast } from './snapshotBroadcast';
import { resetWalkState } from './tabHistoryService';
import { HUD_WALK_SESSION_KEY } from '../constants/hudWalk';

const SESSION_KEY = HUD_WALK_SESSION_KEY;

export interface HudWalkSessionState {
  active: true;
  tabId: number;
  modifiers: ChordModifiers;
  /** False until SHOW_TAB_SWITCHER is sent — blocks premature commit from iframes. */
  shown: boolean;
  walkToken: number;
}

let pendingUrl: string | undefined;
let pendingTabId: number | undefined;
let expectedHudTabId: number | undefined;
let hudWalkToken = 0;

async function writeHudWalkSession(state: HudWalkSessionState | undefined): Promise<void> {
  if (state === undefined) {
    await chrome.storage.session.remove(SESSION_KEY);
    return;
  }
  await chrome.storage.session.set({ [SESSION_KEY]: state });
}

/**
 * Marks the next tab activation as a HUD fly-by and queues it for MRU commit
 * when the walk ends. Must run before {@link chrome.tabs.update} so
 * `tabs.onActivated` sees {@link isHudActivation} as true.
 */
export async function prepareHudWalkStep(
  tabId: number,
  url: string,
  modifiers: ChordModifiers,
): Promise<number> {
  const walkToken = ++hudWalkToken;
  expectedHudTabId = tabId;
  pendingTabId = tabId;
  pendingUrl = url || undefined;
  await writeHudWalkSession({
    active: true,
    tabId,
    modifiers,
    shown: false,
    walkToken,
  });
  return walkToken;
}

/** Allows iframe keyboard handlers to commit only after the HUD is visible. */
export async function markHudWalkShown(walkToken: number): Promise<void> {
  const stored = await chrome.storage.session.get(SESSION_KEY);
  const current = stored[SESSION_KEY] as HudWalkSessionState | undefined;
  if (current?.walkToken !== walkToken) return;
  await writeHudWalkSession({ ...current, shown: true });
}

/** Commits the pending HUD walk when the user releases the walk chord. */
export async function commitHudWalkNow(): Promise<boolean> {
  const tabIdToRecord = pendingTabId;
  let urlToRecord = pendingUrl;
  pendingTabId = undefined;
  pendingUrl = undefined;
  expectedHudTabId = undefined;
  await writeHudWalkSession(undefined);

  if (tabIdToRecord === undefined) return false;

  if (urlToRecord === undefined || !isTrackableUrl(urlToRecord)) {
    try {
      const tab = await chrome.tabs.get(tabIdToRecord);
      urlToRecord = tab.url ?? tab.pendingUrl ?? '';
    } catch {
      return false;
    }
  }

  if (!isTrackableUrl(urlToRecord)) return false;

  console.log('[Palette] HUD walk settled — committing MRU', {
    tabId: tabIdToRecord,
    url: urlToRecord,
  });
  await recordUrl(urlToRecord);
  markMruRecorded();
  scheduleSnapshotBroadcast();
  await resetWalkState();
  console.log('[Palette] MRU after HUD commit', await getMru());
  return true;
}

/** True when `tabId` is a programmatic HUD step — skip immediate MRU recording. */
export function isHudActivation(tabId: number): boolean {
  return tabId === expectedHudTabId;
}

/** Tab id waiting for HUD MRU commit, if any. */
export function getPendingHudTabId(): number | undefined {
  return pendingTabId;
}

/** Clears a pending HUD commit without recording MRU. */
export function cancelHudWalkCommit(): void {
  pendingTabId = undefined;
  pendingUrl = undefined;
  expectedHudTabId = undefined;
  void writeHudWalkSession(undefined);
}

/** True while a HUD walk is waiting to commit. */
export function hasPendingHudWalkCommit(): boolean {
  return expectedHudTabId !== undefined;
}
