import { isBackgroundPush } from '../types/messages';
import type { BackgroundPush, RpcRequest, RpcResponseFor } from '../types/messages';

/**
 * Typed messaging helpers used by the UI (content script) to talk to the
 * background worker. This is the single place the UI touches `chrome.runtime`.
 */

/** Sends a typed RPC request and resolves with its typed response. */
export async function sendRpc<T extends RpcRequest>(
  request: T,
): Promise<RpcResponseFor<T['type']>> {
  const response: unknown = await chrome.runtime.sendMessage(request);
  return response as RpcResponseFor<T['type']>;
}

/**
 * Subscribes to one-way pushes from the background worker.
 * Returns an unsubscribe function.
 */
export function onBackgroundPush(handler: (push: BackgroundPush) => void): () => void {
  const listener = (message: unknown): void => {
    if (isBackgroundPush(message)) handler(message);
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => {
    chrome.runtime.onMessage.removeListener(listener);
  };
}
