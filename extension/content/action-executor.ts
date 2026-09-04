// Hermes Action Executor
// Executes structured actions on browser elements using native events

import type { ActionRequest, ActionResult, ActionType } from '../utils/messaging';

/**
 * Recursively find an element by data-hermes-id, including shadow DOM
 */
function findElementDeep(root: ParentNode, hermesId: string): HTMLElement | null {
  // Check this root (only Element has querySelector, DocumentFragment/ShadowRoot does too via ParentNode)
  if ('querySelector' in root) {
    const el = (root as Element).querySelector(`[data-hermes-id="${hermesId}"]`);
    if (el) return el as HTMLElement;
  }

  // Check shadow roots
  for (const child of Array.from(root.children)) {
    if (child instanceof HTMLElement && child.shadowRoot) {
      const found = findElementDeep(child.shadowRoot, hermesId);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Find a DOM element by Hermes element ID
 */
function findElementByHermesId(hermesId: string): HTMLElement | null {
  // Strategy 1: query by data-hermes-id attribute (set during extraction)
  const el = findElementDeep(document.body, hermesId);
  if (el) return el;

  // Strategy 2: fallback by role + index pattern
  const match = hermesId.match(/^(\w+)_(\d+)$/);
  if (!match) return null;

  const [, rolePrefix, indexStr] = match;
  const index = parseInt(indexStr, 10);

  // Build a list of all elements matching this role prefix
  const candidates: HTMLElement[] = [];

  const collectDeep = (root: ParentNode) => {
    // Standard tags
    const tagMap: Record<string, string> = {
      button: 'button, input[type="button"], input[type="submit"]',
      input: 'input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]), textarea',
      select: 'select',
      link: 'a',
      form: 'form',
      checkbox: 'input[type="checkbox"]',
      radio: 'input[type="radio"]',
      img: 'img',
      heading: 'h1, h2, h3, h4, h5, h6',
    };

    if (tagMap[rolePrefix]) {
      root.querySelectorAll(tagMap[rolePrefix]).forEach(el => {
        candidates.push(el as HTMLElement);
      });
    }

    // For textbox role, also find contenteditable elements
    if (rolePrefix === 'input' || rolePrefix === 'textbox') {
      root.querySelectorAll('[contenteditable="true"], [contenteditable=""]').forEach(el => {
        candidates.push(el as HTMLElement);
      });
    }

    // Recurse into shadow roots
    for (const child of Array.from(root.children)) {
      if (child instanceof HTMLElement && child.shadowRoot) {
        collectDeep(child.shadowRoot);
      }
    }
  };

  collectDeep(document.body);

  if (index >= 0 && index < candidates.length) {
    return candidates[index];
  }

  return null;
}

/**
 * Check if an element is contenteditable
 */
function isContentEditable(el: HTMLElement): boolean {
  return el.getAttribute('contenteditable') === 'true' ||
         el.getAttribute('contenteditable') === '' ||
         el.isContentEditable;
}

/**
 * Dispatch a click event on an element
 */
function executeClick(target: HTMLElement): void {
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.focus();

  const rect = target.getBoundingClientRect();
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  for (const eventType of ['mousedown', 'mouseup', 'click'] as const) {
    target.dispatchEvent(new MouseEvent(eventType, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: centerX,
      clientY: centerY,
    }));
  }
}

/** Read the current value of a textbox (input, textarea, or contenteditable). */
function readElementValue(target: HTMLElement): string {
  if (isContentEditable(target)) {
    return target.textContent || '';
  }
  return (target as HTMLInputElement | HTMLTextAreaElement).value || '';
}

/**
 * Execute a type action — simulates real keystrokes so frameworks (React, WhatsApp) process them correctly
 */
async function executeType(target: HTMLElement, text: string): Promise<void> {
  target.focus();

  // Clear existing content first
  if (isContentEditable(target)) {
    target.textContent = '';
  } else {
    (target as HTMLInputElement).value = '';
  }

  // Type each character via keyboard events — this is how real users type
  for (const char of text) {
    const key = char;

    target.dispatchEvent(new KeyboardEvent('keydown', {
      key, code: `Key${char.toUpperCase()}`,
      bubbles: true, cancelable: true,
    }));

    target.dispatchEvent(new KeyboardEvent('keypress', {
      key, code: `Key${char.toUpperCase()}`,
      bubbles: true, cancelable: true,
    }));

    // Insert the character
    if (isContentEditable(target)) {
      // Use execCommand for contenteditable — frameworks like React handle this properly
      document.execCommand('insertText', false, char);
    } else {
      const input = target as HTMLInputElement | HTMLTextAreaElement;
      input.value += char;
      input.dispatchEvent(new InputEvent('input', {
        bubbles: true, cancelable: true,
        inputType: 'insertText', data: char,
      }));
    }

    target.dispatchEvent(new KeyboardEvent('keyup', {
      key, code: `Key${char.toUpperCase()}`,
      bubbles: true, cancelable: true,
    }));
  }

  // Give the framework a tick to process the input events
  await new Promise(resolve => setTimeout(resolve, 50));
}

/**
 * Execute a scroll action
 */
function executeScroll(params: { direction?: string; amount?: number }): void {
  const direction = params.direction || 'down';
  const amount = params.amount || 500;
  const deltaY = direction === 'down' ? amount : direction === 'up' ? -amount : 0;
  const deltaX = direction === 'right' ? amount : direction === 'left' ? -amount : 0;
  window.scrollBy({ top: deltaY, left: deltaX, behavior: 'smooth' });
}

/**
 * Execute a select action on a dropdown
 */
async function executeSelect(target: HTMLElement, value: string): Promise<void> {
  const select = target as HTMLSelectElement;
  target.focus();

  for (const option of Array.from(select.options)) {
    if (option.value === value || option.textContent?.trim() === value) {
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
  }

  const index = parseInt(value, 10);
  if (!isNaN(index) && index >= 0 && index < select.options.length) {
    select.selectedIndex = index;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  // Nothing matched — report failure so verification can flag it
  select.selectedIndex = -1;
}

/**
 * Execute a hover action
 */
function executeHover(target: HTMLElement): void {
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const rect = target.getBoundingClientRect();
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  for (const eventType of ['mouseenter', 'mouseover', 'mousemove'] as const) {
    target.dispatchEvent(new MouseEvent(eventType, {
      bubbles: true, cancelable: true, view: window,
      clientX: centerX, clientY: centerY,
    }));
  }
}

/**
 * Execute a navigate action
 */
function executeNavigate(params: { url?: string }): void {
  if (params.url) {
    window.location.href = params.url;
  }
}

/**
 * Execute a wait action
 */
async function executeWait(params: { duration?: number; selector?: string; state?: string; timeout?: number }): Promise<void> {
  if (params.duration) {
    await new Promise(resolve => setTimeout(resolve, params.duration));
    return;
  }

  if (params.selector && params.state) {
    const timeout = params.timeout || 10000;
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const el = document.querySelector(params.selector);
      if (params.state === 'hidden' && !el) return;
      if (params.state === 'visible' && el) return;
      if (params.state === 'exists' && el) return;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
}

/**
 * Execute a press_key action
 */
function executePressKey(params: { key: string; modifiers?: string[] }): void {
  const modifiers = params.modifiers || [];
  const keyOptions: KeyboardEventInit = {
    key: params.key,
    bubbles: true,
    cancelable: true,
    ctrlKey: modifiers.includes('Control') || modifiers.includes('Ctrl'),
    shiftKey: modifiers.includes('Shift'),
    altKey: modifiers.includes('Alt'),
    metaKey: modifiers.includes('Meta'),
  };

  document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', keyOptions));
  document.activeElement?.dispatchEvent(new KeyboardEvent('keyup', keyOptions));
}

/**
 * Main action executor
 */
export async function executeAction(request: ActionRequest): Promise<ActionResult> {
  const result: ActionResult = {
    success: false,
    action: request.action,
    target: request.target,
    timestamp: Date.now(),
  };

  try {
    const { action, target: hermesId, params } = request;

    if (action === 'navigate') {
      executeNavigate(params as { url?: string });
      result.success = true;
      return result;
    }

    if (action === 'wait') {
      await executeWait(params as { duration?: number; selector?: string; state?: string; timeout?: number });
      result.success = true;
      return result;
    }

    if (action === 'scroll') {
      executeScroll(params as { direction?: string; amount?: number });
      result.success = true;
      return result;
    }

    if (!hermesId) {
      result.error = 'Action requires a target element';
      return result;
    }

    const element = findElementByHermesId(hermesId);
    if (!element) {
      result.error = `Element not found: ${hermesId}. Try re-inspecting the page.`;
      return result;
    }

    switch (action) {
      case 'click':
        executeClick(element);
        break;
      case 'type':
        await executeType(element, (params as { text?: string })?.text || '');
        break;
      case 'select':
        await executeSelect(element, (params as { value?: string })?.value || '');
        break;
      case 'hover':
        executeHover(element);
        break;
      case 'press_key':
        executePressKey(params as { key: string; modifiers?: string[] });
        break;
      default:
        result.error = `Unknown action: ${action}`;
        return result;
    }

    result.success = true;

    // ─── Verification ──────────────────────────────
    // Read back the DOM to confirm the action actually took effect.
    // This is how the agent KNOWS whether the task was executed correctly.
    if (action === 'type') {
      const expected = (params as { text?: string })?.text || '';
      const actual = readElementValue(element);
      result.expectedValue = expected;
      result.actualValue = actual;
      result.verified = actual === expected;
      if (!result.verified) {
        result.success = false;
        result.error = `Value mismatch: expected "${expected}" but field reads "${actual}"`;
      }
    } else if (action === 'select') {
      const select = element as HTMLSelectElement;
      const expected = (params as { value?: string })?.value || '';
      const actual = select.value || '';
      const actualText = select.selectedIndex >= 0 ? select.options[select.selectedIndex]?.textContent?.trim() || '' : '';
      result.expectedValue = expected;
      result.actualValue = actual || actualText;
      result.verified = actual === expected || actualText === expected;
      if (!result.verified) {
        result.success = false;
        result.error = `Selection mismatch: expected "${expected}" but field reads "${actualText}"`;
      }
    } else {
      // click / press_key / scroll / wait / navigate — no DOM value to read back.
      result.verified = true;
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    result.verified = false;
  }

  return result;
}
