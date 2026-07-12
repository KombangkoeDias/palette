import type Fuse from 'fuse.js';
import type { CommandProvider, PaletteBadge, PaletteItem, ProviderContext } from '../types';
import type { PaletteTab } from '../../types/tab';
import { createTabFuse, searchTabs } from '../../services/search';

/**
 * The tab-switching provider — the only command in the MVP.
 *
 * It owns its Fuse index and rebuilds it only when the tab set changes
 * (identity comparison on the array reference), so repeated keystrokes reuse the
 * same index. This is what keeps search snappy at 500+ tabs.
 */
export function createTabProvider(): CommandProvider {
  let cache: { tabs: readonly PaletteTab[]; fuse: Fuse<PaletteTab> } | null = null;

  function getFuse(tabs: readonly PaletteTab[]): Fuse<PaletteTab> {
    if (cache?.tabs !== tabs) {
      cache = { tabs, fuse: createTabFuse(tabs) };
    }
    return cache.fuse;
  }

  return {
    id: 'tabs',
    getItems(query: string, context: ProviderContext): PaletteItem[] {
      const fuse = getFuse(context.tabs);
      return searchTabs(query, fuse, context.tabs, context.mru).map(({ tab, score }) =>
        toItem(tab, score),
      );
    },
  };
}

function toItem(tab: PaletteTab, score: number): PaletteItem {
  return {
    id: `tab:${String(tab.id)}`,
    title: tab.title,
    subtitle: tab.hostname || tab.url,
    favIconUrl: tab.favIconUrl,
    badges: buildBadges(tab),
    action: { type: 'ACTIVATE_TAB', tabId: tab.id, windowId: tab.windowId },
    altAction: { type: 'MOVE_TAB_TO_CURRENT_WINDOW', tabId: tab.id },
    score,
  };
}

function buildBadges(tab: PaletteTab): PaletteBadge[] {
  const badges: PaletteBadge[] = [];
  if (tab.pinned) {
    badges.push({ kind: 'pinned', label: 'Pinned', glyph: '📌' });
  }
  if (tab.muted) {
    badges.push({ kind: 'muted', label: 'Muted', glyph: '🔇' });
  } else if (tab.audible) {
    badges.push({ kind: 'audible', label: 'Playing audio', glyph: '🔊' });
  }
  return badges;
}
