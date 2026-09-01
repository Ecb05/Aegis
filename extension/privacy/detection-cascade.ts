// Hermes Privacy Engine — Detection Cascade
// Layer 1: Universal, site-agnostic detection of element data types
// Runs a 7-step cascade (first match wins) on every element

import type { HermesElement, DetectionResult, DataType } from '../utils/messaging';
import { detectHighestConfidencePII } from './pii-detector';

// ─── Autocomplete Attribute Mapping ──────────────────────────

const AUTOCOMPLETE_MAP: Record<string, DataType> = {
  'email':          'email',
  'tel':            'phone',
  'name':           'full_name',
  'given-name':     'first_name',
  'family-name':    'last_name',
  'address-line1':  'address_line',
  'address-line2':  'address_line',
  'address-level1': 'address_line',
  'address-level2': 'address_line',
  'postal-code':    'zip_code',
  'country':        'address_line',
  'cc-name':        'full_name',
  'cc-number':      'credit_card',
  'cc-exp':         'card_expiry',
  'cc-csc':         'cvv',
  'bday':           'date_of_birth',
  'sex':            'gender',
  'organization':   'unknown',
  'username':       'unknown',
};

// ─── Input Type Mapping ──────────────────────────────────────

const INPUT_TYPE_MAP: Record<string, DataType> = {
  'password': 'password',
  'email':    'email',
  'tel':      'phone',
  'url':      'url',
  'number':   'unknown',
  'date':     'date',
  'time':     'time',
  'hidden':   'hidden_field',
  'month':    'date',
  'week':     'date',
  'datetime-local': 'date',
};

// ─── ARIA Label Keyword Mapping ──────────────────────────────

const ARIA_KEYWORD_MAP: Array<{ keywords: string[]; dataType: DataType }> = [
  { keywords: ['password', 'passwd', 'pass code', 'secret'], dataType: 'password' },
  { keywords: ['email', 'e-mail', 'mail address'], dataType: 'email' },
  { keywords: ['phone', 'mobile', 'telephone', 'cell'], dataType: 'phone' },
  { keywords: ['address', 'street', 'city', 'state'], dataType: 'address_line' },
  { keywords: ['name', 'full name', 'first name', 'last name'], dataType: 'full_name' },
  { keywords: ['credit card', 'card number', 'debit card'], dataType: 'credit_card' },
  { keywords: ['cvv', 'cvc', 'security code', 'card code'], dataType: 'cvv' },
  { keywords: ['ssn', 'social security'], dataType: 'ssn' },
  { keywords: ['date of birth', 'dob', 'birthday'], dataType: 'date_of_birth' },
  { keywords: ['search', 'query'], dataType: 'search_query' },
  { keywords: ['otp', 'verification code', 'one-time'], dataType: 'otp' },
  { keywords: ['pin', 'pin code'], dataType: 'pin' },
  { keywords: ['api key', 'token', 'secret key'], dataType: 'api_key' },
];

// ─── Placeholder Keyword Mapping ─────────────────────────────

const PLACEHOLDER_KEYWORD_MAP: Array<{ keywords: string[]; dataType: DataType }> = [
  { keywords: ['email', 'e-mail', '@'], dataType: 'email' },
  { keywords: ['phone', 'mobile', 'tel'], dataType: 'phone' },
  { keywords: ['password', 'passwd'], dataType: 'password' },
  { keywords: ['name', 'full name'], dataType: 'full_name' },
  { keywords: ['address', 'street'], dataType: 'address_line' },
  { keywords: ['search', 'query', 'find'], dataType: 'search_query' },
  { keywords: ['card', 'credit'], dataType: 'credit_card' },
];

// ─── Detection Cascade Steps ─────────────────────────────────

/**
 * Step 1: Check autocomplete attribute
 */
function step1_autocomplete(element: HermesElement): DetectionResult | null {
  const autocomplete = element.attributes['autocomplete'];
  if (!autocomplete) return null;

  // Normalize: strip "shipping-" or "billing-" prefix
  const normalized = autocomplete.replace(/^(shipping|billing)-/, '');

  const dataType = AUTOCOMPLETE_MAP[normalized];
  if (dataType) {
    return { dataType, confidence: 1.0, source: 'autocomplete' };
  }
  return null;
}

/**
 * Step 2: Check input type attribute
 */
function step2_inputType(element: HermesElement): DetectionResult | null {
  const inputType = element.attributes['type'];
  if (!inputType) return null;

  const dataType = INPUT_TYPE_MAP[inputType.toLowerCase()];
  if (dataType) {
    return { dataType, confidence: 0.95, source: 'input-type' };
  }
  return null;
}

/**
 * Step 3: Check ARIA labels and role
 */
function step3_ariaLabel(element: HermesElement): DetectionResult | null {
  // Check aria-label
  const ariaLabel = element.attributes['aria-label'] || '';
  const label = element.label || '';

  const searchText = `${ariaLabel} ${label}`.toLowerCase();

  for (const mapping of ARIA_KEYWORD_MAP) {
    for (const keyword of mapping.keywords) {
      if (searchText.includes(keyword)) {
        return {
          dataType: mapping.dataType,
          confidence: 0.9,
          source: 'aria-label',
        };
      }
    }
  }

  // Check role
  const role = element.role;
  if (role === 'textbox' && element.attributes['type'] === 'search') {
    return { dataType: 'search_query', confidence: 0.85, source: 'role' };
  }

  return null;
}

/**
 * Step 4: Check label proximity (element label text)
 */
function step4_labelProximity(element: HermesElement): DetectionResult | null {
  const label = (element.label || '').toLowerCase();
  if (!label) return null;

  for (const mapping of ARIA_KEYWORD_MAP) {
    for (const keyword of mapping.keywords) {
      if (label.includes(keyword)) {
        return {
          dataType: mapping.dataType,
          confidence: 0.85,
          source: 'label-proximity',
        };
      }
    }
  }

  return null;
}

/**
 * Step 5: Check placeholder text
 */
function step5_placeholder(element: HermesElement): DetectionResult | null {
  const placeholder = (element.attributes['placeholder'] || '').toLowerCase();
  if (!placeholder) return null;

  for (const mapping of PLACEHOLDER_KEYWORD_MAP) {
    for (const keyword of mapping.keywords) {
      if (placeholder.includes(keyword)) {
        return {
          dataType: mapping.dataType,
          confidence: 0.8,
          source: 'placeholder',
        };
      }
    }
  }

  return null;
}

/**
 * Step 6: Value regex scan (PII detection on current value)
 */
function step6_valueRegex(element: HermesElement): DetectionResult | null {
  const value = element.attributes['value'];
  if (!value || value.trim().length === 0) return null;

  const piiMatch = detectHighestConfidencePII(value);
  if (piiMatch) {
    return {
      dataType: piiMatch.dataType,
      confidence: piiMatch.confidence,
      source: 'value-regex',
    };
  }

  return null;
}

/**
 * Step 7: Default — no signals matched
 */
function step7_default(): DetectionResult {
  return {
    dataType: 'unknown',
    confidence: 0.5,
    source: 'default',
  };
}

// ─── Main Cascade ────────────────────────────────────────────

/**
 * Run the full 7-step detection cascade on a single element.
 * Returns the first match (highest confidence from earliest step).
 *
 * Cascade order (first match wins):
 *   1. autocomplete attribute
 *   2. input type attribute
 *   3. ARIA labels
 *   4. Label proximity
 *   5. Placeholder text
 *   6. Value regex scan
 *   7. Default (unknown, level 1)
 */
export function runDetectionCascade(element: HermesElement): DetectionResult {
  const steps = [
    step1_autocomplete,
    step2_inputType,
    step3_ariaLabel,
    step4_labelProximity,
    step5_placeholder,
    step6_valueRegex,
  ];

  for (const step of steps) {
    const result = step(element);
    if (result) return result;
  }

  return step7_default();
}

/**
 * Run the detection cascade on all elements.
 * Returns a map of element ID → DetectionResult.
 */
export function runDetectionCascadeOnAll(
  elements: HermesElement[],
): Map<string, DetectionResult> {
  const results = new Map<string, DetectionResult>();

  for (const element of elements) {
    results.set(element.id, runDetectionCascade(element));
  }

  return results;
}
