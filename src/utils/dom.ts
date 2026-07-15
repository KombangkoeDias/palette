/**
 * Creates an isolated mount point for the palette UI.
 *
 * The overlay lives inside a Shadow DOM so the host page's CSS can never bleed
 * in (and ours never leaks out). The host element itself sits in the light DOM,
 * so we reset it inline to block inherited typography from each site. The host
 * spans the viewport but is click-through (`pointer-events: none`); only the
 * rendered backdrop and panel re-enable pointer events.
 */

import { PALETTE_HOST_ID } from '../content/constants';

export interface PaletteMount {
  shadowRoot: ShadowRoot;
  /** The element React renders into. */
  container: HTMLElement;
}

export function createShadowMount(css: string): PaletteMount {
  // Clean up a prior mount, e.g. after a dev hot-reload of the content script.
  document.getElementById(PALETTE_HOST_ID)?.remove();

  const host = document.createElement('div');
  host.id = PALETTE_HOST_ID;
  isolateHostFromPage(host);

  const shadowRoot = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = css;
  shadowRoot.appendChild(style);

  const container = document.createElement('div');
  container.className = 'palette-mount';
  shadowRoot.appendChild(container);

  document.documentElement.appendChild(host);

  return { shadowRoot, container };
}

const FONT_STACK =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * The shadow host is a light-DOM node, so page CSS can still target it. Inline
 * `!important` resets keep inherited typography from leaking into the HUD and
 * palette, which would otherwise pick up each site's font and color rules.
 */
function isolateHostFromPage(host: HTMLElement): void {
  host.style.setProperty('all', 'initial', 'important');
  host.style.setProperty('position', 'fixed', 'important');
  host.style.setProperty('inset', '0', 'important');
  host.style.setProperty('z-index', '2147483647', 'important');
  host.style.setProperty('pointer-events', 'none', 'important');
  host.style.setProperty('font-family', FONT_STACK, 'important');
  host.style.setProperty('font-size', '16px', 'important');
  host.style.setProperty('line-height', '1.4', 'important');
  host.style.setProperty('color', '#e6e6ef', 'important');
}
