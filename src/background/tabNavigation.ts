import type { BackgroundPush } from '../types/messages';
import type { ChordModifiers } from '../services/settings';
import { getSettings, modifiersFromHotkey } from '../services/settings';
import type { NavDirection, NavScope } from './tabHistoryService';
import { navigateHistory } from './tabHistoryService';
import { prepareHudWalkStep, markHudWalkShown } from './hudMruCommit';
import { activateTab, getTabsByIds } from './tabsService';

/** Ignore duplicate back/forward triggers from manifest commands + content script. */
const NAV_DEBOUNCE_MS = 100;
let lastNavAt = 0;
/** Bumps on each HUD nav so stale async completions cannot reopen the overlay. */
let hudNavGeneration = 0;

/**
 * MRU back/forward tab switching shared by `chrome.commands` and the content
 * script (group-scoped shortcuts exceed Chrome's 4-command manifest limit).
 */
export async function performTabNavigation(
  direction: NavDirection,
  scope: NavScope = 'all',
  sendToTab: (tabId: number, message: BackgroundPush) => Promise<void>,
  modifiers?: ChordModifiers,
): Promise<void> {
  const now = Date.now();
  if (now - lastNavAt < NAV_DEBOUNCE_MS) return;
  lastNavAt = now;

  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const result = await navigateHistory(
    direction,
    active?.id,
    scope === 'group' ? { scope, groupId: active?.groupId ?? -1 } : { scope },
  );
  if (result === undefined || result.targetId === active?.id) return;

  try {
    const tab = await chrome.tabs.get(result.targetId);
    if (tab.id === undefined) return;
    const url = tab.url ?? tab.pendingUrl ?? '';
    const walkModifiers =
      modifiers ?? modifiersFromHotkey((await getSettings()).backHotkey);
    const generation = ++hudNavGeneration;
    const walkToken = await prepareHudWalkStep(tab.id, url, walkModifiers);
    await activateTab(tab.id, tab.windowId);
    if (generation !== hudNavGeneration) return;
    await showSwitcherHud(result.order, result.targetId, walkToken, sendToTab);
  } catch {
    // Tab vanished between lookup and activation — nothing to do.
  }
}

async function showSwitcherHud(
  order: number[],
  targetId: number,
  walkToken: number,
  sendToTab: (tabId: number, message: BackgroundPush) => Promise<void>,
): Promise<void> {
  const tabs = await getTabsByIds(order);
  const activeIndex = tabs.findIndex((tab) => tab.id === targetId);
  if (activeIndex === -1) return;
  await markHudWalkShown(walkToken);
  await sendToTab(targetId, {
    type: 'SHOW_TAB_SWITCHER',
    tabs,
    activeIndex,
    walkToken,
  });
}
