// Hermes Service Worker v5
// Two message paths:
//   Side panel → port → service worker → chrome.tabs.sendMessage → content script
//   Content script → chrome.runtime.sendMessage → service worker → port → side panel

let activeTabId: number | null = null;
let sidePanelPort: chrome.runtime.Port | null = null;

// Set side panel to open on icon click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
  console.error('[Hermes] setPanelBehavior failed:', err);
});

// Track active tab
chrome.tabs.onActivated.addListener(async (info) => {
  activeTabId = info.tabId;
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    activeTabId = tabId;
  }
});

// Port connection from side panel
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'hermes-sidepanel') {
    sidePanelPort = port;
    console.log('[Hermes] Side panel connected');

    port.onDisconnect.addListener(() => {
      console.log('[Hermes] Side panel disconnected');
      sidePanelPort = null;
    });

    port.onMessage.addListener(async (message) => {
      await handleFromSidePanel(message, port);
    });
  }
});

// Handle messages FROM content scripts — forward to side panel via port
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.source === 'content') {
    console.log('[Hermes] Content response:', message.type);

    // Update active tab from content script sender
    if (sender.tab?.id) {
      activeTabId = sender.tab.id;
    }

    // Forward to side panel
    if (sidePanelPort) {
      try {
        sidePanelPort.postMessage(message);
      } catch (err) {
        console.error('[Hermes] Failed to forward to side panel:', err);
      }
    }
  }
  sendResponse({ ok: true });
});

// Handle messages FROM side panel — forward to content script
async function handleFromSidePanel(message: any, port: chrome.runtime.Port) {
  const tabId = activeTabId;
  console.log('[Hermes] From side panel:', message.type, 'tab:', tabId);

  if (!tabId) {
    port.postMessage({
      type: 'ERROR',
      payload: { message: 'No active tab — click the Hermes icon on a tab first' },
      source: 'background',
      timestamp: Date.now(),
    });
    return;
  }

  // Ensure content script is injected
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PING' });
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content/content.js'] });
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      port.postMessage({
        type: 'ERROR',
        payload: { message: 'Could not inject content script: ' + String(err) },
        source: 'background',
        timestamp: Date.now(),
      });
      return;
    }
  }

  // Forward the message to the content script (don't await response — content script sends it back separately)
  try {
    chrome.tabs.sendMessage(tabId, message).catch(err => {
      console.error('[Hermes] Send to content failed:', err);
      port.postMessage({
        type: 'ERROR',
        payload: { message: String(err) },
        source: 'background',
        timestamp: Date.now(),
      });
    });
  } catch (err) {
    port.postMessage({
      type: 'ERROR',
      payload: { message: String(err) },
      source: 'background',
      timestamp: Date.now(),
    });
  }
}

console.log('[Hermes] Service worker v5 started');
