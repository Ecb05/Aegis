// Hermes Privacy Engine — Task Relevance Assessment
// Layer 3: Determines which elements matter for the user's task
// The same field can be sensitive or irrelevant depending on context

import type {
  HermesElement,
  DataType,
  Relevance,
  TaskRelevanceResult,
} from '../utils/messaging';

/**
 * Intent keywords → required field types mapping.
 * When the user's task contains these keywords, the corresponding
 * field types become RELEVANT or CONDITIONAL.
 */
const INTENT_FIELD_MAP: Array<{
  intentKeywords: string[];
  relevantTypes: DataType[];
  conditionalTypes: DataType[];
}> = [
  // Booking / purchasing tasks
  {
    intentKeywords: ['book', 'buy', 'purchase', 'order', 'reserve', 'pay'],
    relevantTypes: ['date', 'time', 'quantity', 'product_name', 'price'],
    conditionalTypes: ['email', 'phone', 'address_line', 'full_name', 'credit_card'],
  },
  // Login / authentication tasks
  {
    intentKeywords: ['login', 'sign in', 'log in', 'authenticate'],
    relevantTypes: ['email', 'password'],
    conditionalTypes: [],
  },
  // Registration / signup tasks
  {
    intentKeywords: ['register', 'sign up', 'create account', 'join'],
    relevantTypes: ['email', 'full_name', 'password'],
    conditionalTypes: ['phone', 'date_of_birth', 'address_line'],
  },
  // Search / browse tasks
  {
    intentKeywords: ['search', 'find', 'browse', 'look for', 'show me'],
    relevantTypes: ['search_query', 'category', 'location_name'],
    conditionalTypes: [],
  },
  // Contact / communication tasks
  {
    intentKeywords: ['contact', 'email', 'call', 'message', 'send'],
    relevantTypes: ['email', 'phone'],
    conditionalTypes: ['full_name', 'address_line'],
  },
  // Payment tasks
  {
    intentKeywords: ['pay', 'payment', 'checkout', 'transact'],
    relevantTypes: ['credit_card', 'price'],
    conditionalTypes: ['email', 'address_line', 'phone', 'full_name'],
  },
];

/**
 * Fields that should NEVER be handled by the agent, regardless of task.
 */
const NEVER_FIELDS: DataType[] = [
  'password',
  'pin',
  'cvv',
  'mfa_code',
  'api_key',
  'ssn',
  'passport_number',
];

/**
 * Parse the user's task description to extract intent keywords.
 */
function extractIntentKeywords(task: string): string[] {
  const normalized = task.toLowerCase();
  const words = normalized.split(/\s+/);
  return words;
}

/**
 * Assess task relevance for a single element.
 *
 * Rules:
 *   1. NEVER fields are always NEVER (passwords, PINs, etc.)
 *   2. If element's data type matches an intent's relevantTypes → RELEVANT
 *   3. If element's data type matches an intent's conditionalTypes → CONDITIONAL
 *   4. If element has no detected data type (unknown) → check role
 *   5. Default → CONDITIONAL (safe assumption)
 */
export function assessTaskRelevance(
  element: HermesElement,
  dataType: DataType,
  task: string,
): TaskRelevanceResult {
  // Rule 1: NEVER fields
  if (NEVER_FIELDS.includes(dataType)) {
    return {
      relevance: 'NEVER',
      reason: `${dataType} should never be handled by the agent`,
    };
  }

  // Rule 2-3: Check intent keywords
  const intentWords = extractIntentKeywords(task);

  for (const mapping of INTENT_FIELD_MAP) {
    // Check if any intent keyword matches the task
    const intentMatch = mapping.intentKeywords.some((keyword) =>
      intentWords.some((word) => word.includes(keyword) || keyword.includes(word)),
    );

    if (!intentMatch) continue;

    // Check relevant types
    if (mapping.relevantTypes.includes(dataType)) {
      return {
        relevance: 'RELEVANT',
        reason: `${dataType} is needed for: ${mapping.intentKeywords[0]}`,
      };
    }

    // Check conditional types
    if (mapping.conditionalTypes.includes(dataType)) {
      return {
        relevance: 'CONDITIONAL',
        reason: `${dataType} may be needed for: ${mapping.intentKeywords[0]}`,
      };
    }
  }

  // Rule 4: Check role for elements without detected data type
  if (dataType === 'unknown') {
    const role = element.role;
    if (role === 'button' || role === 'link' || role === 'heading') {
      return {
        relevance: 'RELEVANT',
        reason: `${role} elements are always interactable`,
      };
    }
  }

  // Rule 5: Default
  return {
    relevance: 'CONDITIONAL',
    reason: 'No specific task relevance detected',
  };
}

/**
 * Assess task relevance for all elements.
 * Returns a map of element ID → TaskRelevanceResult.
 */
export function assessTaskRelevanceAll(
  elements: Array<{ element: HermesElement; dataType: DataType }>,
  task: string,
): Map<string, TaskRelevanceResult> {
  const results = new Map<string, TaskRelevanceResult>();

  for (const { element, dataType } of elements) {
    results.set(element.id, assessTaskRelevance(element, dataType, task));
  }

  return results;
}
