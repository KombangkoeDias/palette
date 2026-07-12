import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { mountPalette } from '../content/mountPalette';
import { NewTab } from './NewTab';
import './newtab.css';

mountPalette();

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <NewTab />
    </StrictMode>,
  );
}
