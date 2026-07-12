import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { PaletteTab } from '../types/tab';
import { displayFaviconUrl } from '../utils/favicon';

interface TabSwitcherProps {
  tabs: PaletteTab[];
  activeIndex: number;
}

/**
 * Transient quick-switch HUD shown while walking the MRU tab timeline with the
 * back/forward shortcuts. Purely presentational — visibility and lifetime are
 * owned by the content-script root.
 */
export function TabSwitcher({ tabs, activeIndex }: TabSwitcherProps): ReactElement {
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const active = listRef.current?.children[activeIndex];
    if (active instanceof HTMLElement) active.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <div className="pal-switcher" role="status" aria-live="polite">
      <ul className="pal-switcher__list" ref={listRef}>
        {tabs.map((tab, index) => (
          <li
            key={tab.id}
            className={index === activeIndex ? 'pal-switcher__row is-active' : 'pal-switcher__row'}
          >
            <Favicon tab={tab} />
            <span className="pal-switcher__title">{tab.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Favicon with a colored letter-avatar fallback when the image is missing. */
function Favicon({ tab }: { tab: PaletteTab }): ReactElement {
  const [errored, setErrored] = useState(false);
  const iconUrl = displayFaviconUrl(tab.favIconUrl, tab.hostname);

  if (iconUrl !== undefined && !errored) {
    return (
      <img
        className="pal-switcher__favicon"
        src={iconUrl}
        alt=""
        onError={() => {
          setErrored(true);
        }}
      />
    );
  }

  const letter = (tab.title.trim().charAt(0) || '?').toUpperCase();
  return (
    <span
      className="pal-switcher__avatar"
      style={{ background: avatarColor(tab.title) }}
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
