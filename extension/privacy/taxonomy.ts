// Hermes Privacy Engine — Sensitivity Taxonomy
// Fixed mapping of data types to sensitivity levels (0-4)
// Works across ALL websites — no per-site configuration

import type { DataType, SensitivityLevel } from '../utils/messaging';

/**
 * Sensitivity levels:
 *   0 = Public — transmitted as-is
 *   1 = Low sensitivity — transmitted as-is
 *   2 = Personal — pseudonymize (replace with tokens)
 *   3 = Confidential — redact or protective proxy
 *   4 = Highly sensitive — never transmit
 */

const TAXONOMY: Record<DataType, SensitivityLevel> = {
  // Level 4 — Never transmit
  password:        4,
  pin:             4,
  credit_card:     4,
  debit_card:      4,
  bank_account:    4,
  cvv:             4,
  card_expiry:     4,
  pan_number:      4,
  aadhaar_number:  4,
  ssn:             4,
  passport_number: 4,
  api_key:         4,
  medical_record:  4,
  mfa_code:        4,
  hidden_field:    4,

  // Level 3 — Redact
  email:           3,
  phone:           3,
  address_line:    3,
  ifsc_code:       3,
  upi_id:          3,
  insurance_id:    3,
  otp:             3,
  security_question: 3,

  // Level 2 — Pseudonymize
  full_name:       2,
  first_name:      2,
  last_name:       2,
  date_of_birth:   2,
  gender:          2,
  zip_code:        2,

  // Level 0-1 — Allow (public / low sensitivity)
  product_name:    0,
  price:           0,
  date:            0,
  time:            0,
  location_name:   0,
  category:        0,
  rating:          0,
  quantity:        0,
  search_query:    0,
  url:             0,
  page_title:      0,
  button_label:    0,
  navigation_text: 0,
  unknown:         1,
};

/**
 * Look up the sensitivity level for a detected data type.
 * Returns 1 (low) for unknown types.
 */
export function getSensitivityLevel(dataType: DataType): SensitivityLevel {
  return TAXONOMY[dataType] ?? 1;
}

/**
 * Get the human-readable name for a sensitivity level.
 */
export function getSensitivityLabel(level: SensitivityLevel): string {
  switch (level) {
    case 0: return 'Public';
    case 1: return 'Low Sensitivity';
    case 2: return 'Personal';
    case 3: return 'Confidential';
    case 4: return 'Highly Sensitive';
    default: return 'Unknown';
  }
}

/**
 * Get the treatment description for a sensitivity level.
 */
export function getTreatmentDescription(level: SensitivityLevel): string {
  switch (level) {
    case 0: return 'Allow — transmitted as-is';
    case 1: return 'Allow — transmitted as-is';
    case 2: return 'Pseudonymize — replace with tokens';
    case 3: return 'Redact or Protective Proxy';
    case 4: return 'Never transmit — always remain local';
    default: return 'Unknown';
  }
}

/**
 * Check if a data type is in the "high sensitivity" bucket (level >= 3).
 */
export function isHighSensitivity(dataType: DataType): boolean {
  return getSensitivityLevel(dataType) >= 3;
}

/**
 * Check if a data type should never be transmitted (level 4).
 */
export function isNeverTransmit(dataType: DataType): boolean {
  return getSensitivityLevel(dataType) === 4;
}
