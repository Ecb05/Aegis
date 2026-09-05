// Hermes Privacy Engine — CV Output Gate
// "Privacy in the communication of CV models": anything a local vision/OCR
// model emits in TEXT form (OCR lines, full-text dumps, …) must pass through
// this gate BEFORE it can be attached to an element, logged, or transmitted
// to the server. Raw CV output is free text — it can read emails, phone
// numbers and IDs straight off the page pixels — so it must be held to the
// same policy as DOM element values.
//
// Design: span-level masking (not whole-line drop) so public context like
// "Email us at x@y.com for queries" survives as "Email us at
// [REDACTED_EMAIL] for queries" — OCR disambiguation keeps working, the PII
// never leaves. Reuses the exact PII pattern table from pii-detector.ts so
// the DOM channel and the CV channel enforce one identical policy.
//
// This module is dependency-light (no chrome.*, no DOM) so it can run in ANY
// extension context: the offscreen document (at inference output time), the
// content script (at OCR fusion time), and the service worker.

import type { DataType } from "../utils/messaging";
import { PII_PATTERNS } from "./pii-detector";

/** One masked span in a CV-produced text string. */
export interface CVTextRedaction {
  /** Character offset where the sensitive span started (in the ORIGINAL text). */
  start: number;
  /** Character offset where the sensitive span ended (in the ORIGINAL text). */
  end: number;
  dataType: DataType;
  /** The mask token that replaced the span, e.g. "[REDACTED_EMAIL]". */
  replacement: string;
}

export interface CVSanitizedText {
  /** Text with sensitive spans masked. */
  text: string;
  /** True when at least one span was masked. */
  redacted: boolean;
  /** Every span that was masked (original offsets + mask used). */
  redactions: CVTextRedaction[];
}

/**
 * Confidence floor for masking. Only patterns at/above this fire.
 *
 * CVV (0.3) is deliberately excluded — a bare 3-4 digit run appears
 * everywhere in UI text (years, counts, roll numbers) and would destroy
 * legitimate context. Aadhaar (0.7) IS included: SIH is India-focused and a
 * missed 12-digit ID is a real leak, while over-masking an odd long number
 * in OCR text only costs a bit of context (safe direction — never under-mask).
 */
const DEFAULT_MIN_CONFIDENCE = 0.65;

/** Collect every PII span (with position) in a string. */
function findPIISpans(
  text: string,
  minConfidence: number,
): Array<{ start: number; end: number; dataType: DataType; confidence: number; order: number }> {
  const spans: Array<{ start: number; end: number; dataType: DataType; confidence: number; order: number }> = [];

  for (let i = 0; i < PII_PATTERNS.length; i++) {
    const { pattern, dataType, confidence } = PII_PATTERNS[i];
    if (confidence < minConfidence) continue;

    // Clone the pattern as a global regex so we can walk every match.
    const flags = "g" + (pattern.flags.includes("i") ? "i" : "");
    const re = new RegExp(pattern.source, flags);

    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      if (match[0].length === 0) {
        re.lastIndex++; // guard against zero-length matches looping forever
        continue;
      }
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
        dataType,
        confidence,
        order: i,
      });
    }
  }

  return spans;
}

/**
 * Mask sensitive PII spans in a CV-produced text string.
 * Returns the sanitized text plus a record of every mask applied.
 */
export function sanitizeCVText(
  text: string,
  opts?: { minConfidence?: number },
): CVSanitizedText {
  if (!text) return { text, redacted: false, redactions: [] };

  const minConfidence = opts?.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const spans = findPIISpans(text, minConfidence)
    // Highest-confidence, most-specific pattern first.
    .sort((a, b) => b.confidence - a.confidence || a.order - b.order);

  // Greedy non-overlapping selection: once a higher-priority span claims a
  // region, lower-priority overlapping matches (e.g. UPI matching inside an
  // email) are dropped instead of double-masking.
  const kept: typeof spans = [];
  for (const span of spans) {
    if (kept.some((k) => span.start < k.end && k.start < span.end)) continue;
    kept.push(span);
  }

  if (kept.length === 0) {
    return { text, redacted: false, redactions: [] };
  }

  kept.sort((a, b) => a.start - b.start);

  let out = "";
  let cursor = 0;
  const redactions: CVTextRedaction[] = [];

  for (const span of kept) {
    out += text.slice(cursor, span.start);
    const replacement = `[REDACTED_${span.dataType.toUpperCase()}]`;
    out += replacement;
    redactions.push({
      start: span.start,
      end: span.end,
      dataType: span.dataType,
      replacement,
    });
    cursor = span.end;
  }
  out += text.slice(cursor);

  return { text: out, redacted: true, redactions };
}

/** Structural shape of an OCR text block (kept local — no cross-context import). */
export interface CVTextBlockLike {
  text: string;
  confidence?: number;
  bbox?: unknown;
}

/**
 * Sanitize a list of OCR text blocks in place of field `text`.
 * Blocks whose ENTIRE content was sensitive become an all-mask string
 * (e.g. "[REDACTED_PHONE]") — the block geometry survives, its content is gone.
 */
export function sanitizeCVBlocks<T extends CVTextBlockLike>(
  blocks: T[],
  opts?: { minConfidence?: number },
): { blocks: T[]; redactedCount: number; redactionTypes: DataType[] } {
  if (!blocks || blocks.length === 0) {
    return { blocks: blocks || [], redactedCount: 0, redactionTypes: [] };
  }

  let redactedCount = 0;
  const redactionTypes = new Set<DataType>();

  const sanitized = blocks.map((block) => {
    const result = sanitizeCVText(block.text, opts);
    if (result.redacted) {
      redactedCount++;
      for (const r of result.redactions) redactionTypes.add(r.dataType);
      return { ...block, text: result.text };
    }
    return block;
  });

  return { blocks: sanitized, redactedCount, redactionTypes: [...redactionTypes] };
}

/**
 * Sanitize OCR full text (line-broken page dump) in place.
 */
export function sanitizeCVFullText(
  fullText: string,
  opts?: { minConfidence?: number },
): CVSanitizedText {
  return sanitizeCVText(fullText, opts);
}
