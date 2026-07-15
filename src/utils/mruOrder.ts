/**
 * Shared MRU ordering for any list of items keyed by URL.
 *
 * The persisted MRU list is the source of truth for "genuine" recency — it only
 * moves when the user actually lands on a tab, not while previewing tabs in the
 * HUD walk. Chrome's `lastAccessed` is used only to break ties (duplicate URLs,
 * tabs missing from MRU).
 */

export interface MruSortable {
  url: string;
  lastAccessed: number;
}

/** Maps each URL to its MRU index (0 = most recent). First occurrence wins. */
export function buildMruRank(mru: readonly string[]): Map<string, number> {
  const rank = new Map<string, number>();
  mru.forEach((url, index) => {
    if (!rank.has(url)) rank.set(url, index);
  });
  return rank;
}

/** Lower = more recent in MRU order; unknown URLs sort after known ones. */
export function compareMruRecency(
  a: MruSortable,
  b: MruSortable,
  mruRank: Map<string, number>,
): number {
  const ra = mruRank.get(a.url) ?? Number.POSITIVE_INFINITY;
  const rb = mruRank.get(b.url) ?? Number.POSITIVE_INFINITY;
  if (ra !== rb) return ra - rb;
  return b.lastAccessed - a.lastAccessed;
}

/** Returns a new array sorted by MRU recency (most recent first). */
export function sortByMruRecency<T extends MruSortable>(
  items: readonly T[],
  mru: readonly string[],
): T[] {
  const mruRank = buildMruRank(mru);
  return [...items].sort((a, b) => compareMruRecency(a, b, mruRank));
}
