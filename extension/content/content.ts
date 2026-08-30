// Hermes Content Script

import { extractElements, getPageInfo } from './dom-parser';
import { executeAction } from './action-executor';
import type { BrowserState, HermesMessage, ActionRequest } from '../utils/messaging';

let currentState: BrowserState | null = null;
let pendingResponses: Map<string, (response: HermesMessage) => void> = new Map();

// Listen for responses from background that match our pending requests
chrome.runtime.onMessage.addListener((message: HermesMessage) => {
  if (message.source === 'background' && pendingResponses.has(message.type)) {
    const cb = pendingResponses.get(message.type);
    if (cb) {
      pendingResponses.delete(message.type);
      cb(message);
    }
  }
});

function buildBrowserState(): BrowserState {
  document.querySelectorAll('[data-hermes-id]').forEach(el => {
    el.removeAttribute('data-hermes-id');
  });

  const elements = extractElements();
  const pageInfo = getPageInfo();

  currentState = {
    page: pageInfo,
    elements,
    metadata: {
      extractedAt: Date.now(),
      elementCount: elements.length,
      url: window.location.href,
    },
  };

  return currentState;
}

// Handle messages from background/service worker
chrome.runtime.onMessage.addListener(
  (
    message: HermesMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ) => {
    console.log('[Hermes] Content received:', message.type);

    if (message.type === 'PING') {
      sendResponse({ type: 'PONG', source: 'content', timestamp: Date.now() });
      return true;
    }

    if (message.type === 'INSPECT_PAGE' || message.type === 'GET_STATE') {
      try {
        const state = buildBrowserState();
        console.log('[Hermes] Found', state.elements.length, 'elements');
        sendResponse({
          type: message.type,
          payload: state,
          source: 'content',
          timestamp: Date.now(),
        });
      } catch (err) {
        console.error('[Hermes] Error:', err);
        sendResponse({
          type: 'ERROR',
          payload: { message: String(err) },
          source: 'content',
          timestamp: Date.now(),
        });
      }
      return true;
    }

    if (message.type === 'EXECUTE_ACTION') {
      const actionRequest = message.payload as ActionRequest;
      executeAction(actionRequest).then(result => {
        sendResponse({
          type: message.type,
          payload: result,
          source: 'content',
          timestamp: Date.now(),
        });
      });
      return true;
    }

    return true;
  }
);

console.log('[Hermes] Content script loaded');
