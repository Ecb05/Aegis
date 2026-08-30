// Hermes Accessibility Perception
// Extracts accessibility tree information for richer page understanding

export interface AccessibilityNode {
  role: string;
  name: string;
  description?: string;
  states: string[];
  children: AccessibilityNode[];
  domElement?: string; // Hermes element ID if mapped
}

/**
 * Walk the accessibility tree of the page
 */
export function extractAccessibilityTree(): AccessibilityNode {
  const root: AccessibilityNode = {
    role: 'document',
    name: document.title || 'Untitled',
    states: [],
    children: [],
  };

  // Use the ARIA tree walk if available (Chrome-specific)
  if ('getComputedRole' in document.body) {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node: Node) => {
          const el = node as HTMLElement;
          const role = el.getAttribute('role') || el.tagName.toLowerCase();
          // Only include elements with meaningful roles
          const meaningfulRoles = [
            'button', 'textbox', 'link', 'heading', 'img',
            'navigation', 'main', 'banner', 'contentinfo',
            'complementary', 'search', 'form', 'list', 'listitem',
            'table', 'row', 'cell', 'tab', 'tabpanel',
          ];
          if (meaningfulRoles.includes(role)) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_SKIP;
        },
      }
    );

    const processNode = (node: Node, parent: AccessibilityNode): void => {
      const el = node as HTMLElement;
      const role = el.getAttribute('role') || inferAriaRole(el);
      if (!role) return;

      const states = getAriaStates(el);
      const name = getAccessibleName(el);

      const accNode: AccessibilityNode = {
        role,
        name,
        states,
        children: [],
      };

      parent.children.push(accNode);

      // Process children
      let child = walker.firstChild();
      while (child) {
        processNode(child, accNode);
        child = walker.nextSibling();
      }
    };

    let node = walker.firstChild();
    while (node) {
      processNode(node, root);
      node = walker.nextSibling();
    }
  }

  return root;
}

/**
 * Infer ARIA role from tag name
 */
function inferAriaRole(el: HTMLElement): string | null {
  const tag = el.tagName.toLowerCase();
  const roleMap: Record<string, string> = {
    a: 'link',
    button: 'button',
    input: getInputRole(el as HTMLInputElement),
    select: 'combobox',
    textarea: 'textbox',
    h1: 'heading',
    h2: 'heading',
    h3: 'heading',
    h4: 'heading',
    h5: 'heading',
    h6: 'heading',
    img: 'img',
    nav: 'navigation',
    main: 'main',
    header: 'banner',
    footer: 'contentinfo',
    aside: 'complementary',
    form: 'form',
    table: 'table',
    tr: 'row',
    td: 'cell',
    th: 'cell',
  };
  return roleMap[tag] || null;
}

function getInputRole(input: HTMLInputElement): string {
  const typeMap: Record<string, string> = {
    text: 'textbox',
    email: 'textbox',
    password: 'textbox',
    search: 'searchbox',
    tel: 'textbox',
    url: 'textbox',
    number: 'spinbutton',
    range: 'slider',
    checkbox: 'checkbox',
    radio: 'radio',
    submit: 'button',
    button: 'button',
    file: 'button',
    color: 'button',
  };
  return typeMap[input.type] || 'textbox';
}

/**
 * Get ARIA states for an element
 */
function getAriaStates(el: HTMLElement): string[] {
  const states: string[] = [];

  if (el.getAttribute('aria-disabled') === 'true') states.push('disabled');
  if (el.getAttribute('aria-expanded') === 'true') states.push('expanded');
  if (el.getAttribute('aria-expanded') === 'false') states.push('collapsed');
  if (el.getAttribute('aria-selected') === 'true') states.push('selected');
  if (el.getAttribute('aria-checked') === 'true') states.push('checked');
  if (el.getAttribute('aria-invalid') === 'true') states.push('invalid');
  if (el.getAttribute('aria-required') === 'true') states.push('required');
  if ((el as HTMLInputElement).disabled) states.push('disabled');
  if ((el as HTMLInputElement).readOnly) states.push('readonly');

  return states;
}

/**
 * Get accessible name for an element
 */
function getAccessibleName(el: HTMLElement): string {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const ids = labelledBy.split(/\s+/);
    for (const id of ids) {
      const labelEl = document.getElementById(id);
      if (labelEl?.textContent) return labelEl.textContent.trim();
    }
  }

  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label?.textContent) return label.textContent.trim();
  }

  const placeholder = (el as HTMLInputElement).placeholder;
  if (placeholder) return placeholder;

  const text = el.textContent?.trim();
  if (text && text.length < 100) return text;

  const title = el.getAttribute('title');
  if (title) return title;

  return '';
}

/**
 * Get a flat summary of the accessibility tree (for sending to LLM)
 */
export function flattenAccessibilityTree(tree: AccessibilityNode, depth = 0): string[] {
  const lines: string[] = [];
  const indent = '  '.repeat(depth);
  const statesStr = tree.states.length > 0 ? ` [${tree.states.join(', ')}]` : '';
  lines.push(`${indent}${tree.role}: "${tree.name}"${statesStr}`);

  for (const child of tree.children) {
    lines.push(...flattenAccessibilityTree(child, depth + 1));
  }

  return lines;
}
