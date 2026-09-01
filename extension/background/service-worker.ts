// Hermes Service Worker v7
// Routes messages, manages tabs, offscreen document, and perception pipeline

let activeTabId: number | null = null;
let sidePanelPort: chrome.runtime.Port | null = null;

// Offscreen document management
let offscreenReady = false;
let modelsInitialized = false;
const OFFSCREEN_URL = 'offscreen/index.html';

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

// Handle messages from content scripts — forward to side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.source === 'content') {
    console.log('[Hermes] Content response:', message.type);

    if (sender.tab?.id) {
      activeTabId = sender.tab.id;
    }

    if (sidePanelPort) {
      try {
        sidePanelPort.postMessage(message);
      } catch (err) {
        console.error('[Hermes] Failed to forward to side panel:', err);
      }
    }
  }

  // Handle offscreen document responses
  if (message.source === 'offscreen') {
    console.log('[Hermes] Offscreen response:', message.type);
    if (sidePanelPort) {
      try {
        sidePanelPort.postMessage(message);
      } catch (err) {
        console.error('[Hermes] Failed to forward offscreen msg:', err);
      }
    }
  }

  sendResponse({ ok: true });
});

// Handle messages from side panel
async function handleFromSidePanel(message: any, port: chrome.runtime.Port) {
  const tabId = activeTabId;
  console.log('[Hermes] From side panel:', message.type, 'tab:', tabId);

  // Handle offscreen document management
  if (message.type === 'ENSURE_OFFSCREEN') {
    try {
      await ensureOffscreen();
      console.log('[Hermes] Offscreen ready:', offscreenReady);
      port.postMessage({
        type: 'OFFSCREEN_STATUS',
        payload: { ready: offscreenReady },
        source: 'background',
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error('[Hermes] Offscreen creation failed:', err);
      port.postMessage({
        type: 'ERROR',
        payload: { message: 'Failed to create offscreen document: ' + String(err) },
        source: 'background',
        timestamp: Date.now(),
      });
    }
    return;
  }

  // Handle model initialization
  if (message.type === 'INIT_MODELS') {
    try {
      await ensureOffscreen();
      console.log('[Hermes] Sending OFFSCREEN_INIT...');
      const response = await chrome.runtime.sendMessage({
        type: 'OFFSCREEN_INIT',
      });
      console.log('[Hermes] OFFSCREEN_INIT response:', response);
      modelsInitialized = response?.ready || false;
      port.postMessage({
        type: 'MODELS_STATUS',
        payload: { ready: modelsInitialized, progress: response?.progress },
        source: 'background',
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error('[Hermes] Model init failed:', err);
      port.postMessage({
        type: 'ERROR',
        payload: { message: 'Failed to initialize models: ' + String(err) },
        source: 'background',
        timestamp: Date.now(),
      });
    }
    return;
  }

  // Handle perception requests
  if (message.type === 'PERCEIVE') {
    try {
      await ensureOffscreen();
      console.log('[Hermes] Sending OFFSCREEN_PERCEIVE...');
      const response = await chrome.runtime.sendMessage({
        type: 'OFFSCREEN_PERCEIVE',
        imageData: message.payload?.imageData,
      });
      console.log('[Hermes] OFFSCREEN_PERCEIVE response:', response?.type, response);
      port.postMessage({
        type: 'PERCEPTION_RESULT',
        payload: response,
        source: 'background',
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error('[Hermes] Perception failed:', err);
      port.postMessage({
        type: 'ERROR',
        payload: { message: 'Perception failed: ' + String(err) },
        source: 'background',
        timestamp: Date.now(),
      });
    }
    return;
  }

  // Handle OCR-only requests
  if (message.type === 'OCR') {
    try {
      await ensureOffscreen();
      console.log('[Hermes] Sending OFFSCREEN_OCR...');
      const response = await chrome.runtime.sendMessage({
        type: 'OFFSCREEN_OCR',
        imageData: message.payload?.imageData,
      });
      console.log('[Hermes] OFFSCREEN_OCR response:', response?.type, response);
      port.postMessage({
        type: 'OCR_RESULT',
        payload: response,
        source: 'background',
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error('[Hermes] OCR failed:', err);
      port.postMessage({
        type: 'ERROR',
        payload: { message: 'OCR failed: ' + String(err) },
        source: 'background',
        timestamp: Date.now(),
      });
    }
    return;
  }

  // Handle privacy sanitization requests
  if (message.type === 'SANITIZE') {
    try {
      const { runPrivacyPipeline, getPrivacySummary } = await import('../privacy/privacy-engine');
      const { setPrivacyMode } = await import('../privacy/policy');

      const browserState = message.payload?.browserState;
      const task = message.payload?.task || '';
      const mode = message.payload?.mode;

      if (!browserState) {
        port.postMessage({
          type: 'ERROR',
          payload: { message: 'SANITIZE requires browserState' },
          source: 'background',
          timestamp: Date.now(),
        });
        return;
      }

      if (mode) {
        setPrivacyMode(mode);
      }

      console.log('[Hermes] Running privacy pipeline...');
      const result = runPrivacyPipeline(browserState, task, mode);
      console.log('[Hermes] Privacy pipeline complete:', result.sanitizedState.stats);

      port.postMessage({
        type: 'SANITIZE_RESULT',
        payload: {
          sanitizedState: result.sanitizedState,
          summary: getPrivacySummary(result),
          pseudonymMap: result.pseudonymMap,
        },
        source: 'background',
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error('[Hermes] Sanitization failed:', err);
      port.postMessage({
        type: 'ERROR',
        payload: { message: 'Sanitization failed: ' + String(err) },
        source: 'background',
        timestamp: Date.now(),
      });
    }
    return;
  }

  // Handle screenshot requests
  if (message.type === 'CAPTURE_SCREENSHOT') {
    if (!tabId) {
      port.postMessage({
        type: 'ERROR',
        payload: { message: 'No active tab' },
        source: 'background',
        timestamp: Date.now(),
      });
      return;
    }

    try {
      const screenshot = await captureScreenshot(tabId);
      console.log('[Hermes] Screenshot captured, length:', screenshot.length);
      port.postMessage({
        type: 'SCREENSHOT_RESULT',
        payload: { dataUrl: screenshot },
        source: 'background',
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error('[Hermes] Screenshot failed:', err);
      port.postMessage({
        type: 'ERROR',
        payload: { message: 'Screenshot failed: ' + String(err) },
        source: 'background',
        timestamp: Date.now(),
      });
    }
    return;
  }

  // Handle tab-specific actions (forward to content script)
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

  // Forward to content script
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

// Ensure offscreen document exists
async function ensureOffscreen(): Promise<void> {
  if (offscreenReady) return;

  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });

  if (existingContexts.length > 0) {
    offscreenReady = true;
    return;
  }

  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['WORKERS' as any],
      justification: 'Model inference requires WebGPU/WASM in offscreen document',
    });
    // Wait for document to load
    await new Promise(r => setTimeout(r, 1000));
    offscreenReady = true;
    console.log('[Hermes] Offscreen document created');
  } catch (err) {
    console.error('[Hermes] Failed to create offscreen document:', err);
    throw err;
  }
}

// Capture screenshot using available methods
async function captureScreenshot(tabId: number): Promise<string> {
  // Try visible tab capture first (works for active tab)
  try {
    return await new Promise<string>((resolve, reject) => {
      chrome.tabs.captureVisibleTab(undefined as any, { format: 'png', quality: 100 }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!dataUrl) {
          reject(new Error('No screenshot'));
          return;
        }
        resolve(dataUrl);
      });
    });
  } catch {
    // Fallback to debugger API for background tabs
    try {
      await chrome.debugger.attach({ tabId }, '1.3');
      const result = await chrome.debugger.sendCommand(
        { tabId },
        'Page.captureScreenshot',
        { format: 'png', quality: 100 }
      ) as { data: string };
      await chrome.debugger.detach({ tabId });
      return `data:image/png;base64,${result.data}`;
    } catch (err) {
      throw new Error('Both screenshot methods failed: ' + String(err));
    }
  }
}

// Cleanup on startup
chrome.runtime.onStartup.addListener(() => {
  offscreenReady = false;
  modelsInitialized = false;
  console.log('[Hermes] Extension started');
});

console.log('[Hermes] Service worker v7 started');
