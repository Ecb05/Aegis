// Hermes Privacy Engine — PII Detector
// Regex-based detection of personally identifiable information
// Used as Layer 1 step 6 (value regex scan) in the detection cascade

import type { DataType } from '../utils/messaging';

interface PIIRegex {
  pattern: RegExp;
  dataType: DataType;
  confidence: number;
  description: string;
}

/**
 * PII regex patterns, ordered by specificity (most specific first).
 * Each pattern matches a specific data type in element values or labels.
 * Exported so the CV output gate (cv-output-gate.ts) enforces the exact same
 * policy on OCR/perception output text.
 */
export const PII_PATTERNS: PIIRegex[] = [
  // Credit card numbers (16 digits, optional separators)
  {
    pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/,
    dataType: 'credit_card',
    confidence: 0.95,
    description: 'Credit/debit card number',
  },

  // CVV (3-4 digits, usually near card fields)
  {
    pattern: /\b\d{3,4}\b/,
    dataType: 'cvv',
    confidence: 0.3, // Low confidence — just 3-4 digits, needs context
    description: 'CVV/CVC code',
  },

  // Email addresses
  {
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
    dataType: 'email',
    confidence: 1.0,
    description: 'Email address',
  },

  // Indian PAN number (5 letters + 4 digits + 1 letter)
  {
    pattern: /\b[A-Z]{5}\d{4}[A-Z]\b/,
    dataType: 'pan_number',
    confidence: 0.95,
    description: 'Indian PAN number',
  },

  // Indian Aadhaar number (12 digits)
  {
    pattern: /\b\d{4}\s?\d{4}\s?\d{4}\b/,
    dataType: 'aadhaar_number',
    confidence: 0.7, // Lower confidence — 12 digits could be other things
    description: 'Indian Aadhaar number',
  },

  // IFSC code (4 letters + 6 alphanumeric)
  {
    pattern: /\b[A-Z]{4}0[A-Z0-9]{6}\b/,
    dataType: 'ifsc_code',
    confidence: 0.95,
    description: 'Indian IFSC code',
  },

  // UPI ID
  {
    pattern: /\b[\w.-]+@[\w]+\b/,
    dataType: 'upi_id',
    confidence: 0.85,
    description: 'UPI ID',
  },

  // Phone numbers (international format: +country code + number)
  {
    pattern: /\+?\d{1,3}[\s-]?\d{5,10}/,
    dataType: 'phone',
    confidence: 0.9,
    description: 'Phone number',
  },

  // API keys (common prefixes)
  {
    pattern: /\b(sk-|ak-|key_|ghp_|gho_|ghs_|glpat-|Bearer )\S+/i,
    dataType: 'api_key',
    confidence: 0.95,
    description: 'API key or token',
  },

  // SSN (US Social Security Number: XXX-XX-XXXX)
  {
    pattern: /\b\d{3}[-]?\d{2}[-]?\d{4}\b/,
    dataType: 'ssn',
    confidence: 0.8,
    description: 'US Social Security Number',
  },
];

/**
 * Scan a string value for PII patterns.
 * Returns all matches found, ordered by confidence (highest first).
 */
export function detectPII(value: string): Array<{
  dataType: DataType;
  confidence: number;
  match: string;
  description: string;
}> {
  if (!value || value.trim().length === 0) return [];

  const results: Array<{
    dataType: DataType;
    confidence: number;
    match: string;
    description: string;
  }> = [];

  for (const pii of PII_PATTERNS) {
    const match = value.match(pii.pattern);
    if (match) {
      results.push({
        dataType: pii.dataType,
        confidence: pii.confidence,
        match: match[0],
        description: pii.description,
      });
    }
  }

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);

  return results;
}

/**
 * Get the highest-confidence PII match for a value.
 * Returns null if no PII detected.
 */
export function detectHighestConfidencePII(value: string): {
  dataType: DataType;
  confidence: number;
  match: string;
  description: string;
} | null {
  const results = detectPII(value);
  return results.length > 0 ? results[0] : null;
}

/**
 * Check if a value contains any PII.
 */
export function containsPII(value: string): boolean {
  return detectPII(value).length > 0;
}
