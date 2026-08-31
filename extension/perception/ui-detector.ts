// Hermes UI Detector
// Combines DOM-based detection with vision-based detection

import type { HermesElement, BoundingBox, ElementRole } from '../utils/messaging';
import type { DetectedElement } from './vision-model';

// Common UI element labels from vision models
const UI_LABEL_MAP: Record<string, ElementRole> = {
  'button': 'button',
  'push button': 'button',
  'submit': 'button',
  'ok': 'button',
  'cancel': 'button',
  'text field': 'textbox',
  'input': 'textbox',
  'search': 'textbox',
  'text input': 'textbox',
  'password': 'textbox',
  'dropdown': 'select',
  'combobox': 'select',
  'select': 'select',
  'checkbox': 'checkbox',
  'radio': 'radio',
  'link': 'link',
  'hyperlink': 'link',
  'image': 'image',
  'img': 'image',
  'icon': 'image',
  'heading': 'heading',
  'title': 'heading',
  'label': 'text',
  'text': 'text',
  'paragraph': 'text',
};

/**
 * Map vision detection label to Hermes role
 */
function mapLabelToRole(label: string): ElementRole {
  const lower = label.toLowerCase();

  for (const [pattern, role] of Object.entries(UI_LABEL_MAP)) {
    if (lower.includes(pattern)) {
      return role;
    }
  }

  return 'other';
}

/**
 * Normalize bounding box from vision model output
 */
function normalizeBbox(
  box: { xmin: number; ymin: number; xmax: number; ymax: number } | BoundingBox,
  imageWidth: number,
  imageHeight: number,
  viewportWidth: number,
  viewportHeight: number
): BoundingBox {
  // Handle both BoundingBox (x,y,w,h) and vision model output (xmin,ymin,xmax,ymax)
  const xmin = 'xmin' in box ? box.xmin : box.x;
  const ymin = 'ymin' in box ? box.ymin : box.y;
  const xmax = 'xmax' in box ? box.xmax : box.x + box.width;
  const ymax = 'ymax' in box ? box.ymax : box.y + box.height;
  const scaleX = viewportWidth / imageWidth;
  const scaleY = viewportHeight / imageHeight;

  return {
    x: Math.round(xmin * scaleX),
    y: Math.round(ymin * scaleY),
    width: Math.round((xmax - xmin) * scaleX),
    height: Math.round((ymax - ymin) * scaleY),
  };
}

/**
 * Convert detected vision elements to HermesElement format
 */
export function visionToHermesElements(
  detections: DetectedElement[],
  imageWidth: number,
  imageHeight: number,
  viewportWidth: number,
  viewportHeight: number
): HermesElement[] {
  return detections.map((det, index) => {
    const role = mapLabelToRole(det.label);
    const bbox = normalizeBbox(det.bbox, imageWidth, imageHeight, viewportWidth, viewportHeight);

    return {
      id: `vision_${role}_${index}`,
      role,
      label: det.label,
      tag: role === 'button' ? 'button' : role === 'textbox' ? 'input' : 'div',
      bbox,
      visible: true,
      sensitive: false,
      attributes: {},
      confidence: det.score,
    };
  });
}

/**
 * Filter vision detections to only UI-relevant elements
 */
export function filterUiElements(detections: DetectedElement[]): DetectedElement[] {
  const uiKeywords = [
    'button', 'input', 'text', 'field', 'link', 'icon', 'checkbox',
    'radio', 'select', 'dropdown', 'search', 'submit', 'menu',
    'tab', 'navigation', 'form', 'label', 'heading',
  ];

  return detections.filter(det => {
    const lower = det.label.toLowerCase();
    return uiKeywords.some(kw => lower.includes(kw));
  });
}
