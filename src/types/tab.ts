/**
 * A serializable, UI-friendly projection of a Chrome tab.
 *
 * Only the fields the palette needs are included. The shape is deliberately
 * flat and plain so it can be sent across the content-script <-> background
 * messaging boundary without any structured-clone surprises.
 */
export interface PaletteTab {
  /** Chrome tab id (unstable across browser restarts). */
  id: number;
  /** Window the tab belongs to; used to focus the right window on switch. */
  windowId: number;
  title: string;
  url: string;
  /** Parsed hostname (e.g. "github.com"); empty for non-http(s) URLs. */
  hostname: string;
  /** Favicon URL when Chrome exposes one. */
  favIconUrl?: string | undefined;
  pinned: boolean;
  /** Tab is currently producing sound. */
  audible: boolean;
  /** Tab is muted. */
  muted: boolean;
  /** Chrome's last-focused timestamp (ms); higher = more recently used. */
  lastAccessed: number;
  /** Native tab group id; omitted when ungrouped. */
  groupId?: number | undefined;
  /** Tab group label from Chrome (e.g. domain name). */
  groupTitle?: string | undefined;
  /** Tab group color name from Chrome (`blue`, `red`, …). */
  groupColor?: string | undefined;
}
