import Fuse, { type IFuseOptions } from 'fuse.js';
import type { PaletteTab } from '../types/tab';

/**
 * Fuzzy search + intelligent ranking over open tabs.
 *
 * Building the Fuse index is the expensive part, so it is created once per tab
 * set (see the caching in the tab provider) and reused across keystrokes.
 *
 * Ranking priority (best first): exact match > prefix match > fuzzy match, with
 * a recency nudge from the MRU list to break ties toward familiar tabs.
 */

export interface ScoredTab {
  tab: PaletteTab;
  /** Lower is better. */
  score: number;
}

const FUSE_OPTIONS: IFuseOptions<PaletteTab> = {
  includeScore: true,
  // Match anywhere in the field, not just near the start — better for URLs.
  ignoreLocation: true,
  threshold: 0.45,
  minMatchCharLength: 1,
  keys: [
    { name: 'title', weight: 0.55 },
    { name: 'hostname', weight: 0.25 },
    { name: 'groupTitle', weight: 0.15 },
    { name: 'url', weight: 0.05 },
  ],
};

// Tunable ranking bonuses (subtracted from the Fuse score; lower = better).
const EXACT_BONUS = 1;
const PREFIX_BONUS = 0.5;
const SUBSTRING_BONUS = 0.2;
const MAX_RECENCY_BONUS = 0.15;

export function createTabFuse(tabs: readonly PaletteTab[]): Fuse<PaletteTab> {
  return new Fuse([...tabs], FUSE_OPTIONS);
}

/**
 * Returns tabs ranked for the given query.
 *
 * An empty query returns all tabs ordered by real recency — Chrome's own
 * `lastAccessed` timestamp, most recent first — which powers the default
 * "recent tabs" view.
 */
export function searchTabs(
  query: string,
  fuse: Fuse<PaletteTab>,
  tabs: readonly PaletteTab[],
  mru: readonly string[],
): ScoredTab[] {
  const trimmed = query.trim();
  if (trimmed === '') return orderByRecency(tabs, mru);

  const q = trimmed.toLowerCase();
  const mruRank = buildMruRank(mru);

  const scored = fuse.search(trimmed).map<ScoredTab>(({ item, score }) => ({
    tab: item,
    score: adjustScore(score ?? 1, q, item, mruRank, mru.length),
  }));

  scored.sort((a, b) => a.score - b.score);
  return scored;
}

function adjustScore(
  fuseScore: number,
  query: string,
  tab: PaletteTab,
  mruRank: Map<string, number>,
  mruLength: number,
): number {
  let score = fuseScore;

  const title = tab.title.toLowerCase();
  const host = tab.hostname.toLowerCase();
  const url = tab.url.toLowerCase();

  if (title === query || host === query) {
    score -= EXACT_BONUS;
  } else if (title.startsWith(query) || host.startsWith(query) || url.startsWith(query)) {
    score -= PREFIX_BONUS;
  } else if (title.includes(query) || host.includes(query)) {
    score -= SUBSTRING_BONUS;
  }

  // Recency nudge: more recent tabs get a slightly larger bonus.
  const rank = mruRank.get(tab.url);
  if (rank !== undefined && mruLength > 0) {
    score -= MAX_RECENCY_BONUS * (1 - rank / mruLength);
  }

  return score;
}

function orderByRecency(tabs: readonly PaletteTab[], mru: readonly string[]): ScoredTab[] {
  const mruRank = buildMruRank(mru);
  // Sort by Chrome's lastAccessed (most recent first); fall back to the palette
  // MRU and then natural order for tabs that share a timestamp.
  const ordered = [...tabs].sort((a, b) => {
    if (b.lastAccessed !== a.lastAccessed) return b.lastAccessed - a.lastAccessed;
    const ra = mruRank.get(a.url) ?? Number.POSITIVE_INFINITY;
    const rb = mruRank.get(b.url) ?? Number.POSITIVE_INFINITY;
    return ra - rb;
  });
  // Score by final position so the global registry sort preserves this order.
  return ordered.map<ScoredTab>((tab, index) => ({ tab, score: index }));
}

function buildMruRank(mru: readonly string[]): Map<string, number> {
  const rank = new Map<string, number>();
  mru.forEach((url, index) => {
    if (!rank.has(url)) rank.set(url, index);
  });
  return rank;
}
