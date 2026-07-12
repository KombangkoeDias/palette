import { getSettings } from '../services/settings';
import { getHostname } from '../utils/url';

/**
 * Domain-based tab grouping: when a tab navigates to a URL whose domain
 * already has open tabs elsewhere, move it into that domain's window and
 * place all matching tabs in a native Chrome tab group (labeled + colored).
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

/**
 * Picks the window that should own this domain: most same-domain tabs wins;
 * ties go to a window that already has a group for the domain.
 *
 * Call with *existing* peers only — the navigating tab is always moved into the
 * window that already hosts the domain, not the other way around.
 */
function pickTargetWindow(peers: readonly chrome.tabs.Tab[]): number {
  if (peers.length === 0) {
    return chrome.windows.WINDOW_ID_CURRENT;
  }

  const byWindow = new Map<number, chrome.tabs.Tab[]>();
  for (const tab of peers) {
    const list = byWindow.get(tab.windowId) ?? [];
    list.push(tab);
    byWindow.set(tab.windowId, list);
  }

  let bestWindowId = peers[0]?.windowId ?? chrome.windows.WINDOW_ID_CURRENT;
  let bestScore = -1;

  for (const [windowId, windowTabs] of byWindow) {
    let score = windowTabs.length;
    const hasGroup = windowTabs.some((t) => t.groupId !== TAB_GROUP_ID_NONE);
    if (hasGroup) score += 100;
    if (score > bestScore) {
      bestScore = score;
      bestWindowId = windowId;
    }
  }

  return bestWindowId;
}

async function isAlreadyGrouped(
  tab: chrome.tabs.Tab,
  domain: string,
  targetWindowId: number,
): Promise<boolean> {
  if (tab.windowId !== targetWindowId) return false;
  if (tab.groupId === TAB_GROUP_ID_NONE) return false;
  try {
    const group = await chrome.tabGroups.get(tab.groupId);
    if (group.title !== domain) return false;
    const sameDomain = await findSameDomainTabsInWindow(domain, targetWindowId);
    if (sameDomain.length < 2) return false;
    return sameDomain.every((t) => t.groupId === tab.groupId);
  } catch {
    return false;
  }
}

async function ensureDomainGroup(domain: string, tabIds: number[]): Promise<void> {
  if (tabIds.length < 2) return;

  const [first, ...rest] = tabIds;
  if (first === undefined) return;
  const idsTuple: [number, ...number[]] = [first, ...rest];

  const tabs = await Promise.all(idsTuple.map((id) => chrome.tabs.get(id)));
  let existingGroupId: number | undefined;
  for (const t of tabs) {
    if (t.groupId !== TAB_GROUP_ID_NONE) {
      existingGroupId = t.groupId;
      break;
    }
  }

  const groupOptions: chrome.tabs.GroupOptions = { tabIds: idsTuple };
  if (existingGroupId !== undefined) groupOptions.groupId = existingGroupId;

  const groupId = await chrome.tabs.group(groupOptions);

  await chrome.tabGroups.update(groupId, {
    title: domain,
    color: colorForDomain(domain),
  });
}

function isTab(value: unknown): value is chrome.tabs.Tab {
  return typeof value === 'object' && value !== null && 'id' in value;
}

/**
 * On navigation: if this tab's domain matches other open tabs, consolidate into
 * one window and ensure a native Chrome tab group.
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
    if (peers.length === 0) return;

    const targetWindowId = pickTargetWindow(peers);

    if (await isAlreadyGrouped(tab, domain, targetWindowId)) return;

    const wasActive = tab.active;
    let currentTab = tab;

    if (tab.windowId !== targetWindowId && tab.id !== undefined) {
      const movedUnknown: unknown = await chrome.tabs.move(tab.id, {
        windowId: targetWindowId,
        index: -1,
      });
      if (Array.isArray(movedUnknown)) {
        const first: unknown = movedUnknown[0];
        if (isTab(first)) currentTab = first;
      } else if (isTab(movedUnknown)) {
        currentTab = movedUnknown;
      }
    }

    const sameDomainInTarget = await findSameDomainTabsInWindow(domain, targetWindowId);
    const tabIds = sameDomainInTarget
      .map((t) => t.id)
      .filter((id): id is number => id !== undefined);

    if (currentTab.id !== undefined && !tabIds.includes(currentTab.id)) {
      tabIds.push(currentTab.id);
    }

    if (tabIds.length < 2) return;

    await ensureDomainGroup(domain, tabIds);

    if (wasActive && currentTab.id !== undefined) {
      await chrome.tabs.update(currentTab.id, { active: true });
      try {
        await chrome.windows.update(targetWindowId, { focused: true });
      } catch {
        // Window closed in a race — ignore.
      }
    }
  } catch (error: unknown) {
    console.error('[Palette] domain grouping failed', error);
  } finally {
    inFlight.delete(tabId);
  }
}

/** Ungroups any native tab group that was left with a single tab. */
export async function cleanupSingletonGroups(): Promise<void> {
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
    if (lone?.id !== undefined) {
      try {
        await chrome.tabs.ungroup(lone.id);
      } catch {
        // Group may have changed — ignore.
      }
    }
  }
}
