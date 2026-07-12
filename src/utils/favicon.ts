import { isLocalHost } from './url';

/** Fallback favicon when Chrome does not expose `tab.favIconUrl`. */
export function fallbackFaviconUrl(hostname: string): string | undefined {
  const host = hostname.trim();
  if (host === '' || isLocalHost(host)) return undefined;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
}

/** Best favicon URL to show in the UI for a tab or palette row. */
export function displayFaviconUrl(
  favIconUrl: string | undefined,
  hostname: string,
): string | undefined {
  if (favIconUrl !== undefined && favIconUrl !== '') return favIconUrl;
  return fallbackFaviconUrl(hostname);
}
