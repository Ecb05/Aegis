// Hermes Privacy Engine — Main Entry Point
// Orchestrates the full pipeline: detect → classify → assess → redact
// This is what the service worker calls when it receives a SANITIZE request

import type {
  BrowserState,
  HermesElement,
  SanitizedState,
  SanitizedElement,
  SensitivityResult,
  TaskRelevanceResult,
  DetectionResult,
} from '../utils/messaging';
import { runDetectionCascade, runDetectionCascadeOnAll } from './detection-cascade';
import { classifySensitivity, classifySensitivityAll, getSensitivitySummary } from './sensitivity';
import { assessTaskRelevance, assessTaskRelevanceAll } from './task-relevance';
import { redactAll, sanitizeElementContext } from './redactor';
import { resetPseudonymMap, getPseudonymMap } from './pseudonym-map';
import { getCurrentMode, type PrivacyMode } from './policy';

// ─── Full Privacy Pipeline ──────────────────────────────────

export interface PrivacyPipelineResult {
  sanitizedState: SanitizedState;
  detections: Map<string, DetectionResult>;
  sensitivities: Map<string, SensitivityResult>;
  relevances: Map<string, TaskRelevanceResult>;
  pseudonymMap: Array<{ token: string; value: string; type: string }>;
}

/**
 * Run the full privacy pipeline on a BrowserState.
 *
 * Pipeline:
 *   1. Detection Cascade — classify each element's data type
 *   2. Sensitivity Taxonomy — map data type → sensitivity level
 *   3. Task Relevance — determine if element matters for the task
 *   4. Redaction — apply treatment (pass/pseudonymize/redact/omit/protective_proxy)
 *
 * @param browserState - The raw browser state (from DOM + vision fusion)
 * @param task - The user's task description
 * @param mode - Privacy mode (standard/strict/local-only), defaults to current mode
 * @returns Full pipeline result with sanitized state and intermediate results
 */
export function runPrivacyPipeline(
  browserState: BrowserState,
  task: string,
  mode?: PrivacyMode,
): PrivacyPipelineResult {
  const effectiveMode = mode || getCurrentMode();

  // Reset pseudonym map for new task
  resetPseudonymMap();

  // Step 1: Run detection cascade on all elements
  const detections = runDetectionCascadeOnAll(browserState.elements);

  // Step 2: Classify sensitivity for all elements
  const sensitivities = classifySensitivityAll(browserState.elements);

  // Step 3: Assess task relevance
  const relevanceInputs = browserState.elements.map((el) => ({
    element: el,
    dataType: detections.get(el.id)?.dataType || 'unknown',
  }));
  const relevances = assessTaskRelevanceAll(relevanceInputs, task);

  // Step 4: Redact all elements
  const redactInputs = browserState.elements.map((el) => ({
    element: el,
    sensitivity: sensitivities.get(el.id) || {
      dataType: 'unknown' as const,
      level: 1 as const,
      confidence: 0.5,
    },
    relevance: relevances.get(el.id) || {
      relevance: 'CONDITIONAL' as const,
      reason: 'No relevance assessment',
    },
  }));

  const { sanitized, stats } = redactAll(redactInputs, effectiveMode);

  // Sanitize context anchors (card titles etc. attached during DOM enrichment):
  // they pass through the same detection cascade as values, so a person's name
  // or an email used as a card anchor is never transmitted raw.
  for (const el of sanitized) {
    if (el.context) {
      el.context = sanitizeElementContext(el.context, effectiveMode) || undefined;
    }
  }

  // Build sanitized state
  const sanitizedState: SanitizedState = {
    elements: sanitized,
    task,
    pageInfo: browserState.page,
    stats,
  };

  return {
    sanitizedState,
    detections,
    sensitivities,
    relevances,
    pseudonymMap: getPseudonymMap().getAllTokens(),
  };
}

/**
 * Sanitize a single element (for on-demand use).
 */
export function sanitizeSingleElement(
  element: HermesElement,
  task: string,
  mode?: PrivacyMode,
): SanitizedElement {
  const effectiveMode = mode || getCurrentMode();

  const detection = runDetectionCascade(element);
  const sensitivity = classifySensitivity(element);
  const relevance = assessTaskRelevance(element, detection.dataType, task);

  const { redactElement } = require('./redactor');
  return redactElement(element, sensitivity, relevance, effectiveMode);
}

/**
 * Get a human-readable summary of the privacy pipeline results.
 */
export function getPrivacySummary(result: PrivacyPipelineResult): string {
  const { stats } = result.sanitizedState;
  const lines = [
    `Privacy Pipeline Results (${result.sanitizedState.elements.length} elements):`,
    `  ✅ Passed through: ${stats.passed}`,
    `  🔤 Pseudonymized: ${stats.pseudonymized}`,
    `  🔴 Redacted: ${stats.redacted}`,
    `  ❌ Omitted: ${stats.omitted}`,
    `  🛡️  Protective proxy: ${stats.protected}`,
    ``,
    `Pseudonym map:`,
  ];

  for (const { token, value, type } of result.pseudonymMap) {
    lines.push(`  ${token} → [${type}]`);
  }

  return lines.join('\n');
}
