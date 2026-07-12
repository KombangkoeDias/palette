import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createShadowMount } from '../utils/dom';
// Imported as a raw string and injected into the Shadow DOM (see dom.ts).
import paletteCss from '../styles/palette.css?inline';

const { container } = createShadowMount(paletteCss);

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
