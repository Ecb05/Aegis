// Hermes Content Script

import { extractElements, getPageInfo } from './dom-parser';
import { executeAction } from './action-executor';
import type { BrowserState, HermesMessage, ActionRequest } from '../utils/messaging';

let currentState: BrowserState | null = null;

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

// Single message handler — responds via chrome.runtime.sendMessage (reliable in MV3)
chrome.runtime.onMessage.addListener(
  (
    message: HermesMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ) => {
    console.log('[Hermes] Content received:', message.type);

    // Always respond to PING immediately
    if (message.type === 'PING') {
      sendResponse({ type: 'PONG', source: 'content', timestamp: Date.now() });
      return false;
    }

    // For INSPECT_PAGE / GET_STATE: extract and send back via runtime.sendMessage
    if (message.type === 'INSPECT_PAGE' || message.type === 'GET_STATE') {
      try {
        const state = buildBrowserState();
        console.log('[Hermes] Found', state.elements.length, 'elements');
        const response: HermesMessage = {
          type: 'PAGE_STATE',
          payload: state,
          source: 'content',
          timestamp: Date.now(),
        };
        // Send via both paths for reliability
        sendResponse(response);
        chrome.runtime.sendMessage(response).catch(() => {});
      } catch (err) {
        console.error('[Hermes] Error:', err);
        const response: HermesMessage = {
          type: 'ERROR',
          payload: { message: String(err) },
          source: 'content',
          timestamp: Date.now(),
        };
        sendResponse(response);
        chrome.runtime.sendMessage(response).catch(() => {});
      }
      return true;
    }

    // For EXECUTE_ACTION: async — send result via runtime.sendMessage
    if (message.type === 'EXECUTE_ACTION') {
      const actionRequest = message.payload as ActionRequest;
      executeAction(actionRequest).then(result => {
        const response: HermesMessage = {
          type: 'ACTION_RESULT',
          payload: result,
          source: 'content',
          timestamp: Date.now(),
        };
        chrome.runtime.sendMessage(response).catch(() => {});
      }).catch(err => {
        const response: HermesMessage = {
          type: 'ERROR',
          payload: { message: String(err) },
          source: 'content',
          timestamp: Date.now(),
        };
        chrome.runtime.sendMessage(response).catch(() => {});
      });
      // Return false — we're not using sendResponse for async
      return false;
    }

    return false;
  }
);

console.log('[Hermes] Content script loaded');
