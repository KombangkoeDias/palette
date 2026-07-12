import type {
  FrequentSite,
  GroupTabRow,
  TabClusterRef,
  TabGroupSummary,
  TabGroupsSnapshot,
} from '../types/groups';
import { colorForDomain } from './groupingService';
import { getRankedVisits, getHiddenFrequentDomains, removeFrequentSite } from './mruService';
import { activateTab, closeTabs, moveTabToWindow, queryAllTabs } from './tabsService';
import { getHostname, isNewTabUrl } from '../utils/url';

const TAB_GROUP_ID_NONE = -1;
const FREQUENT_SITE_LIMIT = 10;

function domainClusterId(domain: string): number {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = (hash * 31 + domain.charCodeAt(i)) | 0;
  }
  const id = -(Math.abs(hash) || 1);
  return id === TAB_GROUP_ID_NONE ? -2 : id;
}

function isUngroupedTab(tab: chrome.tabs.Tab): boolean {
  return tab.groupId === undefined || tab.groupId === TAB_GROUP_ID_NONE;
}

function isListableTab(tab: chrome.tabs.Tab): boolean {
  if (tab.id === undefined) return false;
  const url = tab.url ?? tab.pendingUrl ?? '';
  return !isNewTabUrl(url);
}

function tabTitle(tab: chrome.tabs.Tab): string {
  const url = tab.url ?? tab.pendingUrl ?? '';
  return tab.title?.trim() || getHostname(url) || url || 'Untitled';
}

function toGroupTabRow(tab: chrome.tabs.Tab): GroupTabRow | null {
  if (!isListableTab(tab) || tab.id === undefined) return null;
  const url = tab.url ?? tab.pendingUrl ?? '';
  return {
    id: tab.id,
    windowId: tab.windowId,
    title: tabTitle(tab),
    hostname: getHostname(url),
  };
}

function aggregateVisitsByDomain(
  visits: Array<{ url: string; count: number; lastAt: number }>,
): Map<string, { count: number; lastAt: number }> {
  const byDomain = new Map<string, { count: number; lastAt: number }>();
  for (const visit of visits) {
    const domain = getHostname(visit.url);
    if (domain === '') continue;
    const prev = byDomain.get(domain);
    if (prev === undefined) {
      byDomain.set(domain, { count: visit.count, lastAt: visit.lastAt });
    } else {
      byDomain.set(domain, {
        count: prev.count + visit.count,
        lastAt: Math.max(prev.lastAt, visit.lastAt),
      });
    }
  }
  return byDomain;
}

function bestUrlByDomain(
  visits: Array<{ url: string; count: number; lastAt: number }>,
): Map<string, string> {
  const best = new Map<string, { url: string; count: number; lastAt: number }>();
  for (const visit of visits) {
    const domain = getHostname(visit.url);
    if (domain === '') continue;
    const prev = best.get(domain);
    if (
      prev === undefined ||
      visit.count > prev.count ||
      (visit.count === prev.count && visit.lastAt > prev.lastAt)
    ) {
      best.set(domain, visit);
    }
  }
  return new Map([...best.entries()].map(([domain, stats]) => [domain, stats.url]));
}

async function listFrequentSites(
  groups: chrome.tabGroups.TabGroup[],
  tabs: chrome.tabs.Tab[],
  faviconByTabId: Map<number, string | undefined>,
): Promise<FrequentSite[]> {
  const rankedVisits = await getRankedVisits(500);
  const visitByDomain = aggregateVisitsByDomain(rankedVisits);
  const urlByDomain = bestUrlByDomain(rankedVisits);
  const hiddenDomains = await getHiddenFrequentDomains();

  const tabsByHostname = new Map<string, chrome.tabs.Tab[]>();
  for (const tab of tabs) {
    if (!isListableTab(tab)) continue;
    const hostname = getHostname(tab.url ?? tab.pendingUrl ?? '');
    if (hostname === '') continue;
    const bucket = tabsByHostname.get(hostname) ?? [];
    bucket.push(tab);
    tabsByHostname.set(hostname, bucket);
  }

  const groupIdByTitle = new Map<string, number>();
  for (const group of groups) {
    const title = group.title?.trim();
    if (title !== undefined && title !== '') groupIdByTitle.set(title, group.id);
  }

  const sites: FrequentSite[] = [];
  const rankedDomains = [...visitByDomain.entries()]
    .filter(([domain]) => !hiddenDomains.has(domain))
    .sort((a, b) => b[1].count - a[1].count || b[1].lastAt - a[1].lastAt)
    .slice(0, FREQUENT_SITE_LIMIT);

  for (const [domain, visit] of rankedDomains) {
    const openForDomain = tabsByHostname.get(domain) ?? [];
    const bestTab = [...openForDomain].sort(
      (a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0),
    )[0];

    sites.push({
      domain,
      visitCount: visit.count,
      url: urlByDomain.get(domain),
      tabId: bestTab?.id,
      windowId: bestTab?.windowId,
      groupId: groupIdByTitle.get(domain),
      favIconUrl: bestTab?.id !== undefined ? faviconByTabId.get(bestTab.id) : undefined,
    });
  }

  return sites;
}

/** Lists tab groups and frequently visited domain shortcuts for the new-tab page. */
export async function listTabGroups(
  currentWindowId: number | undefined,
): Promise<TabGroupsSnapshot> {
  const [groups, tabs, openTabs] = await Promise.all([
    chrome.tabGroups.query({}),
    chrome.tabs.query({}),
    queryAllTabs(),
  ]);

  const faviconByTabId = new Map(openTabs.map((tab) => [tab.id, tab.favIconUrl]));

  const tabsByGroup = new Map<number, chrome.tabs.Tab[]>();
  for (const tab of tabs) {
    if (!isListableTab(tab) || tab.groupId === TAB_GROUP_ID_NONE) continue;
    const bucket = tabsByGroup.get(tab.groupId) ?? [];
    bucket.push(tab);
    tabsByGroup.set(tab.groupId, bucket);
  }

  const frequentSites = await listFrequentSites(groups, tabs, faviconByTabId);

  const summaries: TabGroupSummary[] = [];
  for (const group of groups) {
    const groupTabs = tabsByGroup.get(group.id);
    if (groupTabs === undefined || groupTabs.length === 0) continue;

    summaries.push(
      buildClusterSummary({
        id: group.id,
        kind: 'group',
        title: group.title?.trim() || 'Untitled group',
        color: group.color,
        tabs: groupTabs,
        currentWindowId,
        faviconByTabId,
      }),
    );
  }

  const tabsByUngroupedDomain = new Map<string, chrome.tabs.Tab[]>();
  for (const tab of tabs) {
    if (!isListableTab(tab) || !isUngroupedTab(tab)) continue;
    const domain = getHostname(tab.url ?? tab.pendingUrl ?? '');
    if (domain === '') continue;
    const bucket = tabsByUngroupedDomain.get(domain) ?? [];
    bucket.push(tab);
    tabsByUngroupedDomain.set(domain, bucket);
  }

  for (const [domain, domainTabs] of tabsByUngroupedDomain) {
    summaries.push(
      buildClusterSummary({
        id: domainClusterId(domain),
        kind: 'domain',
        domain,
        title: domain,
        color: colorForDomain(domain),
        tabs: domainTabs,
        currentWindowId,
        faviconByTabId,
      }),
    );
  }

  summaries.sort((a, b) => {
    if (a.isInCurrentWindow !== b.isInCurrentWindow) return a.isInCurrentWindow ? -1 : 1;
    return b.lastAccessedAt - a.lastAccessedAt;
  });

  return { groups: summaries, frequentSites, currentWindowId };
}

interface BuildClusterSummaryInput {
  id: number;
  kind: TabGroupSummary['kind'];
  domain?: string | undefined;
  title: string;
  color: string;
  tabs: chrome.tabs.Tab[];
  currentWindowId: number | undefined;
  faviconByTabId: Map<number, string | undefined>;
}

function buildClusterSummary(input: BuildClusterSummaryInput): TabGroupSummary {
  const sorted = [...input.tabs].sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
  const windowId = sorted[0]?.windowId ?? chrome.windows.WINDOW_ID_CURRENT;
  const leadTabId = sorted[0]?.id;
  const lastAccessedAt = sorted[0]?.lastAccessed ?? 0;
  const rows = sorted.flatMap((tab) => {
    const row = toGroupTabRow(tab);
    return row === null ? [] : [row];
  });

  return {
    id: input.id,
    kind: input.kind,
    domain: input.domain,
    title: input.title,
    color: input.color,
    tabCount: rows.length,
    windowId,
    isInCurrentWindow:
      input.currentWindowId !== undefined &&
      input.currentWindowId !== chrome.windows.WINDOW_ID_NONE &&
      windowId === input.currentWindowId,
    tabs: rows,
    favIconUrl: leadTabId !== undefined ? input.faviconByTabId.get(leadTabId) : undefined,
    lastAccessedAt,
  };
}

/** Moves a native tab group into `targetWindowId`, preserving the group. */
export async function moveGroupToWindow(groupId: number, targetWindowId: number): Promise<void> {
  const tabs = await chrome.tabs.query({ groupId });
  if (tabs.length === 0) return;

  const moved = await chrome.tabGroups.move(groupId, {
    windowId: targetWindowId,
    index: -1,
  });
  if (moved === undefined) return;

  const movedTabs = await chrome.tabs.query({ groupId: moved.id });
  const tab = [...movedTabs].sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
  if (tab?.id !== undefined) {
    await activateTab(tab.id, targetWindowId);
  }
}

/** Moves ungrouped tabs for `domain` into `targetWindowId`. */
export async function moveDomainToWindow(domain: string, targetWindowId: number): Promise<void> {
  const tabs = await chrome.tabs.query({});
  const matching = tabs.filter((tab) => {
    if (tab.id === undefined || !isUngroupedTab(tab)) return false;
    return getHostname(tab.url ?? tab.pendingUrl ?? '') === domain;
  });
  if (matching.length === 0) return;

  for (const tab of matching) {
    if (tab.id !== undefined && tab.windowId !== targetWindowId) {
      await moveTabToWindow(tab.id, targetWindowId);
    }
  }

  const tab = [...matching].sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
  if (tab?.id !== undefined) {
    await activateTab(tab.id, targetWindowId);
  }
}

/** Moves a tab group or ungrouped domain cluster into `targetWindowId`. */
export async function moveClusterToWindow(
  cluster: TabClusterRef,
  targetWindowId: number,
): Promise<void> {
  if (cluster.kind === 'group') {
    await moveGroupToWindow(cluster.groupId, targetWindowId);
    return;
  }
  await moveDomainToWindow(cluster.domain, targetWindowId);
}

/** Opens or focuses a frequently visited domain from the new-tab page. */
export async function openFrequentSite(site: FrequentSite): Promise<void> {
  if (site.tabId !== undefined) {
    const windowId = site.windowId ?? (await chrome.tabs.get(site.tabId)).windowId;
    await activateTab(site.tabId, windowId);
    return;
  }

  if (site.groupId !== undefined) {
    await focusGroup(site.groupId);
    return;
  }

  const url = site.url ?? `https://${site.domain}`;
  await chrome.tabs.create({ url });
}

/** Focuses ungrouped tabs for `domain` by activating the most recent match. */
export async function focusDomain(domain: string): Promise<void> {
  const tabs = await chrome.tabs.query({});
  const matching = tabs.filter((tab) => {
    if (tab.id === undefined || !isUngroupedTab(tab)) return false;
    return getHostname(tab.url ?? tab.pendingUrl ?? '') === domain;
  });
  const tab = [...matching].sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
  if (tab?.id === undefined) return;
  await activateTab(tab.id, tab.windowId);
}

/** Focuses a tab group or ungrouped domain cluster. */
export async function focusCluster(cluster: TabClusterRef): Promise<void> {
  if (cluster.kind === 'group') {
    await focusGroup(cluster.groupId);
    return;
  }
  await focusDomain(cluster.domain);
}

/** Removes a domain from the frequent-sites list. */
export async function dismissFrequentSite(domain: string): Promise<void> {
  await removeFrequentSite(domain);
}

/** Closes a single tab, skipping the sender tab when provided. */
export async function closeTab(tabId: number, excludeTabId?: number): Promise<void> {
  await closeTabs([tabId], excludeTabId);
}

/** Closes every tab in a group or ungrouped domain cluster. */
export async function closeCluster(cluster: TabClusterRef, excludeTabId?: number): Promise<void> {
  const tabIds = await listClusterTabIds(cluster);
  await closeTabs(tabIds, excludeTabId);
}

async function listClusterTabIds(cluster: TabClusterRef): Promise<number[]> {
  if (cluster.kind === 'group') {
    const tabs = await chrome.tabs.query({ groupId: cluster.groupId });
    return tabs.flatMap((tab) => (isListableTab(tab) && tab.id !== undefined ? [tab.id] : []));
  }

  const tabs = await chrome.tabs.query({});
  return tabs.flatMap((tab) => {
    if (!isListableTab(tab) || !isUngroupedTab(tab) || tab.id === undefined) return [];
    const domain = getHostname(tab.url ?? tab.pendingUrl ?? '');
    return domain === cluster.domain ? [tab.id] : [];
  });
}

/** Focuses the window that contains `groupId` and activates its most recent tab. */
export async function focusGroup(groupId: number): Promise<void> {
  const tabs = await chrome.tabs.query({ groupId });
  if (tabs.length === 0) return;

  const tab = [...tabs].sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
  if (tab?.id === undefined) return;
  await activateTab(tab.id, tab.windowId);
}
