import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createShadowMount } from '../utils/dom';
import paletteCss from '../styles/palette.css?inline';

/** Mounts the palette overlay (shadow root + content-script App). */
export function mountPalette(): void {
  const { container } = createShadowMount(paletteCss);
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
