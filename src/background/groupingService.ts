import { getSettings } from '../services/settings';
import { getHostname } from '../utils/url';

/**
 * Domain-based tab grouping: when a tab navigates to an http(s) URL, place it in
 * a native Chrome tab group labeled and colored by domain. When same-domain tabs
 * already live in another window, those tabs are moved into the navigating tab's
 * window (the group follows the new tab, not the other way around).
 */

const TAB_GROUP_ID_NONE = -1;

const GROUP_COLORS: readonly chrome.tabGroups.Color[] = [
  chrome.tabGroups.Color.BLUE,
  chrome.tabGroups.Color.RED,
  chrome.tabGroups.Color.GREEN,
  chrome.tabGroups.Color.YELLOW,
  chrome.tabGroups.Color.PINK,
  chrome.tabGroups.Color.PURPLE,
  chrome.tabGroups.Color.CYAN,
  chrome.tabGroups.Color.ORANGE,
  chrome.tabGroups.Color.GREY,
];

/** Tabs currently being grouped — prevents re-entrancy from our own move/group events. */
const inFlight = new Set<number>();

/** Returns true when a tab can be placed in a domain group. */
function isGroupableTab(tab: chrome.tabs.Tab): boolean {
  if (tab.pinned) return false;
  const url = tab.url ?? tab.pendingUrl ?? '';
  if (url === '' || url === 'about:blank') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function tabDomain(tab: chrome.tabs.Tab): string {
  return getHostname(tab.url ?? tab.pendingUrl ?? '');
}

/** Stable group color derived from the domain string. */
export function colorForDomain(domain: string): chrome.tabGroups.Color {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = (hash * 31 + domain.charCodeAt(i)) | 0;
  }
  return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length] ?? chrome.tabGroups.Color.BLUE;
}

async function findSameDomainTabs(domain: string, excludeId: number): Promise<chrome.tabs.Tab[]> {
  const tabs = await chrome.tabs.query({});
  return tabs.filter((tab) => {
    if (tab.id === undefined || tab.id === excludeId) return false;
    if (!isGroupableTab(tab)) return false;
    return tabDomain(tab) === domain;
  });
}

async function findSameDomainTabsInWindow(
  domain: string,
  windowId: number,
): Promise<chrome.tabs.Tab[]> {
  const tabs = await chrome.tabs.query({ windowId });
  return tabs.filter((tab) => isGroupableTab(tab) && tabDomain(tab) === domain);
}

async function isAlreadyGrouped(tab: chrome.tabs.Tab, domain: string): Promise<boolean> {
  if (tab.groupId === TAB_GROUP_ID_NONE) return false;
  try {
    const group = await chrome.tabGroups.get(tab.groupId);
    return group.title === domain;
  } catch {
    return false;
  }
}

/**
 * Moves same-domain peers from other windows into `targetWindowId`, preserving
 * relative order. Marks peers in-flight so our own moves don't re-enter.
 */
async function movePeersToWindow(
  peers: readonly chrome.tabs.Tab[],
  targetWindowId: number,
): Promise<void> {
  const toMove = peers.filter(
    (peer): peer is chrome.tabs.Tab & { id: number } =>
      peer.id !== undefined && peer.windowId !== targetWindowId,
  );
  if (toMove.length === 0) return;

  for (const peer of toMove) {
    inFlight.add(peer.id);
  }
  try {
    for (const peer of toMove) {
      await chrome.tabs.move(peer.id, { windowId: targetWindowId, index: -1 });
    }
  } finally {
    for (const peer of toMove) {
      inFlight.delete(peer.id);
    }
  }
}

async function findDomainGroupInWindow(
  windowId: number,
  domain: string,
): Promise<number | undefined> {
  const groups = await chrome.tabGroups.query({ windowId });
  for (const group of groups) {
    if (group.title === domain) return group.id;
  }
  return undefined;
}

/** Removes a tab from a group when it was inherited (e.g. "open link in new tab"). */
async function ungroupIfMismatched(tabId: number, domain: string): Promise<void> {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.groupId === TAB_GROUP_ID_NONE) return;
    const group = await chrome.tabGroups.get(tab.groupId);
    if (group.title === domain) return;
    await chrome.tabs.ungroup(tabId);
  } catch {
    // Tab or group changed — ignore.
  }
}

async function ensureDomainGroup(domain: string, tabIds: number[]): Promise<void> {
  if (tabIds.length === 0) return;

  const first = tabIds[0];
  if (first === undefined) return;

  for (const id of tabIds) {
    await ungroupIfMismatched(id, domain);
  }

  const idsTuple: [number, ...number[]] =
    tabIds.length === 1 ? [first] : [first, ...tabIds.slice(1)];

  const anchor = await chrome.tabs.get(first);
  const existingGroupId = await findDomainGroupInWindow(anchor.windowId, domain);

  const groupOptions: chrome.tabs.GroupOptions = { tabIds: idsTuple };
  if (existingGroupId !== undefined) groupOptions.groupId = existingGroupId;

  const groupId = await chrome.tabs.group(groupOptions);

  await chrome.tabGroups.update(groupId, {
    title: domain,
    color: colorForDomain(domain),
  });
}

/**
 * On navigation: place the tab in a native Chrome group for its domain. When
 * same-domain tabs already exist elsewhere, move them into this tab's window.
 */
export async function handleTabNavigation(tabId: number): Promise<void> {
  if (inFlight.has(tabId)) return;

  const settings = await getSettings();
  if (!settings.groupByDomain) return;

  inFlight.add(tabId);
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!isGroupableTab(tab)) return;

    const domain = tabDomain(tab);
    if (domain === '') return;

    const peers = await findSameDomainTabs(domain, tabId);
    const targetWindowId = tab.windowId;
    const peersElsewhere = peers.some((peer) => peer.windowId !== targetWindowId);

    // Already in the right domain group in this window, and nothing to pull in.
    if (!peersElsewhere && (await isAlreadyGrouped(tab, domain))) return;

    await movePeersToWindow(peers, targetWindowId);

    const sameDomainInTarget = await findSameDomainTabsInWindow(domain, targetWindowId);
    const tabIds = sameDomainInTarget
      .map((t) => t.id)
      .filter((id): id is number => id !== undefined);

    if (tab.id !== undefined && !tabIds.includes(tab.id)) {
      tabIds.push(tab.id);
    }

    await ensureDomainGroup(domain, tabIds);

    if (tab.active && tab.id !== undefined) {
      await chrome.tabs.update(tab.id, { active: true });
    }
  } catch (error: unknown) {
    console.error('[Palette] domain grouping failed', error);
  } finally {
    inFlight.delete(tabId);
  }
}

/** Ungroups accidental singletons; keeps intentional single-tab domain groups. */
export async function cleanupSingletonGroups(): Promise<void> {
  const settings = await getSettings();
  const tabs = await chrome.tabs.query({});
  const groupCounts = new Map<number, number>();
  for (const tab of tabs) {
    if (tab.groupId !== TAB_GROUP_ID_NONE) {
      groupCounts.set(tab.groupId, (groupCounts.get(tab.groupId) ?? 0) + 1);
    }
  }

  for (const [groupId, count] of groupCounts) {
    if (count !== 1) continue;
    const grouped = await chrome.tabs.query({ groupId });
    const lone = grouped[0];
    if (lone?.id === undefined) continue;

    if (settings.groupByDomain && isGroupableTab(lone)) {
      const domain = tabDomain(lone);
      try {
        const group = await chrome.tabGroups.get(groupId);
        if (group.title === domain) continue;
      } catch {
        // Group may have changed — fall through to ungroup.
      }
    }

    try {
      await chrome.tabs.ungroup(lone.id);
    } catch {
      // Group may have changed — ignore.
    }
  }
}
