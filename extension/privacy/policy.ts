// Hermes Privacy Engine — Policy
// Privacy mode selection and configuration

export type PrivacyMode = 'standard' | 'strict' | 'local-only';

export interface PrivacyPolicy {
  mode: PrivacyMode;
  description: string;
  pseudonymizeLevel: number;  // Minimum sensitivity level to pseudonymize
  redactLevel: number;        // Minimum sensitivity level to redact
  omitLevel: number;          // Minimum sensitivity level to omit entirely
  protectProxyLevel: number;  // Minimum sensitivity level for protective proxy on RELEVANT fields
}

const POLICIES: Record<PrivacyMode, PrivacyPolicy> = {
  standard: {
    mode: 'standard',
    description: 'Default: Level 0-1 pass, Level 2 pseudonymize, Level 3 redact, Level 4 never transmit',
    pseudonymizeLevel: 2,
    redactLevel: 3,
    omitLevel: 4,
    protectProxyLevel: 3,
  },
  strict: {
    mode: 'strict',
    description: 'More aggressive: Level 2 redact, Level 3 omit entirely',
    pseudonymizeLevel: 2,  // Not used in strict — goes straight to redact
    redactLevel: 2,
    omitLevel: 3,
    protectProxyLevel: 4,
  },
  'local-only': {
    mode: 'local-only',
    description: 'Nothing sensitive crosses the boundary; requires local LLM only',
    pseudonymizeLevel: 999, // Never pseudonymize — everything sensitive is omitted
    redactLevel: 999,
    omitLevel: 2,
    protectProxyLevel: 999,
  },
};

let currentMode: PrivacyMode = 'standard';

/**
 * Get the current privacy policy.
 */
export function getCurrentPolicy(): PrivacyPolicy {
  return POLICIES[currentMode];
}

/**
 * Set the privacy mode.
 */
export function setPrivacyMode(mode: PrivacyMode): PrivacyPolicy {
  currentMode = mode;
  console.log(`[Hermes Privacy] Mode set to: ${mode}`);
  return POLICIES[mode];
}

/**
 * Get all available privacy modes.
 */
export function getAvailableModes(): Array<{ mode: PrivacyMode; description: string }> {
  return Object.values(POLICIES).map((p) => ({
    mode: p.mode,
    description: p.description,
  }));
}

/**
 * Get the current mode name.
 */
export function getCurrentMode(): PrivacyMode {
  return currentMode;
}
