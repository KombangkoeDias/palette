import type { TabGroupSummary } from '../types/groups';
import { clusterRefFromSummary } from '../types/groups';
import { focusCluster, listTabGroups } from './groupsService';
import { filterGroups } from '../utils/groupSearch';

const GROUP_CONTENT_PREFIX = 'palette-group:';
const DOMAIN_CONTENT_PREFIX = 'palette-domain:';
const MAX_SUGGESTIONS = 6;

function clusterContent(cluster: TabGroupSummary): string {
  if (cluster.kind === 'domain' && cluster.domain !== undefined) {
    return `${DOMAIN_CONTENT_PREFIX}${cluster.domain}`;
  }
  return `${GROUP_CONTENT_PREFIX}${String(cluster.id)}`;
}

function parseClusterContent(text: string): TabGroupSummary | undefined {
  if (text.startsWith(DOMAIN_CONTENT_PREFIX)) {
    const domain = text.slice(DOMAIN_CONTENT_PREFIX.length);
    if (domain === '') return undefined;
    return {
      id: -1,
      kind: 'domain',
      domain,
      title: domain,
      color: 'grey',
      tabCount: 0,
      windowId: chrome.windows.WINDOW_ID_CURRENT,
      isInCurrentWindow: false,
      tabs: [],
      lastAccessedAt: 0,
    };
  }

  if (!text.startsWith(GROUP_CONTENT_PREFIX)) return undefined;
  const id = Number.parseInt(text.slice(GROUP_CONTENT_PREFIX.length), 10);
  if (Number.isNaN(id)) return undefined;
  return {
    id,
    kind: 'group',
    title: '',
    color: 'grey',
    tabCount: 0,
    windowId: chrome.windows.WINDOW_ID_CURRENT,
    isInCurrentWindow: false,
    tabs: [],
    lastAccessedAt: 0,
  };
}

function formatSuggestion(cluster: TabGroupSummary): string {
  const here = cluster.isInCurrentWindow ? ' · here' : '';
  const label = cluster.kind === 'domain' ? 'tabs' : 'group';
  return `${cluster.title} — ${String(cluster.tabCount)} ${label} tab${cluster.tabCount === 1 ? '' : 's'}${here}`;
}

/** Wires address-bar tab search via the chrome.omnibox API. */
export function registerOmnibox(): void {
  chrome.omnibox.setDefaultSuggestion({
    description: 'Search open tabs by site or group name',
  });

  let requestSeq = 0;

  chrome.omnibox.onInputChanged.addListener((text, suggest) => {
    const seq = ++requestSeq;
    void listTabGroups(undefined)
      .then((snapshot) => {
        if (seq !== requestSeq) return;
        const matches = filterGroups(snapshot.groups, text).slice(0, MAX_SUGGESTIONS);
        suggest(
          matches.map((cluster) => ({
            content: clusterContent(cluster),
            description: formatSuggestion(cluster),
          })),
        );
      })
      .catch((error: unknown) => {
        console.error('[Palette] omnibox suggestions failed', error);
        if (seq === requestSeq) suggest([]);
      });
  });

  chrome.omnibox.onInputEntered.addListener((text) => {
    void (async () => {
      const fromSuggestion = parseClusterContent(text);
      if (fromSuggestion !== undefined) {
        await focusCluster(clusterRefFromSummary(fromSuggestion));
        return;
      }

      const snapshot = await listTabGroups(undefined);
      const match = filterGroups(snapshot.groups, text)[0];
      if (match !== undefined) await focusCluster(clusterRefFromSummary(match));
    })().catch((error: unknown) => {
      console.error('[Palette] omnibox navigation failed', error);
    });
  });
}
