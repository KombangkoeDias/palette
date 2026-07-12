import type { ReactElement, ReactNode } from 'react';
import type { Keymap } from '../types/settings';
import { formatHotkey } from '../services/settings';

interface FooterProps {
  count: number;
  keymap: Keymap;
}

export function Footer({ count, keymap }: FooterProps): ReactElement {
  return (
    <div className="palette-footer">
      <span className="palette-hint">
        <Key>{formatHotkey(keymap.navigateUp)}</Key>
        <Key>{formatHotkey(keymap.navigateDown)}</Key>
        Navigate
      </span>
      <span className="palette-hint">
        <Key>{formatHotkey(keymap.select)}</Key>
        Switch
      </span>
      <span className="palette-hint">
        <Key>{formatHotkey(keymap.selectAlt)}</Key>
        Move here
      </span>
      <span className="palette-hint">
        <Key>{formatHotkey(keymap.close)}</Key>
        Close
      </span>
      <span className="palette-hint__count">
        {count} {count === 1 ? 'tab' : 'tabs'}
      </span>
    </div>
  );
}

function Key({ children }: { children: ReactNode }): ReactElement {
  return <kbd className="palette-key">{children}</kbd>;
}
