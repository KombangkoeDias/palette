import type { TabGroupSummary } from '../types/groups';

/** Filters tab groups by title or any tab title/hostname in the group. */
export function filterGroups(groups: TabGroupSummary[], query: string): TabGroupSummary[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return groups;
  return groups.filter((group) => {
    if (group.title.toLowerCase().includes(needle)) return true;
    return group.tabs.some(
      (tab) =>
        tab.title.toLowerCase().includes(needle) ||
        tab.hostname.toLowerCase().includes(needle),
    );
  });
}
