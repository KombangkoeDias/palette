import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

import type { PaletteScope } from '../types/settings';

interface PaletteProps {
  scope: PaletteScope;
  filterGroupId?: number | undefined;
  onClose: () => void;
}

/**
 * The palette surface: search box, ranked results, and key hints.
 *
 * It composes the data (`useTabs`), search (`useSearch`), and keyboard
 * (`useKeyboardNav`) hooks, and dispatches the chosen item's action to the
 * background worker. It owns no Chrome API access directly.
 */
export function Palette({ scope, filterGroupId, onClose }: PaletteProps): ReactElement {
  const [query, setQuery] = useState('');
  const snapshot = useTabs();
  const items = useSearch(query, snapshot, { scope, filterGroupId });
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

  const handleKeyDownRef = useRef(handleKeyDown);
  handleKeyDownRef.current = handleKeyDown;

  // Window capture runs before the page-shortcut shield on document capture.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      handleKeyDownRef.current(event);
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, []);

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

  const resolvedGroupId = useMemo(() => {
    if (filterGroupId !== undefined) return filterGroupId;
    if (snapshot.currentTabId === undefined) return undefined;
    return snapshot.tabs.find((tab) => tab.id === snapshot.currentTabId)?.groupId;
  }, [filterGroupId, snapshot.currentTabId, snapshot.tabs]);

  const groupLabel = useMemo(() => {
    if (scope !== 'group' || resolvedGroupId === undefined) return undefined;
    const match = snapshot.tabs.find((tab) => tab.groupId === resolvedGroupId);
    const title = match?.groupTitle?.trim();
    if (title !== undefined && title !== '') return title;
    return match?.hostname ?? 'current group';
  }, [scope, resolvedGroupId, snapshot.tabs]);

  const placeholder =
    scope === 'group' && groupLabel !== undefined
      ? `Search in ${groupLabel}…`
      : 'Search tabs…';

  return (
    <div className="palette-backdrop" onMouseDown={onBackdropMouseDown}>
      <div className="palette-panel" role="dialog" aria-modal="true" aria-label="Palette">
        {scope === 'group' && groupLabel !== undefined ? (
          <div className="palette-scope" aria-label={`Scoped to tab group ${groupLabel}`}>
            <span className="palette-scope__label">Group</span>
            <span className="palette-scope__name">{groupLabel}</span>
          </div>
        ) : null}
        <SearchInput
          value={query}
          onChange={setQuery}
          inputRef={inputRef}
          placeholder={placeholder}
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
