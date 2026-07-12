/** Normalizes a hostname or group label for duplicate comparison. */
export function normalizeSiteLabel(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, '');
}

/** True when a tab group has a custom label distinct from the tab hostname. */
export function groupTitleDiffersFromHost(
  groupTitle: string | undefined,
  hostname: string | undefined,
): boolean {
  if (groupTitle === undefined || groupTitle.trim() === '') return false;
  const host = hostname?.trim() ?? '';
  if (host === '') return true;
  return normalizeSiteLabel(groupTitle) !== normalizeSiteLabel(host);
}
