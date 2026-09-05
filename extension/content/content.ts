// Hermes Content Script

import { extractElements, getPageInfo } from './dom-parser';
import { enrichWithContext } from './context-enricher';
import { registerElements } from './element-registry';
import { executeAction } from './action-executor';
import type { BrowserState, HermesMessage, ActionRequest } from '../utils/messaging';

let currentState: BrowserState | null = null;

function buildBrowserState(): BrowserState {
  document.querySelectorAll('[data-hermes-id]').forEach(el => {
    el.removeAttribute('data-hermes-id');
  });

  const elements = extractElements();
  const pageInfo = getPageInfo();

  // Stage A: disambiguate duplicated controls with the context of the card /
  // content group they belong to (Netflix "play" buttons → which movie).
  enrichWithContext(elements);
  // Remember what each element was so actions can still find it after an SPA
  // re-render drops its id stamp — without falling back to "first one wins".
  registerElements(elements);

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

    // For INSPECT_PAGE / GET_STATE: extract and send back via sendResponse
    if (message.type === 'INSPECT_PAGE' || message.type === 'GET_STATE') {
      console.log('[Hermes] Content: processing INSPECT_PAGE...');
      try {
        const state = buildBrowserState();
        console.log('[Hermes] Content: found', state.elements.length, 'elements, sending PAGE_STATE');
        const response: HermesMessage = {
          type: 'PAGE_STATE',
          payload: state,
          source: 'content',
          timestamp: Date.now(),
        };
        sendResponse(response);
        console.log('[Hermes] Content: sendResponse called successfully');
      } catch (err) {
        console.error('[Hermes] Content: INSPECT_PAGE error:', err);
        const response: HermesMessage = {
          type: 'ERROR',
          payload: { message: 'Content script error: ' + String(err) },
          source: 'content',
          timestamp: Date.now(),
        };
        sendResponse(response);
      }
      return true;
    }

    // For EXECUTE_ACTION: async — respond via sendResponse and keep the
    // channel open so chrome.tabs.sendMessage resolves with the result.
    if (message.type === 'EXECUTE_ACTION') {
      const actionRequest = message.payload as ActionRequest;
      executeAction(actionRequest)
        .then(result => {
          const response: HermesMessage = {
            type: 'ACTION_RESULT',
            payload: result,
            source: 'content',
            timestamp: Date.now(),
          };
          sendResponse(response);
        })
        .catch(err => {
          const response: HermesMessage = {
            type: 'ERROR',
            payload: { message: String(err) },
            source: 'content',
            timestamp: Date.now(),
          };
          sendResponse(response);
        });
      // Keep the message channel open until the async action completes
      return true;
    }

    return false;
  }
);

console.log('[Hermes] Content script loaded');
