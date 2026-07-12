import { memo } from 'react';
import type { ReactElement } from 'react';
import type { PaletteBadge } from '../commands/types';

interface BadgeProps {
  badge: PaletteBadge;
}

function BadgeComponent({ badge }: BadgeProps): ReactElement {
  return (
    <span className="palette-badge" role="img" aria-label={badge.label} title={badge.label}>
      {badge.glyph}
    </span>
  );
}

export const Badge = memo(BadgeComponent);
