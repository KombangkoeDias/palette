import { WALLPAPER_CATALOG } from './wallpaperCatalog';

/** Scenic background for the new-tab page (Unsplash — Brave wallpapers are not accessible to extensions). */
export interface Wallpaper {
  url: string;
  credit: string;
  creditUrl: string;
}

const UNSPLASH = 'auto=format&fit=crop&w=2400&q=85';

function toWallpaper(entry: (typeof WALLPAPER_CATALOG)[number]): Wallpaper {
  return {
    url: `https://images.unsplash.com/${entry.slug}?${UNSPLASH}`,
    credit: entry.credit,
    creditUrl: entry.creditUrl,
  };
}

/** Picks a random scenic photo each time a new tab opens. */
export function wallpaperForNewTab(): Wallpaper {
  const index = Math.floor(Math.random() * WALLPAPER_CATALOG.length);
  const entry = WALLPAPER_CATALOG[index] ?? WALLPAPER_CATALOG[0]!;
  return toWallpaper(entry);
}

export function greetingForHour(hour: number): string {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
