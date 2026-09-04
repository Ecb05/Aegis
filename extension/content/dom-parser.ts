// Hermes DOM Parser
// Extracts interactive elements from the DOM including contenteditable and shadow DOM

import type { HermesElement, ElementRole, BoundingBox } from '../utils/messaging';

// Counters for element ID generation
const elementCounters: Record<string, number> = {};

/**
 * Reset element counters (call when starting a new extraction)
 */
export function resetCounters(): void {
  for (const key of Object.keys(elementCounters)) {
    delete elementCounters[key];
  }
}

/**
 * Determine the Hermes role for a DOM element
 */
function getElementRole(el: HTMLElement): ElementRole {
  const tag = el.tagName.toLowerCase();
  const type = (el as HTMLInputElement).type?.toLowerCase();
  const role = el.getAttribute('role')?.toLowerCase();

  // Explicit ARIA role takes priority
  if (role) {
    const roleMap: Record<string, ElementRole> = {
      button: 'button',
      textbox: 'textbox',
      searchbox: 'textbox',
      combobox: 'select',
      listbox: 'select',
      checkbox: 'checkbox',
      radio: 'radio',
      link: 'link',
      heading: 'heading',
      img: 'image',
      form: 'form',
    };
    if (roleMap[role]) return roleMap[role];
  }

  // contenteditable = "true" elements are textboxes
  if (el.getAttribute('contenteditable') === 'true' || el.getAttribute('contenteditable') === '') {
    return 'textbox';
  }

  // Tag-based detection
  if (tag === 'button' || (tag === 'input' && (type === 'button' || type === 'submit'))) {
    return 'button';
  }
  if (tag === 'input' && (type === 'text' || type === 'email' || type === 'password' || type === 'search' || type === 'tel' || type === 'url' || type === 'number' || type === 'date' || type === '')) {
    return 'textbox';
  }
  if (tag === 'textarea') return 'textbox';
  if (tag === 'select') return 'select';
  if (tag === 'a') return 'link';
  if (tag === 'form') return 'form';
  if (tag === 'input' && type === 'checkbox') return 'checkbox';
  if (tag === 'input' && type === 'radio') return 'radio';
  if (tag === 'img') return 'image';
  if (/^h[1-6]$/.test(tag)) return 'heading';

  return 'other';
}

/**
 * Get the prefix for element ID based on role
 */
function getIdPrefix(role: ElementRole): string {
  const prefixMap: Record<ElementRole, string> = {
    button: 'button',
    textbox: 'input',
    select: 'select',
    link: 'link',
    form: 'form',
    checkbox: 'checkbox',
    radio: 'radio',
    image: 'img',
    heading: 'heading',
    text: 'text',
    other: 'elem',
  };
  return prefixMap[role];
}

/**
 * Generate the next Hermes element ID
 */
function generateElementId(role: ElementRole): string {
  const prefix = getIdPrefix(role);
  const count = elementCounters[prefix] || 0;
  elementCounters[prefix] = count + 1;
  return `${prefix}_${count}`;
}

/**
 * Get the accessible label for an element
 */
function getAccessibleLabel(el: HTMLElement): string {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy);
    if (labelEl) return labelEl.textContent?.trim() || '';
  }

  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label) return label.textContent?.trim() || '';
  }

  const placeholder = (el as HTMLInputElement).placeholder;
  if (placeholder) return placeholder.trim();

  const title = el.getAttribute('title');
  if (title) return title.trim();

  // For contenteditable, use aria-label or placeholder or data-placeholder
  const dataPlaceholder = el.getAttribute('data-placeholder');
  if (dataPlaceholder) return dataPlaceholder.trim();

  const text = el.textContent?.trim();
  if (text && text.length < 100) return text;

  const name = el.getAttribute('name');
  if (name) return name;

  return `${el.tagName.toLowerCase()} element`;
}

/**
 * Get the bounding box of an element
 */
function getBoundingBox(el: HTMLElement): BoundingBox | undefined {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return undefined;
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
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
 * Check if an element is visible
 */
function isElementVisible(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  if (parseFloat(style.opacity) === 0) return false;

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;

  return true;
}

/**
 * Check if an element is interactive (worth extracting)
 */
function isInteractive(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  const interactiveTags = ['button', 'input', 'select', 'textarea', 'a', 'form'];
  if (interactiveTags.includes(tag)) return true;

  const role = el.getAttribute('role')?.toLowerCase();
  const interactiveRoles = ['button', 'textbox', 'searchbox', 'combobox', 'listbox', 'checkbox', 'radio', 'link', 'tab', 'menuitem'];
  if (role && interactiveRoles.includes(role)) return true;

  // contenteditable elements are interactive
  if (el.getAttribute('contenteditable') === 'true' || el.getAttribute('contenteditable') === '') {
    return true;
  }

  if (el.tabIndex >= 0 && tag !== 'div' && tag !== 'span') return true;

  return false;
}

/**
 * Recursively query elements including shadow DOM
 * Recurses into ALL children to find nested interactive elements
 */
function queryAllDeep(root: ParentNode): HTMLElement[] {
  const results: HTMLElement[] = [];
  const visited = new Set<Node>();

  const walk = (node: ParentNode) => {
    for (const child of Array.from(node.children)) {
      if (!(child instanceof HTMLElement)) continue;
      if (visited.has(child)) continue;
      visited.add(child);

      // Check if this element itself is interactive
      if (isInteractive(child)) {
        results.push(child);
      }

      // Recurse into ALL children (not just interactive ones)
      // This finds interactive elements nested inside divs, spans, etc.
      walk(child);

      // Also recurse into shadow roots
      if (child.shadowRoot) {
        walk(child.shadowRoot);
      }
    }
  };

  walk(root);
  return results;
}

/**
 * Extract all interactive elements from the DOM (including shadow DOM and contenteditable)
 */
export function extractElements(): HermesElement[] {
  resetCounters();

  const elements: HermesElement[] = [];
  const allElements = queryAllDeep(document.body);

  for (const el of allElements) {
    const role = getElementRole(el);
    const id = generateElementId(role);
    const label = getAccessibleLabel(el);
    const bbox = getBoundingBox(el);
    const visible = isElementVisible(el);

    // Tag the element with its Hermes ID for the action executor
    el.setAttribute('data-hermes-id', id);

    const attributes: Record<string, string> = {};
    const attrNames = ['type', 'name', 'href', 'src', 'alt', 'value', 'placeholder', 'role', 'aria-label', 'tabindex', 'contenteditable'];
    for (const attr of attrNames) {
      let val: string | null = el.getAttribute(attr);

      // For inputs/textarea, the live `.value` property reflects what the user
      // (or agent) typed, while `getAttribute('value')` only returns the initial
      // HTML value. This is critical: after executing a `type` action, the
      // re-inspected state MUST show the new value so the agent can verify the
      // task actually happened. Default HTMLFormElement value is ''.
      if (attr === 'value') {
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          val = el.value;
        } else if (isContentEditable(el)) {
          val = el.textContent || null;
        }
      }

      if (val) attributes[attr] = val;
    }

    elements.push({
      id,
      role,
      label,
      tag: el.tagName.toLowerCase(),
      bbox,
      visible,
      sensitive: false,
      attributes,
    });
  }

  return elements;
}

/**
 * Get page info
 */
export function getPageInfo() {
  return {
    title: document.title,
    url: window.location.href,
    domain: window.location.hostname,
  };
}
