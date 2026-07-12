import type { CommandProvider, PaletteItem, ProviderContext } from './types';
import { createTabProvider } from './providers/tabProvider';

/**
 * The command registry aggregates every {@link CommandProvider}.
 *
 * Adding a future command (bookmarks, history, "close tab", AI, ...) is a
 * one-line change here plus a new provider file — the UI, hooks, and messaging
 * layers stay untouched.
 */
const providers: readonly CommandProvider[] = [createTabProvider()];

/**
 * Runs the query through every provider and returns a single, globally ranked
 * list. Providers return their own results best-first; we then merge by score
 * so results from multiple sources interleave sensibly.
 */
export async function searchCommands(
  query: string,
  context: ProviderContext,
): Promise<PaletteItem[]> {
  const grouped = await Promise.all(
    // Wrap in Promise.resolve so sync and async providers compose uniformly.
    providers.map((provider) => Promise.resolve(provider.getItems(query, context))),
  );
  const items = grouped.flat();

  // Stable sort by score; items without a score sink to the bottom.
  items.sort(
    (a, b) => (a.score ?? Number.POSITIVE_INFINITY) - (b.score ?? Number.POSITIVE_INFINITY),
  );

  return items;
}
