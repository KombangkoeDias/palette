import { PALETTE_HOST_ID, PALETTE_OPEN_ATTR } from './constants';

/**
 * Blocks page-level keyboard shortcuts (YouTube's `f` for fullscreen, etc.) while
 * the palette is open.
 *
 * Runs at `document_start` so our capture listener is registered before most
 * page scripts. Palette navigation (Esc, arrows, Enter) is handled earlier, on
 * `window` capture in {@link Palette}, because `stopImmediatePropagation()` here
 * halts the event before it reaches the search input's listeners — typing still
 * works via the browser default action, but React handlers would not run.
 */

const SHIELDED_EVENTS = ['keydown', 'keyup'] as const;

function isPaletteOpen(): boolean {
  return document.documentElement.hasAttribute(PALETTE_OPEN_ATTR);
}

function isPaletteEvent(event: Event): boolean {
  const host = document.getElementById(PALETTE_HOST_ID);
  if (host === null) return false;
  return event.composedPath().includes(host);
}

function shieldCapture(event: Event): void {
  if (!isPaletteOpen() || !isPaletteEvent(event)) return;
  event.stopImmediatePropagation();
}

function shieldBubble(event: Event): void {
  if (!isPaletteOpen() || !isPaletteEvent(event)) return;
  event.stopPropagation();
}

for (const type of SHIELDED_EVENTS) {
  document.addEventListener(type, shieldCapture, { capture: true });
  document.addEventListener(type, shieldBubble);
}
