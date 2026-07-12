import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { Hotkey } from '../types/settings';
import { formatHotkey } from '../services/settings';

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

interface HotkeyRecorderProps {
  value: Hotkey;
  onChange: (hotkey: Hotkey) => void;
  invalid?: boolean;
}

/**
 * Records a single keyboard chord. Click to start, then press the desired keys;
 * the next non-modifier key press is captured. Click again to cancel.
 *
 * Escape is captured like any other key (so it can be bound, e.g. to "close").
 */
export function HotkeyRecorder({
  value,
  onChange,
  invalid = false,
}: HotkeyRecorderProps): ReactElement {
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (MODIFIER_KEYS.has(event.key)) return; // wait for a non-modifier key
      onChange({
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        alt: event.altKey,
        shift: event.shiftKey,
        key: event.key.toLowerCase(),
      });
      setRecording(false);
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [recording, onChange]);

  const chordClass = invalid ? 'opt__chord opt__chord--invalid' : 'opt__chord';

  return (
    <div className="opt__recorder">
      <kbd className={chordClass}>{formatHotkey(value)}</kbd>
      <button
        type="button"
        className={recording ? 'opt__btn opt__btn--recording' : 'opt__btn'}
        onClick={() => {
          setRecording((prev) => !prev);
        }}
      >
        {recording ? 'Press keys…' : 'Record'}
      </button>
    </div>
  );
}
