import { useEffect, useMemo, useState } from 'react';
import type { PaletteItem, ProviderContext } from '../commands/types';
import type { PaletteSnapshot } from '../types/messages';
import { searchCommands } from '../commands/registry';

/**
 * Runs a query through the command registry and returns ranked items.
 *
 * The provider context is memoized on the snapshot so the underlying Fuse index
 * (cached inside the tab provider) is only rebuilt when tabs actually change,
 * not on every keystroke. Searches are guarded against out-of-order resolution.
 */
export function useSearch(query: string, snapshot: PaletteSnapshot): PaletteItem[] {
  const [items, setItems] = useState<PaletteItem[]>([]);

  const context = useMemo<ProviderContext>(() => {
    // Hide the palette's own tab — switching to the tab you're already on is a
    // no-op and just clutters the list.
    const tabs =
      snapshot.currentTabId === undefined
        ? snapshot.tabs
        : snapshot.tabs.filter((tab) => tab.id !== snapshot.currentTabId);
    return { tabs, mru: snapshot.mru };
  }, [snapshot]);

  useEffect(() => {
    let active = true;

    searchCommands(query, context)
      .then((result) => {
        if (active) setItems(result);
      })
      .catch((error: unknown) => {
        console.error('[Palette] search failed', error);
        if (active) setItems([]);
      });

    return () => {
      active = false;
    };
  }, [query, context]);

  return items;
}
