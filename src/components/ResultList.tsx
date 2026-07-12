import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import type { PaletteItem } from '../commands/types';
import { ResultRow } from './ResultRow';

interface ResultListProps {
  items: PaletteItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onSelectAlt: (index: number) => void;
  onHover: (index: number) => void;
}

export function ResultList({
  items,
  activeIndex,
  onSelect,
  onSelectAlt,
  onHover,
}: ResultListProps): ReactElement {
  const listRef = useRef<HTMLUListElement>(null);

  // Keep the highlighted row in view as the user navigates.
  useEffect(() => {
    const active = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, items]);

  if (items.length === 0) {
    return <div className="palette-empty">No matching tabs</div>;
  }

  return (
    <ul className="palette-results" role="listbox" aria-label="Tabs" ref={listRef}>
      {items.map((item, index) => (
        <ResultRow
          key={item.id}
          item={item}
          index={index}
          active={index === activeIndex}
          onSelect={onSelect}
          onSelectAlt={onSelectAlt}
          onHover={onHover}
        />
      ))}
    </ul>
  );
}
