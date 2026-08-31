// Hermes Perception Fusion
// Combines DOM-based and vision-based element detection using IoU matching

import type { HermesElement, BoundingBox } from '../utils/messaging';
import type { DetectedElement } from './vision-model';

export interface FusedElement extends HermesElement {
  sources: ('dom' | 'vision')[];
  domElement?: HermesElement;
  visionElement?: DetectedElement;
  fusionConfidence: number;
}

export interface FusionResult {
  fused: FusedElement[];
  domOnly: HermesElement[];
  visionOnly: DetectedElement[];
  stats: {
    total: number;
    fused: number;
    domOnly: number;
    visionOnly: number;
    avgConfidence: number;
  };
}

// IoU thresholds
const HIGH_CONFIDENCE_IOU = 0.5;
const LOW_CONFIDENCE_IOU = 0.2;

/**
 * Calculate Intersection over Union (IoU) between two bounding boxes
 */
export function calculateIoU(a: BoundingBox, b: BoundingBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  if (x2 <= x1 || y2 <= y1) return 0;

  const intersection = (x2 - x1) * (y2 - y1);
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const union = areaA + areaB - intersection;

  return union > 0 ? intersection / union : 0;
}

/**
 * Fuse DOM elements with vision detections using IoU matching
 */
export function fusePerceptions(
  domElements: HermesElement[],
  visionDetections: DetectedElement[],
  confidenceThreshold: number = 0.3
): FusionResult {
  const fused: FusedElement[] = [];
  const domOnly: HermesElement[] = [];
  const visionOnly: DetectedElement[] = [...visionDetections];

  // Track which vision elements have been matched
  const matchedVision = new Set<number>();

  // For each DOM element, find best matching vision detection
  for (const domEl of domElements) {
    if (!domEl.bbox) {
      domOnly.push(domEl);
      continue;
    }

    let bestIoU = 0;
    let bestVisionIdx = -1;
    let bestVisionDet: DetectedElement | null = null;

    // Find best matching vision element
    for (let i = 0; i < visionDetections.length; i++) {
      if (matchedVision.has(i)) continue;

      const visDet = visionDetections[i];
      if (!visDet.bbox) continue;

      const iou = calculateIoU(domEl.bbox, visDet.bbox);

      if (iou > bestIoU) {
        bestIoU = iou;
        bestVisionIdx = i;
        bestVisionDet = visDet;
      }
    }

    // Classify match quality
    if (bestIoU >= HIGH_CONFIDENCE_IOU && bestVisionDet) {
      // High confidence match — fuse them
      matchedVision.add(bestVisionIdx);
      visionOnly.splice(visionOnly.indexOf(bestVisionDet), 1);

      fused.push({
        ...domEl,
        sources: ['dom', 'vision'],
        domElement: domEl,
        visionElement: bestVisionDet,
        fusionConfidence: (domEl.visible ? 0.5 : 0.3) + (bestVisionDet.score * 0.5),
      });
    } else if (bestIoU >= LOW_CONFIDENCE_IOU && bestVisionDet) {
      // Low confidence match — flag for review but still fuse
      matchedVision.add(bestVisionIdx);
      visionOnly.splice(visionOnly.indexOf(bestVisionDet), 1);

      fused.push({
        ...domEl,
        sources: ['dom', 'vision'],
        domElement: domEl,
        visionElement: bestVisionDet,
        fusionConfidence: 0.3 + (bestVisionDet.score * 0.3),
      });
    } else {
      // No match — DOM only
      domOnly.push(domEl);
    }
  }

  // Remaining unmatched vision elements are vision-only
  // (already in visionOnly array)

  // Calculate stats
  const totalFused = fused.length;
  const totalDomOnly = domOnly.length;
  const totalVisionOnly = visionOnly.length;
  const avgConfidence = fused.length > 0
    ? fused.reduce((sum, e) => sum + e.fusionConfidence, 0) / fused.length
    : 0;

  return {
    fused,
    domOnly,
    visionOnly,
    stats: {
      total: totalFused + totalDomOnly + totalVisionOnly,
      fused: totalFused,
      domOnly: totalDomOnly,
      visionOnly: totalVisionOnly,
      avgConfidence,
    },
  };
}

/**
 * Merge fused results into a single element list for the agent
 * Priority: DOM for structure, Vision for rendered text
 */
export function mergeFusedElements(fusionResult: FusionResult): HermesElement[] {
  const merged: HermesElement[] = [];

  // Add fused elements (DOM + Vision combined)
  for (const el of fusionResult.fused) {
    merged.push({
      id: el.id,
      role: el.role,
      // Use vision label if available and different from DOM
      label: el.visionElement?.label || el.label,
      tag: el.tag,
      bbox: el.bbox,
      visible: el.visible,
      sensitive: el.sensitive,
      attributes: {
        ...el.attributes,
        fusion_sources: el.sources.join(','),
        fusion_confidence: String(el.fusionConfidence),
      },
    });
  }

  // Add DOM-only elements
  merged.push(...fusionResult.domOnly);

  // Add vision-only elements (these need to be mapped to HermesElement format)
  for (const visEl of fusionResult.visionOnly) {
    merged.push({
      id: `vision_${visEl.label.replace(/\s+/g, '_')}`,
      role: 'other',
      label: visEl.label,
      tag: 'div',
      bbox: visEl.bbox,
      visible: true,
      sensitive: false,
      attributes: {
        confidence: String(visEl.score),
        source: 'vision-only',
      },
    });
  }

  return merged;
}
