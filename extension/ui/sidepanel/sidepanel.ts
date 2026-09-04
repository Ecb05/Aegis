// Hermes Side Panel v8
// DOM + Vision perception with real IoU fusion

import type { BrowserState, HermesElement, ActionRequest, DetectedElement, BoundingBox } from '../../utils/messaging';

// DOM elements
const inspectBtn = document.getElementById('inspect-btn') as HTMLButtonElement;
const perceiveBtn = document.getElementById('perceive-btn') as HTMLButtonElement;
const fuseBtn = document.getElementById('fuse-btn') as HTMLButtonElement;
const pageInfo = document.getElementById('page-info')!;
const pageTitle = document.getElementById('page-title')!;
const pageUrl = document.getElementById('page-url')!;
const elementCount = document.getElementById('element-count')!;
const perceptionPanel = document.getElementById('perception-panel')!;
const perceptionDevice = document.getElementById('perception-device')!;
const pageClassification = document.getElementById('page-classification')!;
const visionElementCount = document.getElementById('vision-element-count')!;
const fusedCount = document.getElementById('fused-count')!;
const perceptionLatency = document.getElementById('perception-latency')!;
const ocrPanel = document.getElementById('ocr-panel')!;
const ocrBlockCount = document.getElementById('ocr-block-count')!;
const ocrConfidence = document.getElementById('ocr-confidence')!;
const ocrTextOutput = document.getElementById('ocr-text-output')!;
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
let currentPerception: any = null;
let fusedElements: HermesElement[] = [];

// Port-based messaging
let port: chrome.runtime.Port | null = null;
let pendingResolve: ((msg: any) => void) | null = null;
let pendingReject: ((err: Error) => void) | null = null;
let timeoutId: ReturnType<typeof setTimeout> | null = null;

function connectPort(): void {
  port = chrome.runtime.connect({ name: 'hermes-sidepanel' });

  port.onMessage.addListener((message: any) => {
    console.log('[Hermes] Side panel received:', message.type);

    // PAGE_STATE is the response to INSPECT_PAGE — always display it,
    // then fall through so the pending request gets resolved.
    if (message.type === 'PAGE_STATE') {
      const state = message.payload as BrowserState;
      currentState = state;
      displayState(state);
    }

    if (pendingResolve) {
      if (timeoutId) clearTimeout(timeoutId);
      const resolve = pendingResolve;
      const rejectFn = pendingReject;
      pendingResolve = null;
      pendingReject = null;

      if (message.type === 'ERROR') {
        rejectFn?.(new Error(message.payload?.message || 'Unknown error'));
      } else {
        resolve(message);
      }
    }
  });

  port.onDisconnect.addListener(() => {
    console.log('[Hermes] Disconnected from background');
    port = null;
    // Fail any pending request so the caller knows the connection dropped
    if (pendingReject) {
      if (timeoutId) clearTimeout(timeoutId);
      const rejectFn = pendingReject;
      pendingResolve = null;
      pendingReject = null;
      rejectFn(new Error('Connection to background lost — retrying...'));
    }
    setTimeout(connectPort, 1000);
  });
}

function reject(err: Error): void {
  if (pendingReject) {
    const rejectFn = pendingReject;
    pendingResolve = null;
    pendingReject = null;
    rejectFn(err);
  }
}

connectPort();

function sendAndWait(type: string, payload: any, timeoutMs: number = 60000): Promise<any> {
  return new Promise((resolve, reject) => {
    // Auto-reconnect if port is dead
    if (!port) {
      try {
        connectPort();
      } catch {
        reject(new Error('Could not connect to background'));
        return;
      }
    }

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

    timeoutId = setTimeout(() => {
      if (pendingResolve) {
        pendingResolve = null;
        pendingReject = null;
        reject(new Error(`Message timed out (${timeoutMs / 1000}s)`));
      }
    }, timeoutMs);
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

// ─── IoU Fusion ──────────────────────────────────────────────

function calculateIoU(a: BoundingBox, b: BoundingBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x1 || y2 <= y1) return 0;
  const intersection = (x2 - x1) * (y2 - y1);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

function fuseWithIoU(domElements: HermesElement[], visionElements: DetectedElement[]): HermesElement[] {
  const result: HermesElement[] = [];
  const matchedVision = new Set<number>();

  // For each DOM element, find best matching vision detection
  for (const domEl of domElements) {
    if (!domEl.bbox) {
      result.push({ ...domEl, sources: ['dom'] });
      continue;
    }

    let bestIoU = 0;
    let bestIdx = -1;

    for (let i = 0; i < visionElements.length; i++) {
      if (matchedVision.has(i)) continue;
      const vis = visionElements[i];
      if (!vis.bbox) continue;

      // Convert vision bbox (xmin,ymin,xmax,ymax) to (x,y,w,h) for comparison
      const visBox: BoundingBox = {
        x: vis.bbox.x,
        y: vis.bbox.y,
        width: vis.bbox.width || (vis.bbox as any).xmax - vis.bbox.x,
        height: vis.bbox.height || (vis.bbox as any).ymax - vis.bbox.y,
      };

      const iou = calculateIoU(domEl.bbox, visBox);
      if (iou > bestIoU) {
        bestIoU = iou;
        bestIdx = i;
      }
    }

    if (bestIoU > 0.2 && bestIdx >= 0) {
      // Matched — merge DOM structure with vision confidence
      matchedVision.add(bestIdx);
      const vis = visionElements[bestIdx];
      result.push({
        ...domEl,
        sources: ['dom', 'vision'],
        confidence: bestIoU,
        attributes: {
          ...domEl.attributes,
          vision_label: vis.label,
          vision_score: String(vis.score),
          iou: String(bestIoU.toFixed(3)),
        },
      });
    } else {
      // No match — DOM only
      result.push({ ...domEl, sources: ['dom'] });
    }
  }

  // Add unmatched vision elements
  for (let i = 0; i < visionElements.length; i++) {
    if (matchedVision.has(i)) continue;
    const vis = visionElements[i];
    result.push({
      id: `vision_${i}`,
      role: 'other',
      label: vis.label,
      tag: 'div',
      bbox: vis.bbox,
      visible: true,
      sensitive: false,
      sources: ['vision'],
      confidence: vis.score,
      attributes: { vision_score: String(vis.score) },
    });
  }

  return result;
}

// ─── UI Rendering ────────────────────────────────────────────

function populateElementList(elements: HermesElement[]): void {
  elementList.innerHTML = '';

  for (const el of elements) {
    const item = document.createElement('div');
    item.className = 'element-item';
    item.dataset.id = el.id;

    const badgeClass = getBadgeClass(el.role);
    const sources = (el as any).sources?.join('+') || '';
    const iou = el.attributes?.iou ? ` IoU:${el.attributes.iou}` : '';

    item.innerHTML = `
      <span class="element-badge ${badgeClass}">${el.role}</span>
      <span class="element-label">${escapeHtml(el.label)}</span>
      ${sources ? `<span class="element-id" style="color:#64b5f6">${sources}</span>` : ''}
      ${iou ? `<span class="element-id" style="color:#66bb6a">${iou}</span>` : ''}
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

  actionPanel.classList.remove('hidden');
  executeBtn.disabled = false;
  showSection('action-panel', true);
  populateTargetSelect(state.elements);

  showSection('json-panel', true);
  jsonOutput.textContent = JSON.stringify(state, null, 2);
}

function displayPerception(perception: any): void {
  showSection('perception-panel', true);

  // Device info
  if (perception.device) {
    perceptionDevice.textContent = perception.device === 'webgpu' ? '🟢 WebGPU' : '🟡 WASM';
  }

  // Latency
  if (perception.elapsed) {
    perceptionLatency.textContent = `${perception.elapsed}ms`;
  }

  // Classification
  if (perception.classification?.predictions) {
    const top = perception.classification.predictions[0];
    pageClassification.textContent = top ? `${top.label} (${(top.score * 100).toFixed(1)}%)` : '—';
  } else if (perception.classification?.error) {
    pageClassification.textContent = `Error: ${perception.classification.error}`;
  }

  // Vision detection
  if (perception.detection?.elements) {
    visionElementCount.textContent = String(perception.detection.elements.length);
  } else if (perception.detection?.error) {
    visionElementCount.textContent = `Error: ${perception.detection.error}`;
  }

  // OCR results
  if (perception.ocr && !perception.ocr.error) {
    showSection('ocr-panel', true);
    const ocrData = perception.ocr;
    ocrBlockCount.textContent = String(ocrData.textBlocks?.length || 0);
    ocrConfidence.textContent = ocrData.confidence ? `${(ocrData.confidence * 100).toFixed(1)}%` : '—';
    
    if (ocrData.textBlocks?.length > 0) {
      ocrTextOutput.innerHTML = ocrData.textBlocks
        .filter((b: any) => b.text.trim())
        .map((b: any) => `<div class="ocr-block"><span class="ocr-text">${escapeHtml(b.text)}</span> <span class="ocr-conf">${(b.confidence * 100).toFixed(0)}%</span></div>`)
        .join('');
    } else {
      ocrTextOutput.textContent = 'No text detected';
    }
  } else if (perception.ocr?.error) {
    showSection('ocr-panel', true);
    ocrBlockCount.textContent = 'Error';
    ocrConfidence.textContent = perception.ocr.error;
  }
}

function displayFused(elements: HermesElement[]): void {
  fusedCount.textContent = String(elements.length);

  showSection('elements-panel', true);
  populateElementList(elements);

  populateTargetSelect(elements);

  jsonOutput.textContent = JSON.stringify(elements, null, 2);
}

// ─── Actions ─────────────────────────────────────────────────

async function inspectPage(): Promise<void> {
  setStatus('Inspecting...', 'loading');
  inspectBtn.disabled = true;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (attempt > 1) {
        setStatus(`Retry ${attempt}/3...`, 'loading');
        await autoSleep(1000 * attempt);
      }
      const response = await sendAndWait('INSPECT_PAGE', {}, 30000);
      if (response.type === 'PAGE_STATE') {
        const state = response.payload as BrowserState;
        currentState = state;
        displayState(state);
        setStatus(`Found ${state.elements.length} DOM elements`, 'success');
        inspectBtn.disabled = false;
        return;
      } else {
        setStatus(`Unexpected response: ${response.type}`, 'loading');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < 3) {
        setStatus(`Attempt ${attempt} failed: ${msg} — retrying...`, 'loading');
      } else {
        setStatus(`Inspect failed after 3 attempts: ${msg}`, 'error');
      }
    }
  }
  inspectBtn.disabled = false;
}

async function perceivePage(): Promise<void> {
  perceiveBtn.disabled = true;

  try {
    setStatus('Creating offscreen document...', 'loading');
    await sendAndWait('ENSURE_OFFSCREEN', {}, 10000);

    setStatus('Loading vision models (first time is slow)...', 'loading');
    await sendAndWait('INIT_MODELS', {}, 120000);

    setStatus('Capturing screenshot...', 'loading');
    const screenshotResp = await sendAndWait('CAPTURE_SCREENSHOT', {}, 15000);
    const imageData = screenshotResp.payload?.dataUrl;
    if (!imageData) throw new Error('No screenshot captured');

    setStatus('Running vision models...', 'loading');
    const perceptionResp = await sendAndWait('PERCEIVE', { imageData }, 60000);

    if (perceptionResp.type === 'PERCEPTION_RESULT' || perceptionResp.type === 'PERCEIVE') {
      currentPerception = perceptionResp.payload;
      displayPerception(perceptionResp.payload);
      setStatus('Perception complete — now click Fuse', 'success');
    } else if (perceptionResp.type === 'ERROR') {
      throw new Error(perceptionResp.payload?.message || 'Perception failed');
    } else {
      currentPerception = perceptionResp.payload || perceptionResp;
      displayPerception(currentPerception);
      setStatus('Perception complete — now click Fuse', 'success');
    }
  } catch (err) {
    setStatus(`Perception failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
  } finally {
    perceiveBtn.disabled = false;
  }
}

async function fusePerceptions(): Promise<void> {
  if (!currentState) {
    setStatus('Run Inspect first', 'error');
    return;
  }

  if (!currentPerception?.detection?.elements) {
    setStatus('Run Perceive first', 'error');
    return;
  }

  setStatus('Fusing DOM + Vision via IoU...', 'loading');
  fuseBtn.disabled = true;

  try {
    const domElements = currentState.elements;
    const visionElements = currentPerception.detection.elements;

    fusedElements = fuseWithIoU(domElements, visionElements);

    const matchCount = fusedElements.filter(e => (e as any).sources?.includes('vision')).length;
    const domOnly = fusedElements.filter(e => (e as any).sources?.length === 1 && (e as any).sources[0] === 'dom').length;
    const visionOnly = fusedElements.filter(e => (e as any).sources?.length === 1 && (e as any).sources[0] === 'vision').length;

    displayFused(fusedElements);

    setStatus(
      `Fused: ${matchCount} matched, ${domOnly} DOM-only, ${visionOnly} Vision-only (${fusedElements.length} total)`,
      'success'
    );
  } catch (err) {
    setStatus(`Fusion failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
  } finally {
    fuseBtn.disabled = false;
  }
}

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
perceiveBtn.addEventListener('click', perceivePage);
fuseBtn.addEventListener('click', fusePerceptions);
executeBtn.addEventListener('click', testAction);

actionSelect.addEventListener('change', () => {
  textParamGroup.style.display = actionSelect.value === 'type' ? 'flex' : 'none';
});

// ─── Privacy / Sanitize ─────────────────────────────────────

const sanitizeBtn = document.getElementById('sanitize-btn') as HTMLButtonElement;
const privacyModeSelect = document.getElementById('privacy-mode-select') as HTMLSelectElement;
const taskInput = document.getElementById('task-input') as HTMLInputElement;
const privacyPanel = document.getElementById('privacy-panel')!;
const privacyTotal = document.getElementById('privacy-total')!;
const privacyPassed = document.getElementById('privacy-passed')!;
const privacyPseudonymized = document.getElementById('privacy-pseudonymized')!;
const privacyRedacted = document.getElementById('privacy-redacted')!;
const privacyOmitted = document.getElementById('privacy-omitted')!;
const privacyProtected = document.getElementById('privacy-protected')!;
const pseudonymMapEl = document.getElementById('pseudonym-map')!;
const sanitizedElementsEl = document.getElementById('sanitized-elements')!;

sanitizeBtn.addEventListener('click', async () => {
  if (!currentState) {
    setStatus('No page state — inspect first', 'error');
    return;
  }

  const task = taskInput.value || 'General browsing';
  const mode = privacyModeSelect.value as 'standard' | 'strict' | 'local-only';

  setStatus('Sanitizing...', 'loading');
  sanitizeBtn.disabled = true;

  try {
    const response = await sendAndWait('SANITIZE', {
      browserState: currentState,
      task,
      mode,
    }, 30000);

    const result = response.payload;
    displayPrivacyResults(result);
    setStatus('Sanitized', 'success');
  } catch (err) {
    console.error('[Hermes] Sanitize failed:', err);
    setStatus(`Sanitize failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
  } finally {
    sanitizeBtn.disabled = false;
  }
});

function displayPrivacyResults(result: any): void {
  const { sanitizedState, pseudonymMap } = result;
  const { stats, elements } = sanitizedState;

  // Show privacy panel
  showSection('privacy-panel', true);

  // Update stats
  privacyTotal.textContent = String(stats.total);
  privacyPassed.textContent = String(stats.passed);
  privacyPseudonymized.textContent = String(stats.pseudonymized);
  privacyRedacted.textContent = String(stats.redacted);
  privacyOmitted.textContent = String(stats.omitted);
  privacyProtected.textContent = String(stats.protected);

  // Show pseudonym map
  pseudonymMapEl.innerHTML = '';
  if (pseudonymMap && pseudonymMap.length > 0) {
    const title = document.createElement('div');
    title.style.fontWeight = '600';
    title.style.marginBottom = '4px';
    title.textContent = 'Pseudonym Map:';
    pseudonymMapEl.appendChild(title);

    for (const entry of pseudonymMap) {
      const row = document.createElement('div');
      row.className = 'pseudonym-entry';
      row.innerHTML = `<span class="pseudonym-token">${entry.token}</span><span class="pseudonym-type">${entry.type}</span>`;
      pseudonymMapEl.appendChild(row);
    }
  }

  // Show sanitized elements
  sanitizedElementsEl.innerHTML = '';
  for (const el of elements) {
    const row = document.createElement('div');
    row.className = 'sanitized-element';

    const treatmentClass = `treatment-${el.treatment}`;
    const valueDisplay = el.value ? el.value : (el.status ? `[${el.status}]` : '—');

    row.innerHTML = `
      <span class="elem-id">${el.id}</span>
      <span class="elem-label" title="${el.label}">${el.label}</span>
      <span class="treatment-badge ${treatmentClass}">${el.treatment}</span>
    `;

    // Add value as tooltip
    if (el.value) {
      row.title = `Value: ${el.value}\nType: ${el.originalDataType}\nSensitivity: ${el.sensitivity}\nRelevance: ${el.relevance}`;
    }

    sanitizedElementsEl.appendChild(row);
  }
}

// ─── Run Agent (Call Server) ──────────────────────────────

const runAgentBtn = document.getElementById('run-agent-btn') as HTMLButtonElement;
const executeAgentBtn = document.getElementById('execute-agent-btn') as HTMLButtonElement;
const agentPanel = document.getElementById('agent-panel')!;
const agentAction = document.getElementById('agent-action')!;
const agentTarget = document.getElementById('agent-target')!;
const agentParams = document.getElementById('agent-params')!;
const agentReasoning = document.getElementById('agent-reasoning')!;
const agentDone = document.getElementById('agent-done')!;
const agentSession = document.getElementById('agent-session')!;

let lastAgentAction: any = null;

runAgentBtn.addEventListener('click', async () => {
  if (!currentState) {
    setStatus('No page state — inspect first', 'error');
    return;
  }

  const task = taskInput.value || 'General browsing';
  const mode = privacyModeSelect.value as 'standard' | 'strict' | 'local-only';

  setStatus('Sanitizing + calling server...', 'loading');
  runAgentBtn.disabled = true;

  try {
    // Step 1: Sanitize
    const sanitizeResponse = await sendAndWait('SANITIZE', {
      browserState: currentState,
      task,
      mode,
    }, 30000);

    const sanitizedState = sanitizeResponse.payload.sanitizedState;
    displayPrivacyResults(sanitizeResponse.payload);

    // Show the exact payload being sent to the server
    const payloadPanel = document.getElementById('payload-panel')!;
    const payloadOutput = document.getElementById('payload-output')!;
    showSection('payload-panel', true);
    payloadOutput.textContent = JSON.stringify({ sanitizedState, task, step: 0 }, null, 2);

    // Step 2: Call server
    const serverUrl = 'http://localhost:8000';
    const stepResponse = await fetch(`${serverUrl}/agent/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sanitizedState,
        task,
        step: 0,
      }),
    });

    if (!stepResponse.ok) {
      throw new Error(`Server returned ${stepResponse.status}: ${await stepResponse.text()}`);
    }

    const agentResult = await stepResponse.json();
    lastAgentAction = agentResult;

    // Display agent response
    showSection('agent-panel', true);
    agentAction.textContent = agentResult.action?.action || '—';
    agentTarget.textContent = agentResult.action?.target || '—';
    agentParams.textContent = agentResult.action?.params
      ? JSON.stringify(agentResult.action.params)
      : '—';
    agentReasoning.textContent = agentResult.reasoning || '—';
    agentDone.textContent = agentResult.done ? '✅ Yes' : '❌ No';
    agentSession.textContent = agentResult.sessionId || '—';

    setStatus('Agent responded', 'success');
  } catch (err) {
    console.error('[Hermes] Agent failed:', err);
    setStatus(`Agent failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
  } finally {
    runAgentBtn.disabled = false;
  }
});

// Execute the action returned by the server
executeAgentBtn.addEventListener('click', async () => {
  if (!lastAgentAction?.action) {
    setStatus('No action to execute', 'error');
    return;
  }

  const action = lastAgentAction.action;
  setStatus(`Executing: ${action.action}...`, 'loading');
  executeAgentBtn.disabled = true;

  try {
    const response = await sendAndWait('EXECUTE_ACTION', {
      action: action.action,
      target: action.target,
      params: action.params,
    }, 30000);

    const result = response.payload;
    if (result.success) {
      setStatus(`Executed: ${action.action}`, 'success');
      // Re-inspect after action
      setTimeout(() => inspectPage(), 1000);
    } else {
      setStatus(`Failed: ${result.error}`, 'error');
    }
  } catch (err) {
    setStatus(`Execute failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
  } finally {
    executeAgentBtn.disabled = false;
  }
});

// ─── Autonomous Agent Loop ──────────────────────────────

const autoStartBtn = document.getElementById('auto-start-btn') as HTMLButtonElement;
const autoStopBtn = document.getElementById('auto-stop-btn') as HTMLButtonElement;
const autoStepNum = document.getElementById('auto-step-num')!;
const autoMaxSteps = document.getElementById('auto-max-steps') as HTMLInputElement;
const autoLog = document.getElementById('auto-log')!;

let autoRunning = false;
let autoAbortController: AbortController | null = null;
let autoSessionId: string | null = null;

function addAutoLog(
  step: number,
  type: 'inspect' | 'sanitize' | 'plan' | 'execute' | 'done' | 'error',
  text: string,
  reasoning?: string
): void {
  const entry = document.createElement('div');
  entry.className = `auto-log-entry step-${type}`;
  entry.innerHTML = `
    <span class="auto-log-num">${step}</span>
    <div class="auto-log-text">
      <div class="auto-log-action">${escapeHtml(text)}</div>
      ${reasoning ? `<div class="auto-log-reasoning">${escapeHtml(reasoning)}</div>` : ''}
    </div>
  `;
  autoLog.appendChild(entry);
  autoLog.scrollTop = autoLog.scrollHeight;
}

function setAutoRunning(running: boolean): void {
  autoRunning = running;
  autoStartBtn.classList.toggle('hidden', running);
  autoStopBtn.classList.toggle('hidden', !running);
  autoStartBtn.disabled = running;
  autoStopBtn.disabled = !running;
  inspectBtn.disabled = running;
  perceiveBtn.disabled = running;
  fuseBtn.disabled = running;
  sanitizeBtn.disabled = running;
  runAgentBtn.disabled = running;
  executeBtn.disabled = running;
  executeAgentBtn.disabled = running;
}

async function autoSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runAutoLoop(): Promise<void> {
  const maxSteps = parseInt(autoMaxSteps.value, 10) || 10;
  const task = taskInput.value || 'General browsing';
  const mode = privacyModeSelect.value as 'standard' | 'strict' | 'local-only';

  setAutoRunning(true);
  autoLog.innerHTML = '';
  autoSessionId = null;
  autoStepNum.textContent = '0';

  addAutoLog(0, 'plan', `Starting autonomous loop: "${task}"`, `Max ${maxSteps} steps, mode: ${mode}`);

  const serverUrl = 'http://localhost:8000';
  let lastActionResult: any = null;

  for (let step = 0; step < maxSteps && autoRunning; step++) {
    autoStepNum.textContent = String(step + 1);

    // ─── Step 1: Inspect ───────────────────────
    addAutoLog(step + 1, 'inspect', 'Inspecting page...');

    let inspected = false;
    for (let retry = 0; retry < 3 && autoRunning; retry++) {
      try {
        if (retry > 0) {
          addAutoLog(step + 1, 'inspect', `Retry ${retry}/3...`);
          await autoSleep(1000 * retry);
        }
        const inspectResp = await sendAndWait('INSPECT_PAGE', {}, 30000);
        if (inspectResp.type !== 'PAGE_STATE') {
          addAutoLog(step + 1, 'error', `Inspect got unexpected response: ${inspectResp.type}`);
          continue;
        }
        currentState = inspectResp.payload as BrowserState;
        displayState(currentState);
        addAutoLog(step + 1, 'inspect', `Found ${currentState.elements.length} elements`);
        inspected = true;
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (retry < 2) {
          addAutoLog(step + 1, 'inspect', `Attempt ${retry + 1} failed: ${msg} — retrying...`);
        } else {
          addAutoLog(step + 1, 'error', `Inspect failed after 3 attempts: ${msg}`);
        }
      }
    }
    if (!inspected) break;

    if (!autoRunning) break;

    // ─── Step 2: Sanitize ──────────────────────
    addAutoLog(step + 1, 'sanitize', 'Sanitizing...');

    let sanitizedState: any;
    try {
      const sanitizeResp = await sendAndWait('SANITIZE', {
        browserState: currentState,
        task,
        mode,
      }, 30000);
      sanitizedState = sanitizeResp.payload.sanitizedState;
      displayPrivacyResults(sanitizeResp.payload);
      addAutoLog(step + 1, 'sanitize', `Stats: ${sanitizedState.stats.passed} pass, ${sanitizedState.stats.pseudonymized} pseudo, ${sanitizedState.stats.redacted} redact`);
    } catch (err) {
      addAutoLog(step + 1, 'error', `Sanitize failed: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }

    if (!autoRunning) break;

    // ─── Step 3: Call Server ────────────────────
    addAutoLog(step + 1, 'plan', 'Calling server...');

    let agentResult: any;
    try {
      const stepResponse = await fetch(`${serverUrl}/agent/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sanitizedState,
          task,
          step,
          lastAction: lastActionResult,
          sessionId: autoSessionId,
        }),
      });

      if (!stepResponse.ok) {
        throw new Error(`Server ${stepResponse.status}: ${await stepResponse.text()}`);
      }

      agentResult = await stepResponse.json();
      autoSessionId = agentResult.sessionId;
      lastActionResult = null; // Reset for next step

      addAutoLog(
        step + 1,
        'plan',
        `Action: ${agentResult.action?.action} → ${agentResult.action?.target || 'none'}`,
        agentResult.reasoning
      );

      // Update agent panel
      showSection('agent-panel', true);
      agentAction.textContent = agentResult.action?.action || '—';
      agentTarget.textContent = agentResult.action?.target || '—';
      agentParams.textContent = agentResult.action?.params ? JSON.stringify(agentResult.action.params) : '—';
      agentReasoning.textContent = agentResult.reasoning || '—';
      agentDone.textContent = agentResult.done ? '✅ Yes' : '❌ No';
      agentSession.textContent = agentResult.sessionId || '—';
    } catch (err) {
      addAutoLog(step + 1, 'error', `Server call failed: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }

    // Check if done
    if (agentResult.done) {
      addAutoLog(step + 1, 'done', `✅ Task complete: ${agentResult.message || 'Done'}`);
      setStatus('Task complete!', 'success');
      break;
    }

    if (!autoRunning) break;

    // ─── Step 4: Execute ───────────────────────
    const action = agentResult.action;
    if (!action?.action) {
      addAutoLog(step + 1, 'error', 'No action returned from server');
      break;
    }

    addAutoLog(step + 1, 'execute', `Executing: ${action.action}${action.target ? ' → ' + action.target : ''}`);

    try {
      const execResp = await sendAndWait('EXECUTE_ACTION', {
        action: action.action,
        target: action.target,
        params: action.params,
      }, 30000);

      const execResult = execResp.payload;
      lastActionResult = {
        success: execResult.success,
        action: action.action,
        target: action.target,
        error: execResult.error,
        timestamp: execResult.timestamp || Date.now(),
      };

      if (execResult.success) {
        addAutoLog(step + 1, 'execute', `✅ ${action.action} succeeded`);
      } else {
        addAutoLog(step + 1, 'error', `❌ ${action.action} failed: ${execResult.error}`);
      }
    } catch (err) {
      addAutoLog(step + 1, 'error', `Execute failed: ${err instanceof Error ? err.message : String(err)}`);
      lastActionResult = { success: false, action: action.action, target: action.target, error: String(err), timestamp: Date.now() };
    }

    if (!autoRunning) break;

    // Wait for page to settle
    await autoSleep(1500);
  }

  if (autoRunning) {
    // Loop finished naturally (max steps or done)
    const finalStep = parseInt(autoStepNum.textContent || '0', 10);
    addAutoLog(finalStep, 'done', 'Loop finished');
  }

  setAutoRunning(false);
}

autoStartBtn.addEventListener('click', () => {
  runAutoLoop();
});

autoStopBtn.addEventListener('click', () => {
  autoRunning = false;
  addAutoLog(0, 'error', '⏹ Stopped by user');
  setAutoRunning(false);
  setStatus('Auto mode stopped', 'error');
});

console.log('[Hermes] Side panel v8 loaded');
