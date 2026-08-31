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
const pageClassification = document.getElementById('page-classification')!;
const visionElementCount = document.getElementById('vision-element-count')!;
const fusedCount = document.getElementById('fused-count')!;
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

    if (message.type === 'PAGE_STATE') {
      const state = message.payload as BrowserState;
      currentState = state;
      displayState(state);
      return;
    }

    if (pendingResolve) {
      if (timeoutId) clearTimeout(timeoutId);
      const resolve = pendingResolve;
      pendingResolve = null;
      pendingReject = null;

      if (message.type === 'ERROR') {
        reject(new Error(message.payload?.message || 'Unknown error'));
      } else {
        resolve(message);
      }
      return;
    }
  });

  port.onDisconnect.addListener(() => {
    console.log('[Hermes] Disconnected from background');
    port = null;
    setTimeout(connectPort, 500);
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

function sendAndWait(type: string, payload: any, timeoutMs: number = 30000): Promise<any> {
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

  if (perception.classification?.predictions) {
    const top = perception.classification.predictions[0];
    pageClassification.textContent = top ? `${top.label} (${(top.score * 100).toFixed(1)}%)` : '—';
  } else if (perception.classification?.error) {
    pageClassification.textContent = `Error: ${perception.classification.error}`;
  }

  if (perception.detection?.elements) {
    visionElementCount.textContent = String(perception.detection.elements.length);
  } else if (perception.detection?.error) {
    visionElementCount.textContent = `Error: ${perception.detection.error}`;
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

  try {
    const response = await sendAndWait('INSPECT_PAGE', {});
    if (response.type === 'PAGE_STATE') {
      const state = response.payload as BrowserState;
      currentState = state;
      displayState(state);
      setStatus(`Found ${state.elements.length} DOM elements`, 'success');
    } else {
      setStatus(`Unexpected response: ${response.type}`, 'error');
    }
  } catch (err) {
    setStatus(`Failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
  } finally {
    inspectBtn.disabled = false;
  }
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

console.log('[Hermes] Side panel v8 loaded');
