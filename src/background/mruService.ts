/**
 * Persists the Most-Recently-Used (MRU) tab history in `chrome.storage.local`.
 *
 * History is keyed by URL rather than tab id because tab ids are not stable
 * across browser restarts, whereas a URL identifies the same destination over
 * time. The list is ordered most-recent-first and capped to keep storage small.
 */

const STORAGE_KEY = 'palette:mru';
const MAX_ENTRIES = 200;

/** Reads the ordered MRU URL list. Returns an empty list when unset/corrupt. */
export async function getMru(): Promise<string[]> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY];
  if (!Array.isArray(value)) return [];
  // Defensive: storage is untyped, so filter to strings only.
  return value.filter((entry): entry is string => typeof entry === 'string');
}

/**
 * Records a URL as most-recently-used: moves it to the front, removing any
 * earlier occurrence, then trims to {@link MAX_ENTRIES}.
 */
export async function recordUrl(url: string): Promise<void> {
  if (!url) return;
  const current = await getMru();
  const next = [url, ...current.filter((entry) => entry !== url)].slice(0, MAX_ENTRIES);
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
}
