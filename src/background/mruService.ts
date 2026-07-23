import { getHostname } from '../utils/url';

/**
 * Persists the Most-Recently-Used (MRU) tab history and per-URL visit counts in
 * `chrome.storage.local`.
 *
 * History is keyed by URL rather than tab id because tab ids are not stable
 * across browser restarts, whereas a URL identifies the same destination over
 * time.
 */

const MRU_KEY = 'palette:mru';
const VISITS_KEY = 'palette:visits';
const HIDDEN_FREQUENT_KEY = 'palette:hidden-frequent';
const MAX_MRU_ENTRIES = 200;
const MAX_VISIT_URLS = 500;

interface VisitStats {
  count: number;
  lastAt: number;
}

/** URLs we track for frequency (normal web pages only). */
export function isTrackableUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

/** Reads the ordered MRU URL list. Returns an empty list when unset/corrupt. */
export async function getMru(): Promise<string[]> {
  const stored = await chrome.storage.local.get(MRU_KEY);
  const value = stored[MRU_KEY];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

async function readVisits(): Promise<Record<string, VisitStats>> {
  const stored = await chrome.storage.local.get(VISITS_KEY);
  const value = stored[VISITS_KEY];
  if (typeof value !== 'object' || value === null) return {};
  const result: Record<string, VisitStats> = {};
  for (const [url, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const record = raw as Record<string, unknown>;
    const count = typeof record.count === 'number' ? record.count : 0;
    const lastAt = typeof record.lastAt === 'number' ? record.lastAt : 0;
    if (count > 0) result[url] = { count, lastAt };
  }
  return result;
}

async function writeVisits(visits: Record<string, VisitStats>): Promise<void> {
  const entries = Object.entries(visits).sort(
    (a, b) => b[1].count - a[1].count || b[1].lastAt - a[1].lastAt,
  );
  const trimmed = Object.fromEntries(entries.slice(0, MAX_VISIT_URLS));
  await chrome.storage.local.set({ [VISITS_KEY]: trimmed });
}

/**
 * Records a URL visit: bumps MRU order and increments the per-URL visit counter.
 */
export async function recordUrl(url: string): Promise<void> {
  if (!isTrackableUrl(url)) return;

  const current = await getMru();
  const next = [url, ...current.filter((entry) => entry !== url)].slice(0, MAX_MRU_ENTRIES);
  await chrome.storage.local.set({ [MRU_KEY]: next });

  const visits = await readVisits();
  const prev = visits[url];
  visits[url] = { count: (prev?.count ?? 0) + 1, lastAt: Date.now() };
  await writeVisits(visits);
}

/**
 * Inserts a URL directly after the current MRU head — used when a tab loaded in
 * the background after the user had already moved on to a newer tab.
 */
export async function recordUrlAfterHead(url: string): Promise<void> {
  if (!isTrackableUrl(url)) return;

  const current = await getMru();
  const without = current.filter((entry) => entry !== url);
  const next =
    without.length === 0
      ? [url]
      : [without[0], url, ...without.slice(1)].slice(0, MAX_MRU_ENTRIES);
  await chrome.storage.local.set({ [MRU_KEY]: next });

  const visits = await readVisits();
  const prev = visits[url];
  visits[url] = { count: (prev?.count ?? 0) + 1, lastAt: Date.now() };
  await writeVisits(visits);
}

/** URLs ranked by visit count, then recency. */
export async function getRankedVisits(
  limit: number,
): Promise<Array<{ url: string; count: number; lastAt: number }>> {
  const visits = await readVisits();
  return Object.entries(visits)
    .map(([url, stats]) => ({ url, count: stats.count, lastAt: stats.lastAt }))
    .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
    .slice(0, limit);
}

/** Domains the user removed from the frequent-sites list. */
export async function getHiddenFrequentDomains(): Promise<Set<string>> {
  const stored = await chrome.storage.local.get(HIDDEN_FREQUENT_KEY);
  const value = stored[HIDDEN_FREQUENT_KEY];
  if (!Array.isArray(value)) return new Set();
  return new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry !== ''));
}

/** Removes a domain from frequent sites and clears its visit history. */
export async function removeFrequentSite(domain: string): Promise<void> {
  const host = domain.trim();
  if (host === '') return;

  const hidden = await getHiddenFrequentDomains();
  hidden.add(host);
  await chrome.storage.local.set({ [HIDDEN_FREQUENT_KEY]: [...hidden] });

  const visits = await readVisits();
  let visitsChanged = false;
  for (const url of Object.keys(visits)) {
    if (getHostname(url) === host) {
      delete visits[url];
      visitsChanged = true;
    }
  }
  if (visitsChanged) await writeVisits(visits);

  const mru = await getMru();
  const nextMru = mru.filter((url) => getHostname(url) !== host);
  if (nextMru.length !== mru.length) {
    await chrome.storage.local.set({ [MRU_KEY]: nextMru });
  }
}
