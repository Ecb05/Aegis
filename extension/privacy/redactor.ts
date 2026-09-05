// Hermes Privacy Engine — Redactor
// Applies the quadrant model: sensitivity × relevance → treatment
// Produces SanitizedElements ready to send to the server

import type {
  HermesElement,
  SensitivityResult,
  TaskRelevanceResult,
  SanitizedElement,
  SensitivityLevel,
  Relevance,
  Treatment,
} from '../utils/messaging';
import { getPseudonymMap } from './pseudonym-map';
import { runDetectionCascade } from './detection-cascade';
import { getSensitivityLevel } from './taxonomy';

// ─── Quadrant Model ─────────────────────────────────────────

/**
 * Determine the treatment based on sensitivity level and task relevance.
 *
 * Quadrant model:
 *                         TASK RELEVANCE
 *                    Low              High
 *               ┌──────────────┬──────────────┐
 *   High Sens   │ REDACT       │ PROTECTIVE   │
 *   (>= 2)      │ (not needed, │ PROXY        │
 *               │  hide it)    │ (needed, but │
 *               │              │  handle      │
 *               │              │  locally)    │
 *               ├──────────────┼──────────────┤
 *   Low Sens    │ PASS         │ PASS         │
 *   (< 2)       │ THROUGH      │ THROUGH      │
 *               │ (harmless)   │ (safe)       │
 *               └──────────────┴──────────────┘
 */
function determineTreatment(
  sensitivity: SensitivityLevel,
  relevance: Relevance,
  mode: 'standard' | 'strict' | 'local-only',
): Treatment {
  // Local-only mode: omit everything sensitive
  if (mode === 'local-only') {
    return sensitivity >= 2 ? 'omit' : 'pass';
  }

  // NEVER fields are always omitted
  if (relevance === 'NEVER') {
    return 'omit';
  }

  // High sensitivity (>= 3)
  if (sensitivity >= 3) {
    if (relevance === 'RELEVANT') {
      return 'protective_proxy';
    }
    return mode === 'strict' ? 'omit' : 'redact';
  }

  // Medium sensitivity (2)
  if (sensitivity === 2) {
    if (relevance === 'RELEVANT') {
      return 'pseudonymize';
    }
    return mode === 'strict' ? 'redact' : 'pseudonymize';
  }

  // Low sensitivity (0-1): always pass through
  return 'pass';
}

// ─── Value Application ──────────────────────────────────────

/**
 * Apply the treatment to an element's value.
 * Returns the sanitized value (or undefined if omitted).
 */
function applyTreatment(
  element: HermesElement,
  treatment: Treatment,
  sensitivity: SensitivityResult,
): { value: string | undefined; status?: SanitizedElement['status'] } {
  const originalValue = element.attributes['value'] || '';

  switch (treatment) {
    case 'pass':
      // Pass through as-is
      return { value: originalValue || undefined };

    case 'pseudonymize':
      // Replace with token
      if (!originalValue) return { value: undefined };
      return {
        value: getPseudonymMap().tokenize(originalValue, sensitivity.dataType),
      };

    case 'redact':
      // Full redaction — replace with type placeholder
      if (!originalValue) return { value: undefined };
      return {
        value: `[REDACTED_${sensitivity.dataType.toUpperCase()}]`,
      };

    case 'omit':
      // Remove entirely
      return { value: undefined };

    case 'protective_proxy':
      // Keep value local, tell server the status
      if (!originalValue) {
        return { value: undefined, status: 'empty' };
      }
      // Check if it looks pre-filled (has a value when page loaded)
      // For now, if there's a value, treat as pre-filled
      return {
        value: undefined, // Don't send the value
        status: 'pre-filled',
      };

    default:
      return { value: originalValue || undefined };
  }
}

// ─── Main Redactor ──────────────────────────────────────────

/**
 * Redact a single element based on its sensitivity and relevance.
 */
export function redactElement(
  element: HermesElement,
  sensitivity: SensitivityResult,
  relevance: TaskRelevanceResult,
  mode: 'standard' | 'strict' | 'local-only' = 'standard',
): SanitizedElement {
  const treatment = determineTreatment(sensitivity.level, relevance.relevance, mode);
  const { value, status } = applyTreatment(element, treatment, sensitivity);

  return {
    id: element.id,
    role: element.role,
    label: element.label,
    value,
    originalDataType: sensitivity.dataType,
    sensitivity: sensitivity.level,
    relevance: relevance.relevance,
    treatment,
    status,
    visible: element.visible,
    bbox: element.bbox,
    // Context disambiguation metadata passes through — the context STRING
    // itself is sanitized separately (see sanitizeElementContext).
    context: element.context,
    ambiguous: element.ambiguous,
  };
}

/**
 * Sanitize a context anchor string before it leaves the client.
 *
 * Context text (e.g. a card title) is usually public — a product name, a
 * headline. But a card can also be anchored by personal content (a person's
 * name on a social feed, an email in a contact card). Run the same detection
 * cascade used for element values: low-sensitivity context passes through,
 * anything sensitive is pseudonymized (distinct tokens per distinct value, so
 * the disambiguation still works) or redacted under strict/local-only modes.
 */
export function sanitizeElementContext(
  context: string,
  mode: 'standard' | 'strict' | 'local-only' = 'standard',
): string | undefined {
  if (!context) return undefined;

  const synthetic: HermesElement = {
    id: 'context',
    role: 'text',
    label: context,
    tag: 'div',
    visible: true,
    sensitive: false,
    attributes: { value: context },
  };
  const detection = runDetectionCascade(synthetic);
  const level = getSensitivityLevel(detection.dataType);

  if (level < 2) return context;

  if (mode === 'local-only') return undefined; // strictest: drop it

  const token = getPseudonymMap().tokenize(context, detection.dataType);
  if (token !== context) return token;

  // Type has no token prefix (password/pin/…-style types never get tokens):
  // fall back to a redaction placeholder instead of leaking the value.
  if (mode === 'standard' || level < 4) {
    return `[REDACTED_${detection.dataType.toUpperCase()}]`;
  }
  return undefined;
}

/**
 * Redact all elements.
 * Returns sanitized elements and statistics.
 */
export function redactAll(
  elements: Array<{
    element: HermesElement;
    sensitivity: SensitivityResult;
    relevance: TaskRelevanceResult;
  }>,
  mode: 'standard' | 'strict' | 'local-only' = 'standard',
): { sanitized: SanitizedElement[]; stats: { total: number; passed: number; pseudonymized: number; redacted: number; omitted: number; protected: number } } {
  const sanitized: SanitizedElement[] = [];
  const stats = {
    total: 0,
    passed: 0,
    pseudonymized: 0,
    redacted: 0,
    omitted: 0,
    protected: 0,
  };

  for (const { element, sensitivity, relevance } of elements) {
    const result = redactElement(element, sensitivity, relevance, mode);
    sanitized.push(result);
    stats.total++;

    switch (result.treatment) {
      case 'pass': stats.passed++; break;
      case 'pseudonymize': stats.pseudonymized++; break;
      case 'redact': stats.redacted++; break;
      case 'omit': stats.omitted++; break;
      case 'protective_proxy': stats.protected++; break;
    }
  }

  return { sanitized, stats };
}
