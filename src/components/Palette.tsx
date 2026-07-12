import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent, ReactElement } from 'react';
import type { PaletteItem } from '../commands/types';
import { useTabs } from '../hooks/useTabs';
import { useSearch } from '../hooks/useSearch';
import { useKeyboardNav } from '../hooks/useKeyboardNav';
import { useSettings } from '../hooks/useSettings';
import { sendRpc } from '../services/messaging';
import { SearchInput } from './SearchInput';
import { ResultList } from './ResultList';
import { Footer } from './Footer';

interface PaletteProps {
  onClose: () => void;
}

/**
 * The palette surface: search box, ranked results, and key hints.
 *
 * It composes the data (`useTabs`), search (`useSearch`), and keyboard
 * (`useKeyboardNav`) hooks, and dispatches the chosen item's action to the
 * background worker. It owns no Chrome API access directly.
 */
export function Palette({ onClose }: PaletteProps): ReactElement {
  const [query, setQuery] = useState('');
  const snapshot = useTabs();
  const items = useSearch(query, snapshot);
  const settings = useSettings();
  const inputRef = useRef<HTMLInputElement>(null);

  const runAction = useCallback(
    (action: PaletteItem['action']) => {
      // Fire-and-forget: the background performs the effect. Close immediately
      // so the palette feels instant.
      void sendRpc({ type: 'RUN_ACTION', action }).catch((error: unknown) => {
        console.error('[Palette] action failed', error);
      });
      onClose();
    },
    [onClose],
  );

  const onSelect = useCallback(
    (index: number) => {
      const item = items[index];
      if (item) runAction(item.action);
    },
    [items, runAction],
  );

  // Shift+Enter / Shift+click: run the item's secondary action (move tab here),
  // falling back to the primary action when none is defined.
  const onSelectAlt = useCallback(
    (index: number) => {
      const item = items[index];
      if (item) runAction(item.altAction ?? item.action);
    },
    [items, runAction],
  );

  const { activeIndex, setActiveIndex, handleKeyDown } = useKeyboardNav({
    itemCount: items.length,
    keymap: settings.keymap,
    onSelect,
    onSelectAlt,
    onClose,
    resetKey: query,
  });

  // Autofocus the search box the moment the palette opens.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onBackdropMouseDown = useCallback(
    (event: MouseEvent) => {
      // Only close when the click lands on the backdrop itself, not the panel.
      if (event.target === event.currentTarget) onClose();
    },
    [onClose],
  );

  return (
    <div className="palette-backdrop" onMouseDown={onBackdropMouseDown}>
      <div className="palette-panel" role="dialog" aria-modal="true" aria-label="Palette">
        <SearchInput
          value={query}
          onChange={setQuery}
          onKeyDown={handleKeyDown}
          inputRef={inputRef}
        />
        <hr className="palette-divider" />
        <ResultList
          items={items}
          activeIndex={activeIndex}
          onSelect={onSelect}
          onSelectAlt={onSelectAlt}
          onHover={setActiveIndex}
        />
        <Footer count={items.length} keymap={settings.keymap} />
      </div>
    </div>
  );
}
