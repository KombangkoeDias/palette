/** A tab row inside a group card on the new-tab page. */
export interface GroupTabRow {
  id: number;
  windowId: number;
  title: string;
  hostname: string;
}

/** A frequently visited domain shortcut on the new-tab page. */
export interface FrequentSite {
  domain: string;
  visitCount: number;
  /** Most-visited URL for this domain; used when no matching tab is open. */
  url?: string | undefined;
  /** Present when an open tab matches the domain (grouped or not). */
  tabId?: number | undefined;
  windowId?: number | undefined;
  /** Present when a tab group is named after this domain. */
  groupId?: number | undefined;
  favIconUrl?: string | undefined;
}

/** Native Chrome tab group or an ungrouped domain cluster on the new-tab page. */
export type TabClusterKind = 'group' | 'domain';

export type TabClusterRef =
  | { kind: 'group'; groupId: number }
  | { kind: 'domain'; domain: string };

/** A tab group or ungrouped domain cluster row for the new-tab tab manager. */
export interface TabGroupSummary {
  /** Native Chrome group id, or a stable negative id for domain clusters. */
  id: number;
  kind: TabClusterKind;
  /** Hostname for ungrouped domain clusters. */
  domain?: string | undefined;
  title: string;
  color: string;
  tabCount: number;
  windowId: number;
  /** True when the cluster already lives in the window hosting this new tab. */
  isInCurrentWindow: boolean;
  /** All tabs in the cluster, most recently used first. */
  tabs: GroupTabRow[];
  /** Favicon for the cluster (from its most recent tab). */
  favIconUrl?: string | undefined;
  /** Chrome `lastAccessed` of the cluster's most recent tab. */
  lastAccessedAt: number;
}

export function clusterRefFromSummary(summary: TabGroupSummary): TabClusterRef {
  if (summary.kind === 'domain' && summary.domain !== undefined) {
    return { kind: 'domain', domain: summary.domain };
  }
  return { kind: 'group', groupId: summary.id };
}

export interface TabGroupsSnapshot {
  groups: TabGroupSummary[];
  frequentSites: FrequentSite[];
  currentWindowId?: number | undefined;
}
