import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { TabGroupSummary, FrequentSite } from '../types/groups';
import { clusterRefFromSummary } from '../types/groups';
import { sendRpc } from '../services/messaging';
import { isMac } from '../services/settings';
import { displayFaviconUrl } from '../utils/favicon';
import { tabGroupCssColor } from '../utils/tabGroupColors';
import { filterGroups } from '../utils/groupSearch';
import { OMNIBOX_KEYWORD } from '../constants/omnibox';
import { greetingForHour, wallpaperForNewTab } from './wallpaper';
import { useNewTabTheme } from './useNewTabTheme';

function useClock(): { time: string; greeting: string } {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(tick);
  }, []);

  return useMemo(() => {
    const hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return {
      time: `${hours % 12 || 12}:${minutes}`,
      greeting: greetingForHour(hours),
    };
  }, [now]);
}

export function NewTab(): ReactElement {
  const wallpaper = useMemo(() => wallpaperForNewTab(), []);
  const { theme, toggleTheme } = useNewTabTheme();
  const { time, greeting } = useClock();
  const [groups, setGroups] = useState<TabGroupSummary[]>([]);
  const [frequentSites, setFrequentSites] = useState<FrequentSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyClusterId, setBusyClusterId] = useState<number | null>(null);
  const [busySiteDomain, setBusySiteDomain] = useState<string | null>(null);
  const [removingSiteDomain, setRemovingSiteDomain] = useState<string | null>(null);
  const [closingTabId, setClosingTabId] = useState<number | null>(null);
  const [closingClusterId, setClosingClusterId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bgReady, setBgReady] = useState(false);
  const [groupQuery, setGroupQuery] = useState('');

  const filteredGroups = useMemo(
    () => filterGroups(groups, groupQuery),
    [groups, groupQuery],
  );

  const loadGroups = useCallback(async () => {
    try {
      const snapshot = await sendRpc({ type: 'GET_TAB_GROUPS' });
      setGroups(snapshot.groups);
      setFrequentSites(snapshot.frequentSites);
      setError(null);
    } catch (cause: unknown) {
      console.error('[Palette] failed to load tab groups', cause);
      setError('Could not load open tabs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setBgReady(true);
    img.src = wallpaper.url;
  }, [wallpaper.url]);

  useEffect(() => {
    const refresh = (): void => {
      void loadGroups();
    };
    chrome.tabs.onCreated.addListener(refresh);
    chrome.tabs.onRemoved.addListener(refresh);
    chrome.tabs.onMoved.addListener(refresh);
    chrome.tabs.onAttached.addListener(refresh);
    chrome.tabs.onDetached.addListener(refresh);
    chrome.tabGroups.onUpdated.addListener(refresh);
    chrome.tabGroups.onRemoved.addListener(refresh);
    chrome.windows.onFocusChanged.addListener(refresh);
    return () => {
      chrome.tabs.onCreated.removeListener(refresh);
      chrome.tabs.onRemoved.removeListener(refresh);
      chrome.tabs.onMoved.removeListener(refresh);
      chrome.tabs.onAttached.removeListener(refresh);
      chrome.tabs.onDetached.removeListener(refresh);
      chrome.tabGroups.onUpdated.removeListener(refresh);
      chrome.tabGroups.onRemoved.removeListener(refresh);
      chrome.windows.onFocusChanged.removeListener(refresh);
    };
  }, [loadGroups]);

  const moveHere = useCallback(
    async (cluster: TabGroupSummary) => {
      setBusyClusterId(cluster.id);
      try {
        await sendRpc({ type: 'MOVE_CLUSTER_HERE', cluster: clusterRefFromSummary(cluster) });
        await loadGroups();
      } catch (cause: unknown) {
        console.error('[Palette] failed to move tabs', cause);
        setError('Could not move those tabs.');
      } finally {
        setBusyClusterId(null);
      }
    },
    [loadGroups],
  );

  const goToCluster = useCallback(async (cluster: TabGroupSummary) => {
    setBusyClusterId(cluster.id);
    try {
      await sendRpc({ type: 'FOCUS_CLUSTER', cluster: clusterRefFromSummary(cluster) });
    } catch (cause: unknown) {
      console.error('[Palette] failed to focus tabs', cause);
      setError('Could not switch to those tabs.');
    } finally {
      setBusyClusterId(null);
    }
  }, []);

  const openSettings = useCallback(() => {
    void chrome.runtime.openOptionsPage();
  }, []);

  const openSite = useCallback(async (site: FrequentSite) => {
    setBusySiteDomain(site.domain);
    try {
      await sendRpc({ type: 'OPEN_FREQUENT_SITE', site });
    } catch (cause: unknown) {
      console.error('[Palette] failed to open site', cause);
      setError('Could not open that site.');
    } finally {
      setBusySiteDomain(null);
    }
  }, []);

  const removeSite = useCallback(async (domain: string) => {
    setRemovingSiteDomain(domain);
    try {
      await sendRpc({ type: 'REMOVE_FREQUENT_SITE', domain });
      setFrequentSites((sites) => sites.filter((site) => site.domain !== domain));
      setError(null);
    } catch (cause: unknown) {
      console.error('[Palette] failed to remove frequent site', cause);
      setError('Could not remove that site.');
    } finally {
      setRemovingSiteDomain(null);
    }
  }, []);

  const closeTab = useCallback(
    async (tabId: number) => {
      setClosingTabId(tabId);
      try {
        await sendRpc({ type: 'CLOSE_TAB', tabId });
        await loadGroups();
      } catch (cause: unknown) {
        console.error('[Palette] failed to close tab', cause);
        setError('Could not close that tab.');
      } finally {
        setClosingTabId(null);
      }
    },
    [loadGroups],
  );

  const closeCluster = useCallback(
    async (cluster: TabGroupSummary) => {
      setClosingClusterId(cluster.id);
      try {
        await sendRpc({ type: 'CLOSE_CLUSTER', cluster: clusterRefFromSummary(cluster) });
        await loadGroups();
      } catch (cause: unknown) {
        console.error('[Palette] failed to close tabs', cause);
        setError('Could not close those tabs.');
      } finally {
        setClosingClusterId(null);
      }
    },
    [loadGroups],
  );

  const mod = isMac() ? 'Cmd' : 'Ctrl';

  return (
    <div className={`ntp-shell${bgReady ? ' is-ready' : ''}`} data-theme={theme}>
      <div
        className="ntp-shell__bg"
        style={{ backgroundImage: `url("${wallpaper.url}")` }}
        aria-hidden="true"
      />
      <div className="ntp-shell__scrim" aria-hidden="true" />

      <main className="ntp">
        <header className="ntp__top">
          <div className="ntp__toolbar">
            <button
              type="button"
              className="ntp__icon-btn"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
            <button
              type="button"
              className="ntp__icon-btn"
              onClick={openSettings}
              aria-label="Open settings"
              title="Settings"
            >
              <SettingsIcon />
            </button>
          </div>
        </header>

        <div className="ntp__body">
        <section className="ntp__hero" aria-label="Greeting">
          <p className="ntp__greeting">{greeting}</p>
          <p className="ntp__clock">{time}</p>
          <p className="ntp__omnibox-hint">
            Type <kbd>{OMNIBOX_KEYWORD}</kbd> + <kbd>Space</kbd> in the address bar to jump to open
            tabs
          </p>
        </section>

        {!loading && frequentSites.length > 0 ? (
          <section className="ntp__panel ntp__panel--frequent" aria-label="Frequently visited sites">
            <h2 className="ntp__panel-title">Frequent sites</h2>
            <ul className="ntp__frequent-list">
              {frequentSites.map((site) => (
                <li key={site.domain} className="ntp__frequent-cell">
                  <button
                    type="button"
                    className="ntp__frequent-item"
                    disabled={busySiteDomain === site.domain || removingSiteDomain === site.domain}
                    onClick={() => openSite(site)}
                  >
                    <FrequentSiteIcon site={site} />
                    <span className="ntp__frequent-domain">{site.domain}</span>
                  </button>
                  <button
                    type="button"
                    className="ntp__frequent-remove"
                    disabled={removingSiteDomain === site.domain}
                    aria-label={`Remove ${site.domain} from frequent sites`}
                    title="Remove from frequent sites"
                    onClick={(event) => {
                      event.stopPropagation();
                      void removeSite(site.domain);
                    }}
                  >
                    <span className="ntp__frequent-remove-x" aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="ntp__panel ntp__panel--groups" aria-label="Open tabs">
          <div className="ntp__panel-head">
            <h1 className="ntp__panel-title">Open tabs</h1>
            <p className="ntp__panel-hint">
              <kbd>{mod}</kbd> + <kbd>J</kbd> opens the palette on any page
            </p>
          </div>

          {error !== null ? <p className="ntp__error">{error}</p> : null}

          {!loading && groups.length > 0 ? (
            <input
              className="ntp__groups-search"
              type="search"
              value={groupQuery}
              onChange={(event) => setGroupQuery(event.target.value)}
              placeholder="Search by site, group, or tab…"
              aria-label="Search open tabs"
            />
          ) : null}

          {loading ? (
            <p className="ntp__status">Loading tabs…</p>
          ) : groups.length === 0 ? (
            <div className="ntp__status">
              <p className="ntp__status-title">No open tabs yet</p>
              <p className="ntp__status-body">
                Open a few sites or enable domain grouping in settings to organize them into groups.
              </p>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="ntp__status">
              <p className="ntp__status-title">No matching tabs</p>
              <p className="ntp__status-body">Try a different site name, group, or tab title.</p>
            </div>
          ) : (
            <ul className="ntp__list">
              {filteredGroups.map((cluster) => (
                <ClusterCard
                  key={`${cluster.kind}:${String(cluster.id)}`}
                  cluster={cluster}
                  busy={busyClusterId === cluster.id}
                  closingTabId={closingTabId}
                  closingAll={closingClusterId === cluster.id}
                  onMoveHere={() => moveHere(cluster)}
                  onGoTo={() => goToCluster(cluster)}
                  onCloseTab={closeTab}
                  onCloseAll={() => closeCluster(cluster)}
                />
              ))}
            </ul>
          )}
        </section>

        <footer className="ntp__credit">
          Photo by{' '}
          <a href={wallpaper.creditUrl} target="_blank" rel="noreferrer noopener">
            {wallpaper.credit}
          </a>{' '}
          on{' '}
          <a href="https://unsplash.com" target="_blank" rel="noreferrer noopener">
            Unsplash
          </a>
        </footer>
        </div>
      </main>
    </div>
  );
}

interface ClusterCardProps {
  cluster: TabGroupSummary;
  busy: boolean;
  closingTabId: number | null;
  closingAll: boolean;
  onMoveHere: () => void;
  onGoTo: () => void;
  onCloseTab: (tabId: number) => void;
  onCloseAll: () => void;
}

function ClusterCard({
  cluster,
  busy,
  closingTabId,
  closingAll,
  onMoveHere,
  onGoTo,
  onCloseTab,
  onCloseAll,
}: ClusterCardProps): ReactElement {
  const stripe = tabGroupCssColor(cluster.color);
  const previewTabs = cluster.tabs;
  const faviconHost = cluster.domain ?? cluster.title;
  const actionsDisabled = busy || closingAll;

  const closeLabel = cluster.kind === 'group' ? 'Close group' : 'Close all tabs';

  return (
    <li className="ntp__card">
      <div className="ntp__card-main">
        <span
          className="ntp__stripe"
          style={{ background: stripe ?? 'rgba(255,255,255,0.35)' }}
          aria-hidden="true"
        />
        <div className="ntp__card-body">
          <div className="ntp__card-head">
            <div className="ntp__card-meta">
              <TabFavicon
                favIconUrl={displayFaviconUrl(cluster.favIconUrl, faviconHost)}
                label={cluster.title}
                className="ntp__card-icon"
              />
              <h2 className="ntp__card-title">{cluster.title}</h2>
              <span className="ntp__badge">
                {cluster.tabCount} tab{cluster.tabCount === 1 ? '' : 's'}
              </span>
              {cluster.kind === 'domain' ? (
                <span className="ntp__badge ntp__badge--ungrouped">Ungrouped</span>
              ) : null}
              {cluster.isInCurrentWindow ? (
                <span className="ntp__badge ntp__badge--here">Here</span>
              ) : null}
            </div>
            <div className="ntp__card-toolbar" role="group" aria-label={`Actions for ${cluster.title}`}>
              <button
                type="button"
                className="ntp__toolbar-btn ntp__toolbar-btn--accent"
                disabled={actionsDisabled || cluster.isInCurrentWindow}
                aria-label="Move here"
                title="Move here"
                onClick={onMoveHere}
              >
                <MoveHereIcon />
              </button>
              <button
                type="button"
                className="ntp__toolbar-btn"
                disabled={actionsDisabled}
                aria-label="Go to"
                title="Go to"
                onClick={onGoTo}
              >
                <GoToIcon />
              </button>
              <button
                type="button"
                className="ntp__toolbar-btn ntp__toolbar-btn--danger"
                disabled={actionsDisabled}
                aria-label={closeLabel}
                title={closeLabel}
                onClick={onCloseAll}
              >
                <CloseIcon size={14} />
              </button>
            </div>
          </div>
          <ul className="ntp__preview">
            {previewTabs.map((tab) => (
              <li key={tab.id} className="ntp__preview-item">
                <span className="ntp__preview-title">{tab.title}</span>
                <button
                  type="button"
                  className="ntp__preview-close"
                  disabled={actionsDisabled || closingTabId === tab.id}
                  aria-label={`Close ${tab.title}`}
                  title="Close tab"
                  onClick={() => onCloseTab(tab.id)}
                >
                  <span className="ntp__preview-close-x" aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
}

function CloseIcon({ size = 12 }: { size?: number }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden="true">
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function MoveHereIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 3h5v5M4 20 21 3" />
    </svg>
  );
}

function GoToIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 17 17 7M7 7h10v10" />
    </svg>
  );
}

function SettingsIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33 1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82 1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
      />
    </svg>
  );
}

function FrequentSiteIcon({ site }: { site: FrequentSite }): ReactElement {
  return (
    <TabFavicon
      favIconUrl={displayFaviconUrl(site.favIconUrl, site.domain)}
      label={site.domain}
      className="ntp__frequent-icon"
    />
  );
}

interface TabFaviconProps {
  favIconUrl?: string | undefined;
  label: string;
  className: string;
}

function TabFavicon({ favIconUrl, label, className }: TabFaviconProps): ReactElement {
  const [errored, setErrored] = useState(false);

  if (favIconUrl !== undefined && favIconUrl !== '' && !errored) {
    return (
      <img
        className={className}
        src={favIconUrl}
        alt=""
        onError={() => {
          setErrored(true);
        }}
      />
    );
  }

  const letter = (label.trim().charAt(0) || '?').toUpperCase();
  return (
    <span
      className={`${className} ntp__tab-avatar`}
      style={{ background: avatarColor(label) }}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${String(hue)}, 50%, 42%)`;
}

function SunIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 14.5A8.5 8.5 0 0 1 9.5 4 7 7 0 1 0 20 14.5Z"
      />
    </svg>
  );
}
