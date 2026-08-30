// Hermes Service Worker

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

// Port-based messaging with side panel
chrome.runtime.onConnect.addListener((port) => {
  console.log('[Hermes] Port connected:', port.name);
  if (port.name === 'hermes-sidepanel') {
    sidePanelPort = port;
    port.onDisconnect.addListener(() => {
      sidePanelPort = null;
    });
    port.onMessage.addListener(async (message) => {
      await handleFromSidePanel(message, port);
    });
  }
});

// Handle messages from content scripts (backup path)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.source === 'content') {
    console.log('[Hermes] Content message:', message.type);
    if (sender.tab?.id) activeTabId = sender.tab.id;

    // Forward to side panel via port
    if (sidePanelPort) {
      try {
        sidePanelPort.postMessage(message);
        console.log('[Hermes] Forwarded to side panel');
      } catch (err) {
        console.error('[Hermes] Failed to forward to side panel:', err);
      }
    }
  }
  try { sendResponse({ received: true }); } catch {}
});

async function handleFromSidePanel(message: any, port: chrome.runtime.Port) {
  const tabId = activeTabId;
  console.log('[Hermes] Handling from side panel:', message.type, 'tabId:', tabId);

  if (!tabId) {
    port.postMessage({ type: 'ERROR', payload: { message: 'No active tab' }, source: 'background', timestamp: Date.now() });
    return;
  }

  // Inject content script if needed
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    console.log('[Hermes] Content script already injected');
  } catch {
    console.log('[Hermes] Injecting content script...');
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content/content.js'] });
      await new Promise(r => setTimeout(r, 300));
      console.log('[Hermes] Content script injected');
    } catch (err) {
      console.error('[Hermes] Injection failed:', err);
      port.postMessage({ type: 'ERROR', payload: { message: 'Could not inject script' }, source: 'background', timestamp: Date.now() });
      return;
    }
  }

  try {
    console.log('[Hermes] Sending to content:', message.type);
    const response = await chrome.tabs.sendMessage(tabId, message);
    console.log('[Hermes] Got response from content:', response?.type);
    port.postMessage(response);
  } catch (err) {
    console.error('[Hermes] Content script error:', err);
    port.postMessage({ type: 'ERROR', payload: { message: String(err) }, source: 'background', timestamp: Date.now() });
  }
}

console.log('[Hermes] Service worker started v4');
