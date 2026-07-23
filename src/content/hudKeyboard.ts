/**
 * Detects HUD walk modifier release from every frame (including iframes).
 *
 * SPAs like Notion and Brex often capture keyboard events in nested editors,
 * so the React root (top frame, document_idle) never sees Meta keyup. This
 * script runs at document_start in all frames and checks modifier state on
 * every keydown/keyup before page handlers can swallow the event.
 */
import { allWalkModifiersHeld, type ChordModifiers } from '../services/settings';
import { HUD_DISMISS_MESSAGE, HUD_WALK_SESSION_KEY } from '../constants/hudWalk';

const SESSION_KEY = HUD_WALK_SESSION_KEY;

interface HudWalkSession {
  active: boolean;
  tabId: number;
  modifiers: ChordModifiers;
  shown: boolean;
}

let session: HudWalkSession | null = null;
let commitInFlight = false;

function readSession(raw: unknown): HudWalkSession | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (record.active !== true) return null;
  if (typeof record.tabId !== 'number') return null;
  const modifiers = record.modifiers;
  if (typeof modifiers !== 'object' || modifiers === null) return null;
  const mod = modifiers as Record<string, unknown>;
  return {
    active: true,
    tabId: record.tabId,
    shown: record.shown === true,
    modifiers: {
      ctrl: mod.ctrl === true,
      meta: mod.meta === true,
      alt: mod.alt === true,
      shift: mod.shift === true,
    },
  };
}

void chrome.storage.session.get(SESSION_KEY).then((stored) => {
  session = readSession(stored[SESSION_KEY]);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'session' || changes[SESSION_KEY] === undefined) return;
  session = readSession(changes[SESSION_KEY].newValue);
  if (session === null) commitInFlight = false;
});

function broadcastHudDismiss(): void {
  const message = { type: HUD_DISMISS_MESSAGE };
  window.postMessage(message, '*');
  try {
    window.top?.postMessage(message, '*');
  } catch {
    // Cross-origin access to window.top can throw; postMessage above still ran.
  }
}

function requestHudCommit(): void {
  if (commitInFlight) return;
  commitInFlight = true;
  broadcastHudDismiss();
  void chrome.runtime.sendMessage({ type: 'COMMIT_HUD_WALK' }).finally(() => {
    window.setTimeout(() => {
      commitInFlight = false;
    }, 200);
  });
}

function onKey(event: KeyboardEvent): void {
  if (session === null || !session.shown) return;
  if (allWalkModifiersHeld(session.modifiers, event)) return;
  requestHudCommit();
}

window.addEventListener('keydown', onKey, { capture: true });
window.addEventListener('keyup', onKey, { capture: true });
