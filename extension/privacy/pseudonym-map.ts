// Hermes Privacy Engine — Pseudonymization Map
// Session-scoped token ↔ real value mapping
// Lives CLIENT-SIDE ONLY — never sent to the server

import type { DataType } from '../utils/messaging';

/**
 * Token prefixes by data type.
 * Each type gets its own sequence: <EMAIL_1>, <EMAIL_2>, <PERSON_1>, etc.
 */
const TOKEN_PREFIXES: Record<DataType, string> = {
  email:           'EMAIL',
  phone:           'PHONE',
  full_name:       'PERSON',
  first_name:      'PERSON',
  last_name:       'PERSON',
  address_line:    'ADDRESS',
  zip_code:        'ZIP',
  date_of_birth:   'DOB',
  credit_card:     'CARD',
  pan_number:      'PAN',
  aadhaar_number:  'AADHAAR',
  ssn:             'SSN',
  passport_number: 'PASSPORT',
  api_key:         'API_KEY',
  ifsc_code:       'IFSC',
  upi_id:         'UPI',
  insurance_id:    'INSURANCE',
  security_question: 'SECURITY_Q',
  gender:          'GENDER',
  // Types that don't get pseudonymized
  password:        '',
  pin:             '',
  cvv:             '',
  mfa_code:        '',
  hidden_field:    '',
  debit_card:      'CARD',
  bank_account:    'BANK',
  card_expiry:     'CARD',
  medical_record:  'MEDICAL',
  otp:             'OTP',
  // Low-sensitivity types — no token needed
  product_name:    '',
  price:           '',
  date:            '',
  time:            '',
  location_name:   '',
  category:        '',
  rating:          '',
  quantity:        '',
  search_query:    '',
  url:             '',
  page_title:      '',
  button_label:    '',
  navigation_text: '',
  unknown:         '',
};

export class PseudonymMap {
  private tokenToValue: Map<string, string> = new Map();
  private valueToToken: Map<string, string> = new Map();
  private counters: Map<string, number> = new Map();

  /**
   * Get or create a token for a real value.
   * Same value always returns the same token within a session.
   *
   * @param value - The real value to tokenize
   * @param dataType - The detected data type (determines token prefix)
   * @returns The token (e.g., "<EMAIL_1>") or the original value if no tokenization needed
   */
  tokenize(value: string, dataType: DataType): string {
    if (!value || value.trim().length === 0) return value;

    const prefix = TOKEN_PREFIXES[dataType];
    if (!prefix) return value; // No tokenization for this type

    // Check if already tokenized
    const existingToken = this.valueToToken.get(value);
    if (existingToken) return existingToken;

    // Generate new token
    const count = (this.counters.get(prefix) || 0) + 1;
    this.counters.set(prefix, count);

    const token = `<${prefix}_${count}>`;

    this.tokenToValue.set(token, value);
    this.valueToToken.set(value, token);

    return token;
  }

  /**
   * Resolve a token back to the real value.
   *
   * @param token - The token to resolve (e.g., "<EMAIL_1>")
   * @returns The real value, or the token itself if not found
   */
  resolve(token: string): string {
    return this.tokenToValue.get(token) || token;
  }

  /**
   * Check if a string is a token managed by this map.
   */
  isToken(value: string): boolean {
    return this.tokenToValue.has(value);
  }

  /**
   * Get the real value for a token, or null if not found.
   */
  getRealValue(token: string): string | null {
    return this.tokenToValue.get(token) || null;
  }

  /**
   * Get all tokens (for debugging / display).
   */
  getAllTokens(): Array<{ token: string; value: string; type: string }> {
    const result: Array<{ token: string; value: string; type: string }> = [];
    for (const [token, value] of this.tokenToValue) {
      // Extract type from token: <EMAIL_1> → EMAIL
      const match = token.match(/^<(\w+)_\d+>$/);
      const type = match ? match[1] : 'UNKNOWN';
      result.push({ token, value, type });
    }
    return result;
  }

  /**
   * Get the count of tokens by type.
   */
  getStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [prefix, count] of this.counters) {
      stats[prefix] = count;
    }
    return stats;
  }

  /**
   * Clear all mappings (call when task completes).
   */
  clear(): void {
    this.tokenToValue.clear();
    this.valueToToken.clear();
    this.counters.clear();
  }

  /**
   * Get the total number of tokenized values.
   */
  get size(): number {
    return this.valueToToken.size;
  }
}

// Singleton instance (per session)
let globalMap: PseudonymMap | null = null;

/**
 * Get or create the global pseudonym map.
 */
export function getPseudonymMap(): PseudonymMap {
  if (!globalMap) {
    globalMap = new PseudonymMap();
  }
  return globalMap;
}

/**
 * Reset the global pseudonym map (call when starting a new task).
 */
export function resetPseudonymMap(): PseudonymMap {
  if (globalMap) {
    globalMap.clear();
  }
  globalMap = new PseudonymMap();
  return globalMap;
}
