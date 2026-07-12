import { useCallback, useEffect, useRef, useState } from 'react';
import { Palette } from '../components/Palette';
import { TabSwitcher } from '../components/TabSwitcher';
import { isBackgroundPush } from '../types/messages';
import type { PaletteTab } from '../types/tab';
import type { PaletteScope } from '../types/settings';
import { useSettings } from '../hooks/useSettings';
import { PALETTE_OPEN_ATTR } from './constants';
import {
  matchesHotkey,
} from '../services/settings';

// If both the background command and the in-page interceptor react to the same
// keypress, ignore the second toggle that lands within this window.
const TOGGLE_DEBOUNCE_MS = 150;

// How long the quick-switch HUD lingers after the last back/forward press.
const SWITCHER_VISIBLE_MS = 1500;

interface SwitcherState {
  tabs: PaletteTab[];
  activeIndex: number;
}

interface PaletteState {
  open: boolean;
  scope: PaletteScope;
  filterGroupId?: number | undefined;
}

const CLOSED_PALETTE: PaletteState = { open: false, scope: 'all' };

/**
 * Root content-script component.
 *
 * Owns only the open/closed state of the overlay. When closed it renders
 * nothing, so the palette has zero runtime cost while idle. The heavy lifting
 * (data, search, keyboard) lives in {@link Palette}, which mounts fresh on each
 * open and therefore always starts from an up-to-date snapshot.
 */
export function App(): React.ReactElement | null {
  const [palette, setPalette] = useState<PaletteState>(CLOSED_PALETTE);
  const [switcher, setSwitcher] = useState<SwitcherState | null>(null);
  const switcherTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastToggleAt = useRef(0);
  const settings = useSettings();
  const hotkeyRef = useRef(settings.toggleHotkey);
  const groupHotkeyRef = useRef(settings.toggleGroupHotkey);
  const backHotkeyRef = useRef(settings.backHotkey);
  const forwardHotkeyRef = useRef(settings.forwardHotkey);
  const groupBackHotkeyRef = useRef(settings.groupBackHotkey);
  const groupForwardHotkeyRef = useRef(settings.groupForwardHotkey);

  useEffect(() => {
    hotkeyRef.current = settings.toggleHotkey;
    groupHotkeyRef.current = settings.toggleGroupHotkey;
    backHotkeyRef.current = settings.backHotkey;
    forwardHotkeyRef.current = settings.forwardHotkey;
    groupBackHotkeyRef.current = settings.groupBackHotkey;
    groupForwardHotkeyRef.current = settings.groupForwardHotkey;
  }, [
    settings.toggleHotkey,
    settings.toggleGroupHotkey,
    settings.backHotkey,
    settings.forwardHotkey,
    settings.groupBackHotkey,
    settings.groupForwardHotkey,
  ]);

  const navigateHistory = useCallback((direction: 'back' | 'forward', scope: 'all' | 'group') => {
    void chrome.runtime.sendMessage({
      type: 'NAVIGATE_TAB_HISTORY',
      direction,
      scope,
    });
  }, []);

  const openPalette = useCallback((scope: PaletteScope, groupId?: number) => {
    const now = Date.now();
    const withinDebounce = now - lastToggleAt.current < TOGGLE_DEBOUNCE_MS;
    lastToggleAt.current = now;

    setPalette((prev) => {
      const resolvedGroupId =
        scope === 'group' ? (groupId ?? prev.filterGroupId) : undefined;

      // A second handler often fires within a few ms (content script + manifest
      // command). Merge into the open palette instead of closing or no-op'ing.
      if (withinDebounce) {
        if (!prev.open) {
          return { open: true, scope, filterGroupId: resolvedGroupId };
        }
        if (prev.scope !== scope) {
          return { open: true, scope, filterGroupId: resolvedGroupId };
        }
        if (
          scope === 'group' &&
          resolvedGroupId !== undefined &&
          prev.filterGroupId !== resolvedGroupId
        ) {
          return { ...prev, filterGroupId: resolvedGroupId };
        }
        return prev;
      }

      const sameMode =
        prev.open &&
        prev.scope === scope &&
        (scope === 'all' || prev.filterGroupId === resolvedGroupId);
      if (sameMode) return CLOSED_PALETTE;
      return { open: true, scope, filterGroupId: resolvedGroupId };
    });
  }, []);

  const toggleAll = useCallback(() => {
    openPalette('all');
  }, [openPalette]);

  const applyGroupFilter = useCallback((groupId: number) => {
    setPalette((prev) => {
      if (!prev.open || prev.scope !== 'group') return prev;
      if (prev.filterGroupId === groupId) return prev;
      return { ...prev, filterGroupId: groupId };
    });
  }, []);

  const toggleGroup = useCallback(() => {
    openPalette('group');
    void chrome.tabs.getCurrent().then((tab) => {
      const groupId =
        tab?.groupId !== undefined && tab.groupId !== -1 ? tab.groupId : undefined;
      if (groupId !== undefined) applyGroupFilter(groupId);
    });
  }, [openPalette, applyGroupFilter]);

  const showSwitcher = useCallback((next: SwitcherState) => {
    setSwitcher(next);
    if (switcherTimer.current !== undefined) clearTimeout(switcherTimer.current);
    switcherTimer.current = setTimeout(() => {
      setSwitcher(null);
    }, SWITCHER_VISIBLE_MS);
  }, []);

  useEffect(() => {
    const listener = (message: unknown): void => {
      if (!isBackgroundPush(message)) return;
      if (message.type === 'TOGGLE_PALETTE') {
        if (message.scope === 'group') openPalette('group', message.groupId);
        else openPalette('all');
      } else if (message.type === 'SHOW_TAB_SWITCHER') {
        showSwitcher({ tabs: message.tabs, activeIndex: message.activeIndex });
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [openPalette, showSwitcher]);

  useEffect(
    () => () => {
      if (switcherTimer.current !== undefined) clearTimeout(switcherTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (palette.open) document.documentElement.setAttribute(PALETTE_OPEN_ATTR, '');
    else document.documentElement.removeAttribute(PALETTE_OPEN_ATTR);
    return () => document.documentElement.removeAttribute(PALETTE_OPEN_ATTR);
  }, [palette.open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (matchesHotkey(event, backHotkeyRef.current)) {
        event.preventDefault();
        event.stopPropagation();
        navigateHistory('back', 'all');
        return;
      }
      if (matchesHotkey(event, forwardHotkeyRef.current)) {
        event.preventDefault();
        event.stopPropagation();
        navigateHistory('forward', 'all');
        return;
      }
      if (matchesHotkey(event, groupBackHotkeyRef.current)) {
        event.preventDefault();
        event.stopPropagation();
        navigateHistory('back', 'group');
        return;
      }
      if (matchesHotkey(event, groupForwardHotkeyRef.current)) {
        event.preventDefault();
        event.stopPropagation();
        navigateHistory('forward', 'group');
        return;
      }
      if (matchesHotkey(event, groupHotkeyRef.current)) {
        event.preventDefault();
        event.stopPropagation();
        toggleGroup();
        return;
      }
      if (!matchesHotkey(event, hotkeyRef.current)) return;
      event.preventDefault();
      event.stopPropagation();
      toggleAll();
    };
    // Window capture runs before document-level page shortcuts (YouTube, etc.).
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [toggleAll, toggleGroup, navigateHistory]);

  const close = useCallback(() => {
    setPalette(CLOSED_PALETTE);
  }, []);

  if (!palette.open && switcher === null) return null;
  return (
    <>
      {switcher !== null ? (
        <TabSwitcher tabs={switcher.tabs} activeIndex={switcher.activeIndex} />
      ) : null}
      {palette.open ? (
        <Palette scope={palette.scope} filterGroupId={palette.filterGroupId} onClose={close} />
      ) : null}
    </>
  );
}
