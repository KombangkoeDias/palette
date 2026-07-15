import { HUD_SETTLE_MS } from '../constants/hud';
import { getMru } from './mruService';
import { recordGenuineVisit } from './mruRecording';
import { resetWalkState } from './tabHistoryService';

let commitTimer: ReturnType<typeof setTimeout> | undefined;
let pendingUrl: string | undefined;
let pendingTabId: number | undefined;
let expectedHudTabId: number | undefined;

/**
 * Schedules a debounced MRU write for the tab the user settles on after a HUD
 * walk. Intermediate fly-by activations are skipped via {@link isHudActivation}.
 */
export function scheduleHudWalkCommit(tabId: number, url: string): void {
  expectedHudTabId = tabId;
  pendingTabId = tabId;
  pendingUrl = url;
  if (commitTimer !== undefined) clearTimeout(commitTimer);
  commitTimer = setTimeout(() => {
    commitTimer = undefined;
    expectedHudTabId = undefined;
    const tabIdToRecord = pendingTabId;
    const urlToRecord = pendingUrl;
    pendingTabId = undefined;
    pendingUrl = undefined;
    if (urlToRecord !== undefined) {
      console.log('[Palette] HUD walk settled — committing MRU', {
        tabId: tabIdToRecord,
        url: urlToRecord,
      });
      void recordGenuineVisit(urlToRecord).then(async () => {
        await resetWalkState();
        console.log('[Palette] MRU after HUD commit', await getMru());
      });
    }
  }, HUD_SETTLE_MS);
}

/** True when `tabId` is a programmatic HUD step — skip immediate MRU recording. */
export function isHudActivation(tabId: number): boolean {
  return tabId === expectedHudTabId;
}

/** Clears a pending HUD commit when the user manually switches tabs. */
export function cancelHudWalkCommit(): void {
  if (commitTimer !== undefined) clearTimeout(commitTimer);
  commitTimer = undefined;
  expectedHudTabId = undefined;
  pendingTabId = undefined;
  pendingUrl = undefined;
}

/** Records MRU for manual activations; skips fly-by HUD steps. */
export function handleTabActivatedMru(tabId: number, url: string): void {
  if (isHudActivation(tabId)) return;
  cancelHudWalkCommit();
  if (url) void recordGenuineVisit(url);
}
