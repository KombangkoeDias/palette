import { memo, useState } from 'react';
import type { ReactElement } from 'react';
import type { PaletteItem } from '../commands/types';
import { tabGroupCssColor } from '../utils/tabGroupColors';
import { displayFaviconUrl } from '../utils/favicon';
import { groupTitleDiffersFromHost } from '../utils/groupDisplay';
import { Badge } from './Badge';

interface ResultRowProps {
  item: PaletteItem;
  index: number;
  active: boolean;
  onSelect: (index: number) => void;
  onSelectAlt: (index: number) => void;
  onHover: (index: number) => void;
}

function ResultRowComponent({
  item,
  index,
  active,
  onSelect,
  onSelectAlt,
  onHover,
}: ResultRowProps): ReactElement {
  const groupColor = tabGroupCssColor(item.groupColor);
  const showGroupName = groupTitleDiffersFromHost(item.groupTitle, item.subtitle);

  return (
    <li role="option" aria-selected={active}>
      <button
        type="button"
        className={active ? 'palette-row is-active' : 'palette-row'}
        tabIndex={-1}
        onClick={(event) => {
          if (event.shiftKey) onSelectAlt(index);
          else onSelect(index);
        }}
        onMouseEnter={() => {
          onHover(index);
        }}
      >
        {groupColor !== undefined ? (
          <span
            className="palette-row__group"
            style={{ background: groupColor }}
            title={item.groupTitle ?? 'Tab group'}
            aria-hidden="true"
          />
        ) : null}
        <Favicon item={item} />
        <span className="palette-row__text">
          <span className="palette-row__title">{item.title}</span>
          {item.subtitle !== undefined && item.subtitle !== '' ? (
            <span className="palette-row__subtitle">
              {item.subtitle}
              {showGroupName && item.groupTitle !== undefined ? (
                <>
                  <span className="palette-row__subtitle-sep"> · </span>
                  <span
                    className="palette-row__group-inline"
                    style={groupColor !== undefined ? { color: groupColor } : undefined}
                  >
                    {item.groupTitle}
                  </span>
                </>
              ) : null}
            </span>
          ) : null}
        </span>
        {item.badges.length > 0 ? (
          <span className="palette-row__badges">
            {item.badges.map((badge) => (
              <Badge key={badge.kind} badge={badge} />
            ))}
          </span>
        ) : null}
      </button>
    </li>
  );
}

/** Favicon with a colored letter-avatar fallback when the image is missing. */
function Favicon({ item }: { item: PaletteItem }): ReactElement {
  const [errored, setErrored] = useState(false);
  const iconUrl = displayFaviconUrl(item.favIconUrl, item.subtitle ?? '');

  if (iconUrl !== undefined && !errored) {
    return (
      <img
        className="palette-row__favicon"
        src={iconUrl}
        alt=""
        onError={() => {
          setErrored(true);
        }}
      />
    );
  }

  const letter = (item.title.trim().charAt(0) || '?').toUpperCase();
  return (
    <span
      className="palette-row__avatar"
      style={{ background: avatarColor(item.title) }}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}

/** Deterministic pleasant color derived from a seed string. */
function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${String(hue)}, 50%, 42%)`;
}

// Memoized so unaffected rows don't re-render while navigating a long list.
export const ResultRow = memo(ResultRowComponent);
