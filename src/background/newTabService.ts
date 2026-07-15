/** Prevents concurrent dedupe passes from fighting each other. */
const dedupeInFlight = new Set<number>();

/**
 * When a second new-tab page is opened in the same window, close the older
 * one(s) and keep the new tab. Each window may have its own new-tab page.
 */
export function registerNewTabDeduper(): void {
  chrome.tabs.onCreated.addListener((tab) => {
    if (tab.id !== undefined) void maybeReplaceExistingNewTabs(tab.id);
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url !== undefined) void maybeReplaceExistingNewTabs(tabId);
  });

  void collapseDuplicateNewTabs();
}

async function maybeReplaceExistingNewTabs(tabId: number): Promise<void> {
  if (dedupeInFlight.has(tabId)) return;

  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return;
  }

  if (!isEligibleForNewTabDedupe(tab)) return;

  const peers = await findOtherNewTabs(tabId, tab.windowId, tab.incognito);
  if (peers.length === 0) return;

  dedupeInFlight.add(tabId);
  for (const peer of peers) {
    if (peer.id !== undefined) dedupeInFlight.add(peer.id);
  }

  try {
    for (const peer of peers) {
      if (peer.id === undefined) continue;
      try {
        await chrome.tabs.remove(peer.id);
      } catch {
        // Already closed — ignore.
      }
    }
    await chrome.tabs.update(tabId, { active: true });
  } catch {
    // Tab changed mid-flight — ignore.
  } finally {
    dedupeInFlight.delete(tabId);
    for (const peer of peers) {
      if (peer.id !== undefined) dedupeInFlight.delete(peer.id);
    }
  }
}

/** Closes extra new-tab pages on startup, keeping one per window. */
async function collapseDuplicateNewTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  const byWindow = new Map<string, chrome.tabs.Tab[]>();

  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    if (!isEligibleForNewTabDedupe(tab)) continue;
    const key = windowKey(tab.windowId, tab.incognito);
    const bucket = byWindow.get(key) ?? [];
    bucket.push(tab);
    byWindow.set(key, bucket);
  }

  for (const group of byWindow.values()) {
    if (group.length <= 1) continue;
    const keep = pickMostRecentTab(group);
    if (keep?.id === undefined) continue;
    for (const tab of group) {
      if (tab.id === undefined || tab.id === keep.id) continue;
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        // Already closed — ignore.
      }
    }
  }
}

async function findOtherNewTabs(
  tabId: number,
  windowId: number,
  incognito: boolean,
): Promise<chrome.tabs.Tab[]> {
  const tabs = await chrome.tabs.query({ windowId });
  return tabs.filter((tab) => {
    if (tab.id === undefined || tab.id === tabId) return false;
    if (tab.incognito !== incognito) return false;
    return isEligibleForNewTabDedupe(tab);
  });
}

function windowKey(windowId: number, incognito: boolean): string {
  return `${incognito ? 'private' : 'normal'}:${String(windowId)}`;
}

/**
 * Only dedupe tabs that are genuinely on a new-tab page — not transient
 * `about:blank` / empty URLs from `tabs.create({ url: 'https://…' })`.
 */
function isEligibleForNewTabDedupe(tab: chrome.tabs.Tab): boolean {
  const url = tab.url ?? '';
  const pending = tab.pendingUrl ?? '';

  if (isHttpUrl(url) || isHttpUrl(pending)) return false;

  return isDedicatedNewTabPageUrl(url);
}

function isDedicatedNewTabPageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed === 'about:newtab') return true;

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('chrome://newtab')
    || lower.startsWith('edge://newtab')
    || lower.startsWith('chrome-search://local')
  ) {
    return true;
  }

  try {
    const { protocol, pathname } = new URL(trimmed);
    if (protocol === 'chrome-extension:' && pathname.includes('/newtab')) return true;
  } catch {
    // malformed URL
  }

  return false;
}

function isHttpUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

function pickMostRecentTab(tabs: readonly chrome.tabs.Tab[]): chrome.tabs.Tab | undefined {
  if (tabs.length === 0) return undefined;
  return tabs.reduce((best, tab) =>
    (tab.lastAccessed ?? 0) > (best.lastAccessed ?? 0) ? tab : best,
  );
}
