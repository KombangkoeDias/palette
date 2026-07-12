import { useCallback, useState } from 'react';
import type { Keymap, PaletteKeyAction } from '../types/settings';
import { matchesHotkey } from '../services/settings';

interface KeyboardNavOptions {
  itemCount: number;
  /** Configurable chords for each in-palette action. */
  keymap: Keymap;
  /** Invoked with the active index for the "select" action. */
  onSelect: (index: number) => void;
  /** Invoked with the active index for the "selectAlt" action. */
  onSelectAlt: (index: number) => void;
  /** Invoked for the "close" action. */
  onClose: () => void;
  /**
   * Changing this value resets the highlight to the first row — pass the query
   * so a new search always starts highlighted at the top result.
   */
  resetKey: string;
}

interface KeyboardNav {
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  /** Handles a palette key chord; returns true when the event was consumed. */
  handleKeyDown: (event: KeyboardEvent) => boolean;
}

// Order in which chords are tested. More specific chords (selectAlt = Shift+
// Enter) come before their base (select = Enter) so an exact match wins first.
const RESOLVE_ORDER: PaletteKeyAction[] = [
  'selectAlt',
  'select',
  'navigateDown',
  'navigateUp',
  'first',
  'last',
  'close',
];

/**
 * Keyboard navigation for the result list, driven by a configurable keymap.
 *
 * The active index is clamped to the current list and reset to the top whenever
 * `resetKey` changes.
 */
export function useKeyboardNav({
  itemCount,
  keymap,
  onSelect,
  onSelectAlt,
  onClose,
  resetKey,
}: KeyboardNavOptions): KeyboardNav {
  const [rawIndex, setRawIndex] = useState(0);

  // Reset the highlight to the top whenever the query changes. Setting state
  // during render (the React-recommended pattern for deriving state from props)
  // avoids an extra effect-driven render pass.
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setRawIndex(0);
  }

  // Clamp on read so a shrinking list never leaves the highlight out of range.
  const activeIndex = itemCount === 0 ? 0 : Math.min(rawIndex, itemCount - 1);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent): boolean => {
      const action = RESOLVE_ORDER.find((candidate) =>
        matchesHotkey(event, keymap[candidate]),
      );
      if (action === undefined) return false;
      event.preventDefault();
      event.stopPropagation();

      switch (action) {
        case 'navigateDown':
          setRawIndex((prev) => (itemCount === 0 ? 0 : (prev + 1) % itemCount));
          break;
        case 'navigateUp':
          setRawIndex((prev) => (itemCount === 0 ? 0 : (prev - 1 + itemCount) % itemCount));
          break;
        case 'first':
          setRawIndex(0);
          break;
        case 'last':
          setRawIndex(itemCount === 0 ? 0 : itemCount - 1);
          break;
        case 'select':
          if (itemCount > 0) onSelect(activeIndex);
          break;
        case 'selectAlt':
          if (itemCount > 0) onSelectAlt(activeIndex);
          break;
        case 'close':
          onClose();
          break;
      }
      return true;
    },
    [activeIndex, itemCount, keymap, onClose, onSelect, onSelectAlt],
  );

  return { activeIndex, setActiveIndex: setRawIndex, handleKeyDown };
}
