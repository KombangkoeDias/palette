import type { PaletteTab } from '../types/tab';
import { getHostname, isLocalHost, isNewTabUrl } from '../utils/url';

/**
 * Background-only wrapper around the `chrome.tabs` / `chrome.windows` APIs.
 *
 * Everything here runs in the service worker. The UI never imports this module;
 * it reaches these capabilities through the typed RPC layer instead.
 */

/**
 * Drops favicons hosted on the local machine / private network.
 *
 * Loading such an `<img>` from a public page triggers Chrome's Local Network
 * Access prompt, so we let those tabs fall back to the letter avatar instead.
 * `data:` favicons are always safe (no network request).
 */
function safeFaviconUrl(favIconUrl: string | undefined): string | undefined {
  if (favIconUrl === undefined || favIconUrl === '') return undefined;
  if (favIconUrl.startsWith('data:')) return favIconUrl;
  try {
    return isLocalHost(new URL(favIconUrl).hostname) ? undefined : favIconUrl;
  } catch {
    return undefined;
  }
}

const TAB_GROUP_ID_NONE = -1;

/** Projects a raw `chrome.tabs.Tab` into our serializable {@link PaletteTab}. */
function toPaletteTab(
  tab: chrome.tabs.Tab,
  groups: ReadonlyMap<number, chrome.tabGroups.TabGroup>,
): PaletteTab | null {
  // Tabs without an id can't be activated, so they're useless to the palette.
  if (tab.id === undefined || tab.id === chrome.tabs.TAB_ID_NONE) return null;

  const url = tab.url ?? tab.pendingUrl ?? '';
  if (isNewTabUrl(url)) return null;

  const groupId = tab.groupId !== TAB_GROUP_ID_NONE ? tab.groupId : undefined;
  const group = groupId !== undefined ? groups.get(groupId) : undefined;

  return {
    id: tab.id,
    windowId: tab.windowId,
    // `||` (not `??`) is intentional: empty/whitespace titles should fall
    // through to the next best label.
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    title: tab.title?.trim() || getHostname(url) || url || 'Untitled',
    url,
    hostname: getHostname(url),
    favIconUrl: safeFaviconUrl(tab.favIconUrl),
    pinned: tab.pinned,
    audible: tab.audible ?? false,
    muted: tab.mutedInfo?.muted ?? false,
    lastAccessed: tab.lastAccessed ?? 0,
    groupId,
    groupTitle: group?.title,
    groupColor: group?.color,
  };
}

/** Projects the given tab ids into {@link PaletteTab}s, preserving order and skipping any that vanished. */
export async function getTabsByIds(ids: readonly number[]): Promise<PaletteTab[]> {
  const groups = await loadGroupMap();
  const result: PaletteTab[] = [];
  for (const id of ids) {
    try {
      const projected = toPaletteTab(await chrome.tabs.get(id), groups);
      if (projected) result.push(projected);
    } catch {
      // Tab closed between snapshot and lookup — skip it.
    }
  }
  return result;
}

async function loadGroupMap(): Promise<Map<number, chrome.tabGroups.TabGroup>> {
  const groups = await chrome.tabGroups.query({});
  return new Map(groups.map((group) => [group.id, group]));
}

/** Returns every open tab across all normal windows. */
export async function queryAllTabs(): Promise<PaletteTab[]> {
  const [tabs, groups] = await Promise.all([chrome.tabs.query({}), loadGroupMap()]);
  const result: PaletteTab[] = [];
  for (const tab of tabs) {
    const projected = toPaletteTab(tab, groups);
    if (projected) result.push(projected);
  }
  return result;
}

/**
 * Activates a tab and focuses its window.
 *
 * If the tab lives in another Chrome window, that window is brought to the
 * foreground so the switch is seamless across windows.
 */
export async function activateTab(tabId: number, windowId: number): Promise<void> {
  await chrome.tabs.update(tabId, { active: true });
  // Focusing may fail if the window was closed in a race; ignore that case.
  try {
    await chrome.windows.update(windowId, { focused: true });
  } catch {
    // Window no longer exists — nothing to focus.
  }
}

/**
 * Moves a tab into the target window (appending it at the end), then activates
 * it there. Used to pull a tab from another window into the current one.
 */
export async function moveTabToWindow(tabId: number, windowId: number): Promise<void> {
  await chrome.tabs.move(tabId, { windowId, index: -1 });
  await activateTab(tabId, windowId);
}

/** Closes tabs by id, optionally skipping one tab (e.g. the new-tab page). */
export async function closeTabs(tabIds: readonly number[], excludeTabId?: number): Promise<void> {
  const ids = tabIds.filter((id) => id !== excludeTabId);
  if (ids.length === 0) return;
  await chrome.tabs.remove(ids);
}
