// Hermes Vision Model Interface
// Handles communication with offscreen document for model inference

import type { BoundingBox } from '../utils/messaging';

export interface ClassificationResult {
  label: string;
  score: number;
}

export interface DetectedElement {
  label: string;
  score: number;
  bbox: BoundingBox;
}

export interface PerceptionResult {
  classification: ClassificationResult[];
  detection: DetectedElement[];
  timestamp: number;
}

let offscreenReady = false;
let offscreenCreating = false;

/**
 * Ensure offscreen document exists and is ready
 */
async function ensureOffscreen(): Promise<void> {
  if (offscreenReady) return;

  // Check if offscreen document exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });

  if (existingContexts.length === 0 && !offscreenCreating) {
    offscreenCreating = true;
    try {
      await chrome.offscreen.createDocument({
        url: 'offscreen/index.html',
        reasons: ['WORKERS' as any],
        justification: 'Model inference requires WebGPU/WASM in offscreen document',
      });
      // Wait for document to load
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error('[Hermes] Failed to create offscreen document:', err);
      offscreenCreating = false;
      throw err;
    }
  }

  // Initialize models
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'OFFSCREEN_INIT',
    });
    if (response?.ready) {
      offscreenReady = true;
    }
  } catch (err) {
    console.error('[Hermes] Failed to init offscreen models:', err);
    throw err;
  }
}

/**
 * Send image to offscreen document for classification
 */
export async function classifyPage(dataUrl: string): Promise<ClassificationResult[]> {
  await ensureOffscreen();

  const response = await chrome.runtime.sendMessage({
    type: 'OFFSCREEN_CLASSIFY',
    imageData: dataUrl,
  });

  if (response?.error) {
    throw new Error(response.error);
  }

  return response?.predictions || [];
}

/**
 * Send image to offscreen document for UI element detection
 */
export async function detectElements(dataUrl: string): Promise<DetectedElement[]> {
  await ensureOffscreen();

  const response = await chrome.runtime.sendMessage({
    type: 'OFFSCREEN_DETECT',
    imageData: dataUrl,
  });

  if (response?.error) {
    throw new Error(response.error);
  }

  return response?.elements || [];
}

/**
 * Run full perception pipeline (classify + detect)
 */
export async function perceive(dataUrl: string): Promise<PerceptionResult> {
  await ensureOffscreen();

  const response = await chrome.runtime.sendMessage({
    type: 'OFFSCREEN_PERCEIVE',
    imageData: dataUrl,
  });

  if (response?.error) {
    throw new Error(response.error);
  }

  return {
    classification: response?.classification?.predictions || [],
    detection: response?.detection?.elements || [],
    timestamp: Date.now(),
  };
}

/**
 * Generate text embeddings for semantic similarity
 */
export async function embedText(text: string): Promise<number[]> {
  await ensureOffscreen();

  const response = await chrome.runtime.sendMessage({
    type: 'OFFSCREEN_EMBED',
    text,
  });

  if (response?.error) {
    throw new Error(response.error);
  }

  return response?.vector || [];
}

/**
 * Check if offscreen document and models are ready
 */
export async function isReady(): Promise<boolean> {
  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });
    return existingContexts.length > 0 && offscreenReady;
  } catch {
    return false;
  }
}

/**
 * Get model loading progress
 */
export async function getProgress(): Promise<Record<string, string>> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'OFFSCREEN_PING',
    });
    return response?.progress || {};
  } catch {
    return {};
  }
}
