/** Maps Chrome tab-group color names to display colors in the palette UI. */
const GROUP_COLOR_MAP: Record<string, string> = {
  blue: '#5b8def',
  cyan: '#3db8c4',
  green: '#3fb950',
  grey: '#8b8b9a',
  orange: '#e89b3c',
  pink: '#e06c9f',
  purple: '#a371f7',
  red: '#f85149',
  yellow: '#d4a72c',
};

export function tabGroupCssColor(color: string | undefined): string | undefined {
  if (color === undefined || color === '') return undefined;
  return GROUP_COLOR_MAP[color] ?? GROUP_COLOR_MAP.grey;
}
