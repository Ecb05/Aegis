// Hermes Side Panel v5
// Uses port-based messaging with the background service worker

import type { BrowserState, HermesElement, ActionRequest } from '../../utils/messaging';

// DOM elements
const inspectBtn = document.getElementById('inspect-btn') as HTMLButtonElement;
const actionTestBtn = document.getElementById('action-test-btn') as HTMLButtonElement;
const pageInfo = document.getElementById('page-info')!;
const pageTitle = document.getElementById('page-title')!;
const pageUrl = document.getElementById('page-url')!;
const elementCount = document.getElementById('element-count')!;
const elementsPanel = document.getElementById('elements-panel')!;
const elementList = document.getElementById('element-list')!;
const actionPanel = document.getElementById('action-panel')!;
const actionSelect = document.getElementById('action-select') as HTMLSelectElement;
const targetSelect = document.getElementById('target-select') as HTMLSelectElement;
const textParamGroup = document.getElementById('text-param-group')!;
const textParam = document.getElementById('text-param') as HTMLInputElement;
const executeBtn = document.getElementById('execute-btn') as HTMLButtonElement;
const resultPanel = document.getElementById('result-panel')!;
const resultContent = document.getElementById('result-content')!;
const jsonPanel = document.getElementById('json-panel')!;
const jsonOutput = document.getElementById('json-output')!;
const status = document.getElementById('status')!;

// State
let currentState: BrowserState | null = null;

// Port-based messaging
let port: chrome.runtime.Port | null = null;
let pendingResolve: ((msg: any) => void) | null = null;
let pendingReject: ((err: Error) => void) | null = null;
let timeoutId: ReturnType<typeof setTimeout> | null = null;

function connectPort(): void {
  port = chrome.runtime.connect({ name: 'hermes-sidepanel' });

  port.onMessage.addListener((message: any) => {
    console.log('[Hermes] Side panel received:', message.type);

    // If we're waiting for a response, resolve it
    if (pendingResolve && message.type !== 'ERROR') {
      if (timeoutId) clearTimeout(timeoutId);
      const resolve = pendingResolve;
      pendingResolve = null;
      pendingReject = null;
      resolve(message);
      return;
    }

    // Handle error responses
    if (message.type === 'ERROR' && pendingReject) {
      if (timeoutId) clearTimeout(timeoutId);
      const reject = pendingReject;
      pendingResolve = null;
      pendingReject = null;
      reject(new Error(message.payload?.message || 'Unknown error'));
      return;
    }

    // Handle live PAGE_STATE updates (e.g., after action execution)
    if (message.type === 'PAGE_STATE') {
      const state = message.payload as BrowserState;
      currentState = state;
      displayState(state);
    }
  });

  port.onDisconnect.addListener(() => {
    console.log('[Hermes] Disconnected from background');
    port = null;
    setTimeout(connectPort, 500);
  });
}

connectPort();

/**
 * Send a message and wait for a response from the content script
 */
function sendAndWait(type: string, payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!port) {
      reject(new Error('Not connected to background'));
      return;
    }

    pendingResolve = resolve;
    pendingReject = reject;

    port.postMessage({
      type,
      payload,
      source: 'sidepanel',
      timestamp: Date.now(),
    });

    // 30s timeout for heavy pages
    timeoutId = setTimeout(() => {
      if (pendingResolve) {
        pendingResolve = null;
        pendingReject = null;
        reject(new Error('Message timed out (30s)'));
      }
    }, 30000);
  });
}

function setStatus(text: string, type: 'ready' | 'loading' | 'success' | 'error' = 'ready'): void {
  status.textContent = text;
  status.className = `status ${type}`;
}

function showSection(id: string, show: boolean): void {
  const el = document.getElementById(id);
  if (el) el.style.display = show ? 'block' : 'none';
}

function populateElementList(elements: HermesElement[]): void {
  elementList.innerHTML = '';

  for (const el of elements) {
    const item = document.createElement('div');
    item.className = 'element-item';
    item.dataset.id = el.id;

    const badgeClass = getBadgeClass(el.role);

    item.innerHTML = `
      <span class="element-badge ${badgeClass}">${el.role}</span>
      <span class="element-label">${escapeHtml(el.label)}</span>
      <span class="element-id">${el.id}</span>
    `;

    item.addEventListener('click', () => {
      elementList.querySelectorAll('.element-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');

      targetSelect.value = el.id;
      if (el.role === 'textbox') {
        actionSelect.value = 'type';
        textParamGroup.style.display = 'flex';
        textParam.focus();
      } else if (el.role === 'button') {
        actionSelect.value = 'click';
        textParamGroup.style.display = 'none';
      } else if (el.role === 'select') {
        actionSelect.value = 'select';
        textParamGroup.style.display = 'none';
      } else {
        actionSelect.value = 'click';
        textParamGroup.style.display = 'none';
      }
    });

    elementList.appendChild(item);
  }
}

function getBadgeClass(role: string): string {
  const map: Record<string, string> = {
    button: 'badge-button',
    textbox: 'badge-input',
    select: 'badge-select',
    link: 'badge-link',
    form: 'badge-form',
  };
  return map[role] || 'badge-other';
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function populateTargetSelect(elements: HermesElement[]): void {
  targetSelect.innerHTML = '<option value="">-- select element --</option>';
  for (const el of elements) {
    const option = document.createElement('option');
    option.value = el.id;
    option.textContent = `${el.id} (${el.label})`;
    targetSelect.appendChild(option);
  }
}

function displayState(state: BrowserState): void {
  showSection('page-info', true);
  pageTitle.textContent = state.page.title;
  pageUrl.textContent = state.page.url;
  elementCount.textContent = String(state.elements.length);

  showSection('elements-panel', true);
  populateElementList(state.elements);

  actionTestBtn.disabled = false;
  executeBtn.disabled = false;
  showSection('action-panel', true);
  populateTargetSelect(state.elements);

  showSection('json-panel', true);
  jsonOutput.textContent = JSON.stringify(state, null, 2);
}

// Inspect page
async function inspectPage(): Promise<void> {
  setStatus('Inspecting...', 'loading');
  inspectBtn.disabled = true;

  try {
    const response = await sendAndWait('INSPECT_PAGE', {});

    if (response.type === 'PAGE_STATE') {
      const state = response.payload as BrowserState;
      currentState = state;
      displayState(state);
      setStatus(`Found ${state.elements.length} elements`, 'success');
    } else {
      setStatus(`Unexpected response: ${response.type}`, 'error');
    }
  } catch (err) {
    setStatus(`Failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
  } finally {
    inspectBtn.disabled = false;
  }
}

// Execute action
async function testAction(): Promise<void> {
  if (!targetSelect.value && actionSelect.value !== 'scroll') {
    setStatus('Select a target element', 'error');
    return;
  }

  setStatus('Executing action...', 'loading');
  executeBtn.disabled = true;

  const request: ActionRequest = {
    action: actionSelect.value as ActionRequest['action'],
    target: targetSelect.value || undefined,
    params: {},
  };

  if (actionSelect.value === 'type') {
    request.params = { text: textParam.value };
  } else if (actionSelect.value === 'scroll') {
    request.params = { direction: 'down', amount: 300 };
  }

  try {
    const response = await sendAndWait('EXECUTE_ACTION', request);

    if (response.type === 'ACTION_RESULT') {
      const result = response.payload as { success: boolean; action: string; error?: string };
      showSection('result-panel', true);
      resultContent.className = `result ${result.success ? 'success' : 'error'}`;
      resultContent.textContent = result.success
        ? `✅ ${result.action} executed successfully`
        : `❌ ${result.error}`;
      setStatus(result.success ? 'Action completed' : 'Action failed', result.success ? 'success' : 'error');

      // Re-inspect after successful action
      if (result.success) {
        setTimeout(() => inspectPage(), 500);
      }
    } else {
      setStatus(`Unexpected response: ${response.type}`, 'error');
    }
  } catch (err) {
    setStatus(`Failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
  } finally {
    executeBtn.disabled = false;
  }
}

// Event listeners
inspectBtn.addEventListener('click', inspectPage);
actionTestBtn.addEventListener('click', () => {
  showSection('action-panel', !actionPanel.style.display || actionPanel.style.display === 'none');
});
executeBtn.addEventListener('click', testAction);

actionSelect.addEventListener('change', () => {
  textParamGroup.style.display = actionSelect.value === 'type' ? 'flex' : 'none';
});

console.log('[Hermes] Side panel loaded');
