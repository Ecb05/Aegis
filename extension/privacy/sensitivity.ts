// Hermes Privacy Engine — Sensitivity Classifier
// Combines the detection cascade (what type?) with the taxonomy (how sensitive?)

import type {
  HermesElement,
  DetectionResult,
  SensitivityResult,
} from '../utils/messaging';
import { runDetectionCascade } from './detection-cascade';
import { getSensitivityLevel } from './taxonomy';

/**
 * Classify the sensitivity of a single element.
 * Runs the detection cascade, then looks up the sensitivity level.
 */
export function classifySensitivity(element: HermesElement): SensitivityResult {
  const detection: DetectionResult = runDetectionCascade(element);

  const level = getSensitivityLevel(detection.dataType);

  return {
    dataType: detection.dataType,
    level,
    confidence: detection.confidence,
  };
}

/**
 * Classify sensitivity for all elements.
 * Returns a map of element ID → SensitivityResult.
 */
export function classifySensitivityAll(
  elements: HermesElement[],
): Map<string, SensitivityResult> {
  const results = new Map<string, SensitivityResult>();

  for (const element of elements) {
    results.set(element.id, classifySensitivity(element));
  }

  return results;
}

/**
 * Get a summary of sensitivity distribution across elements.
 */
export function getSensitivitySummary(
  results: Map<string, SensitivityResult>,
): Record<number, number> {
  const summary: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };

  for (const result of results.values()) {
    summary[result.level] = (summary[result.level] || 0) + 1;
  }

  return summary;
}
