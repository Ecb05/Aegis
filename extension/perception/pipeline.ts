// Hermes Perception Pipeline v2
// Unified pipeline: screenshot → vision (classify + detect) → OCR → DOM fusion
// This is the main entry point for the perception system

import type {
  BrowserState,
  HermesElement,
  BoundingBox,
  PerceptionResult,
  OCRResult,
  DetectedElement,
} from "../utils/messaging";

export interface PipelineResult {
  browserState: BrowserState;
  perception: PerceptionResult;
  ocr: OCRResult | null;
  fusedElements: HermesElement[];
  stats: {
    domElements: number;
    visionElements: number;
    ocrBlocks: number;
    fusedCount: number;
    domOnlyCount: number;
    visionOnlyCount: number;
    totalElapsed: number;
  };
}

// ─── IoU Calculation ────────────────────────────────────────

function calculateIoU(a: BoundingBox, b: BoundingBox): number {
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

// ─── IoU Fusion ─────────────────────────────────────────────

const HIGH_CONFIDENCE_IOU = 0.5;
const LOW_CONFIDENCE_IOU = 0.2;

/**
 * Fuse DOM elements with vision detections using IoU matching.
 * DOM wins for structure (role, type, attributes).
 * Vision wins for rendered text content (what user actually sees).
 */
export function fuseWithIoU(
  domElements: HermesElement[],
  visionElements: DetectedElement[],
): HermesElement[] {
  const result: HermesElement[] = [];
  const matchedVision = new Set<number>();

  for (const domEl of domElements) {
    if (!domEl.bbox) {
      result.push({ ...domEl, sources: ["dom"] });
      continue;
    }

    let bestIoU = 0;
    let bestIdx = -1;

    for (let i = 0; i < visionElements.length; i++) {
      if (matchedVision.has(i)) continue;
      const vis = visionElements[i];
      if (!vis.bbox) continue;

      // Normalize vision bbox to (x, y, w, h) format
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

    if (bestIoU >= HIGH_CONFIDENCE_IOU && bestIdx >= 0) {
      // High confidence match — fuse DOM structure with vision confidence
      matchedVision.add(bestIdx);
      const vis = visionElements[bestIdx];
      result.push({
        ...domEl,
        sources: ["dom", "vision"],
        confidence: (domEl.visible ? 0.5 : 0.3) + vis.score * 0.5,
        attributes: {
          ...domEl.attributes,
          vision_label: vis.label,
          vision_score: String(vis.score),
          iou: String(bestIoU.toFixed(3)),
        },
      });
    } else if (bestIoU >= LOW_CONFIDENCE_IOU && bestIdx >= 0) {
      // Low confidence match — still fuse but with lower confidence
      matchedVision.add(bestIdx);
      const vis = visionElements[bestIdx];
      result.push({
        ...domEl,
        sources: ["dom", "vision"],
        confidence: 0.3 + vis.score * 0.3,
        attributes: {
          ...domEl.attributes,
          vision_label: vis.label,
          vision_score: String(vis.score),
          iou: String(bestIoU.toFixed(3)),
        },
      });
    } else {
      // No match — DOM only
      result.push({ ...domEl, sources: ["dom"] });
    }
  }

  // Add unmatched vision elements
  for (let i = 0; i < visionElements.length; i++) {
    if (matchedVision.has(i)) continue;
    const vis = visionElements[i];
    result.push({
      id: `vision_${i}`,
      role: "other",
      label: vis.label,
      tag: "div",
      bbox: vis.bbox,
      visible: true,
      sensitive: false,
      sources: ["vision"],
      confidence: vis.score,
      attributes: { vision_score: String(vis.score) },
    });
  }

  return result;
}

// ─── OCR Fusion ─────────────────────────────────────────────

/**
 * Enhance fused elements with OCR text data.
 * Matches OCR text blocks to elements by IoU and adds text content.
 */
export function fuseWithOCR(
  elements: HermesElement[],
  ocrBlocks: Array<{ text: string; confidence: number; bbox: BoundingBox }>,
): HermesElement[] {
  if (!ocrBlocks || ocrBlocks.length === 0) return elements;

  const matchedOCR = new Set<number>();

  return elements.map((el) => {
    if (!el.bbox) return el;

    let bestIoU = 0;
    let bestOCRIdx = -1;

    for (let i = 0; i < ocrBlocks.length; i++) {
      if (matchedOCR.has(i)) continue;
      const block = ocrBlocks[i];
      const iou = calculateIoU(el.bbox, block.bbox);

      if (iou > bestIoU) {
        bestIoU = iou;
        bestOCRIdx = i;
      }
    }

    if (bestIoU >= 0.3 && bestOCRIdx >= 0) {
      matchedOCR.add(bestOCRIdx);
      const block = ocrBlocks[bestOCRIdx];
      return {
        ...el,
        attributes: {
          ...el.attributes,
          ocr_text: block.text,
          ocr_confidence: String(block.confidence.toFixed(3)),
          ocr_iou: String(bestIoU.toFixed(3)),
        },
        // Use OCR text as label if it's more specific
        label: block.text.length > el.label.length ? block.text : el.label,
      };
    }

    return el;
  });
}

// ─── Main Pipeline ──────────────────────────────────────────

/**
 * Run the full perception pipeline:
 * 1. Extract DOM elements (from existing BrowserState)
 * 2. Capture screenshot
 * 3. Run vision models (classification + detection)
 * 4. Run OCR
 * 5. Fuse DOM + Vision via IoU
 * 6. Fuse result + OCR
 *
 * This function communicates with the service worker to orchestrate
 * the pipeline across extension contexts.
 */
export async function runPerceptionPipeline(
  browserState: BrowserState,
  screenshotDataUrl: string,
): Promise<PipelineResult> {
  const startTime = Date.now();

  // Step 1: Run vision models via offscreen document
  let perception: PerceptionResult | null = null;
  let ocr: OCRResult | null = null;

  try {
    const visionResponse = await chrome.runtime.sendMessage({
      type: "OFFSCREEN_PERCEIVE",
      imageData: screenshotDataUrl,
    });

    if (visionResponse && !visionResponse.error) {
      perception = {
        classification: visionResponse.classification?.predictions || [],
        detection: visionResponse.detection?.elements || [],
        ocr: visionResponse.ocr || undefined,
        device: visionResponse.device,
        elapsed: visionResponse.elapsed,
        timestamp: Date.now(),
      };
      ocr = visionResponse.ocr || null;
    }
  } catch (err) {
    console.error("[Hermes Pipeline] Vision perception failed:", err);
  }

  // Step 2: Fuse DOM + Vision
  const domElements = browserState.elements;
  const visionElements = perception?.detection || [];

  let fusedElements = fuseWithIoU(domElements, visionElements);

  // Step 3: Fuse with OCR text
  if (ocr?.textBlocks) {
    fusedElements = fuseWithOCR(fusedElements, ocr.textBlocks);
  }

  // Step 4: Calculate stats
  const fusedCount = fusedElements.filter((e) =>
    e.sources?.includes("vision"),
  ).length;
  const domOnlyCount = fusedElements.filter(
    (e) => e.sources?.length === 1 && e.sources[0] === "dom",
  ).length;
  const visionOnlyCount = fusedElements.filter(
    (e) => e.sources?.length === 1 && e.sources[0] === "vision",
  ).length;

  const totalElapsed = Date.now() - startTime;

  return {
    browserState,
    perception: perception || {
      classification: [],
      detection: [],
      timestamp: Date.now(),
    },
    ocr,
    fusedElements,
    stats: {
      domElements: domElements.length,
      visionElements: visionElements.length,
      ocrBlocks: ocr?.textBlocks?.length || 0,
      fusedCount,
      domOnlyCount,
      visionOnlyCount,
      totalElapsed,
    },
  };
}

/**
 * Run OCR only (lightweight — skips vision models)
 */
export async function runOCROnly(
  screenshotDataUrl: string,
): Promise<OCRResult | null> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "OFFSCREEN_OCR",
      imageData: screenshotDataUrl,
    });

    if (response && !response.error) {
      return {
        fullText: response.fullText || "",
        textBlocks: response.textBlocks || [],
        confidence: response.confidence || 0,
      };
    }
  } catch (err) {
    console.error("[Hermes Pipeline] OCR failed:", err);
  }
  return null;
}
