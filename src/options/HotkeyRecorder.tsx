import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { Hotkey } from '../types/settings';
import { formatHotkey, isMac } from '../services/settings';

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

const CODE_TO_KEY: Record<string, string> = {
  Comma: ',',
  Period: '.',
  Slash: '/',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Minus: '-',
  Equal: '=',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
};

interface HotkeyRecorderProps {
  value: Hotkey;
  onChange: (hotkey: Hotkey) => void;
  invalid?: boolean;
}

function modifierFields(mac: boolean): { field: keyof Pick<Hotkey, 'ctrl' | 'meta' | 'alt' | 'shift'>; label: string }[] {
  return mac
    ? [
        { field: 'meta', label: 'Cmd' },
        { field: 'ctrl', label: 'Ctrl' },
        { field: 'alt', label: 'Option' },
        { field: 'shift', label: 'Shift' },
      ]
    : [
        { field: 'ctrl', label: 'Ctrl' },
        { field: 'alt', label: 'Alt' },
        { field: 'shift', label: 'Shift' },
        { field: 'meta', label: 'Win' },
      ];
}

function normalizeRecordKey(event: KeyboardEvent): string {
  const key = event.key.toLowerCase();
  if (key.length === 1) return key;
  const fromCode = CODE_TO_KEY[event.code];
  if (fromCode !== undefined) return fromCode;
  return key;
}

function mergeModifiers(value: Hotkey, event: KeyboardEvent): Pick<Hotkey, 'ctrl' | 'meta' | 'alt' | 'shift'> {
  return {
    ctrl: value.ctrl || event.ctrlKey,
    meta: value.meta || event.metaKey,
    alt: value.alt || event.altKey,
    shift: value.shift || event.shiftKey,
  };
}

/**
 * Records a keyboard chord. Toggle modifiers (or hold them), then press Record
 * and hit the main key. Modifier toggles also work without Record — useful on
 * macOS where Chrome reserves shortcuts like Cmd+, before the page can see them.
 */
export function HotkeyRecorder({
  value,
  onChange,
  invalid = false,
}: HotkeyRecorderProps): ReactElement {
  const [recording, setRecording] = useState(false);
  const valueRef = useRef(value);
  const mac = isMac();
  const modifiers = modifierFields(mac);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      const current = valueRef.current;

      if (MODIFIER_KEYS.has(event.key)) {
        onChange({ ...current, ...mergeModifiers(current, event) });
        return;
      }

      onChange({
        ...current,
        ...mergeModifiers(current, event),
        key: normalizeRecordKey(event),
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
      <div className="opt__modifier-row" role="group" aria-label="Modifiers">
        {modifiers.map(({ field, label }) => (
          <button
            key={field}
            type="button"
            className={value[field] ? 'opt__mod opt__mod--on' : 'opt__mod'}
            aria-pressed={value[field]}
            onClick={() => {
              onChange({ ...value, [field]: !value[field] });
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={recording ? 'opt__btn opt__btn--recording' : 'opt__btn'}
        onClick={() => {
          setRecording((prev) => !prev);
        }}
      >
        {recording ? 'Press key…' : 'Record key'}
      </button>
    </div>
  );
}
