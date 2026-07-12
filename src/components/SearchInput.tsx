import { memo } from 'react';
import type { ChangeEvent, KeyboardEvent, ReactElement, RefObject } from 'react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

function SearchInputComponent({
  value,
  onChange,
  onKeyDown,
  inputRef,
}: SearchInputProps): ReactElement {
  return (
    <div className="palette-search">
      <SearchIcon />
      <input
        ref={inputRef}
        className="palette-search__input"
        type="text"
        placeholder="Search tabs..."
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          onChange(event.target.value);
        }}
        onKeyDown={onKeyDown}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label="Search tabs"
      />
    </div>
  );
}

function SearchIcon(): ReactElement {
  return (
    <svg
      className="palette-search__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export const SearchInput = memo(SearchInputComponent);
