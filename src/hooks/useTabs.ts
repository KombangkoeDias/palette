import { useEffect, useState } from 'react';
import type { PaletteSnapshot } from '../types/messages';
import { onBackgroundPush, sendRpc } from '../services/messaging';

const EMPTY_SNAPSHOT: PaletteSnapshot = { tabs: [], mru: [] };

/**
 * Subscribes to the browser snapshot (open tabs + MRU order).
 *
 * On mount it requests a fresh snapshot, then stays in sync via background
 * pushes. Because the palette mounts on open and unmounts on close, this also
 * guarantees the data is current every time the user opens it.
 *
 * The returned `tabs` array keeps a stable reference until the background sends
 * a new snapshot, which lets the Fuse index be reused across keystrokes.
 */
export function useTabs(): PaletteSnapshot {
  const [snapshot, setSnapshot] = useState<PaletteSnapshot>(EMPTY_SNAPSHOT);

  useEffect(() => {
    let active = true;

    sendRpc({ type: 'GET_SNAPSHOT' })
      .then((next) => {
        if (active) setSnapshot(next);
      })
      .catch((error: unknown) => {
        console.error('[Palette] failed to load tabs', error);
      });

    const unsubscribe = onBackgroundPush((push) => {
      if (push.type === 'SNAPSHOT_CHANGED') setSnapshot(push.snapshot);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return snapshot;
}
