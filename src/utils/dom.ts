/**
 * Creates an isolated mount point for the palette UI.
 *
 * The overlay lives inside a Shadow DOM so the host page's CSS can never bleed
 * in (and ours never leaks out). The host element spans the viewport but is
 * click-through (`pointer-events: none`); only the rendered backdrop and panel
 * re-enable pointer events, so the page stays fully usable while Palette is
 * mounted-but-idle.
 */

const HOST_ID = 'palette-root';

export interface PaletteMount {
  shadowRoot: ShadowRoot;
  /** The element React renders into. */
  container: HTMLElement;
}

export function createShadowMount(css: string): PaletteMount {
  // Clean up a prior mount, e.g. after a dev hot-reload of the content script.
  document.getElementById(HOST_ID)?.remove();

  const host = document.createElement('div');
  host.id = HOST_ID;
  Object.assign(host.style, {
    position: 'fixed',
    inset: '0',
    // Max 32-bit z-index to sit above virtually any page chrome.
    zIndex: '2147483647',
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);

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
