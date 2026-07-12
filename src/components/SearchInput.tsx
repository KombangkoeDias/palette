import { memo } from 'react';
import type { ChangeEvent, ReactElement, RefObject } from 'react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  placeholder?: string;
}

function SearchInputComponent({
  value,
  onChange,
  inputRef,
  placeholder = 'Search tabs…',
}: SearchInputProps): ReactElement {
  return (
    <div className="palette-search">
      <SearchIcon />
      <input
        ref={inputRef}
        className="palette-search__input"
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
        }}
        onKeyUp={(event) => {
          event.stopPropagation();
        }}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label={placeholder}
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
