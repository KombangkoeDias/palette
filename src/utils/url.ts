/**
 * Extracts a clean hostname from a URL string.
 *
 * Returns an empty string for URLs without a meaningful host (e.g.
 * `chrome://`, `about:`, `file:`, or malformed input) so callers can render a
 * sensible fallback. A leading `www.` is stripped for nicer display.
 */
export function getHostname(url: string): string {
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** True when the tab URL is a browser or extension new-tab page. */
export function isNewTabUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed === '' || trimmed === 'about:blank' || trimmed === 'about:newtab') {
    return true;
  }

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
    if (protocol === 'chrome-extension:' && pathname.includes('/newtab')) {
      return true;
    }
  } catch {
    // malformed URL
  }

  return false;
}

/**
 * True when a hostname points at the local machine or a private network
 * (loopback, LAN, link-local, or a local mDNS/`.local` name).
 *
 * Used to avoid loading favicons from such addresses: an `<img>` request from a
 * public page to a local host trips Chrome's Local Network Access permission
 * prompt ("Access other apps and services on this device").
 */
export function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h === '0.0.0.0' || h === '::1') return true;
  if (h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h.startsWith('127.')) return true; // loopback
  if (h.startsWith('10.')) return true; // private
  if (h.startsWith('192.168.')) return true; // private
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true; // private
  if (h.startsWith('169.254.')) return true; // link-local
  if (h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true; // IPv6 local
  return false;
}
