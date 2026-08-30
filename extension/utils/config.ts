// Hermes Configuration

export interface HermesConfig {
  // Privacy settings
  privacyMode: 'standard' | 'strict' | 'local-only' | 'custom';
  sensitivityThreshold: number; // 0-4, above this gets redacted

  // Server settings
  serverUrl: string;
  serverTimeout: number; // ms

  // Perception settings
  enableVisualPerception: boolean;
  enableAccessibilityTree: boolean;

  // UI settings
  showOverlay: boolean;
  autoInspect: boolean;

  // Action settings
  requireConfirmation: boolean;
  confirmationThreshold: 'low' | 'medium' | 'high';
  maxRetries: number;
}

export const DEFAULT_CONFIG: HermesConfig = {
  privacyMode: 'standard',
  sensitivityThreshold: 3,
  serverUrl: 'http://localhost:8000',
  serverTimeout: 30000,
  enableVisualPerception: false, // Will be enabled in Phase 3
  enableAccessibilityTree: true,
  showOverlay: false,
  autoInspect: false,
  requireConfirmation: false,
  confirmationThreshold: 'medium',
  maxRetries: 3,
};

/**
 * Load config from chrome.storage
 */
export async function loadConfig(): Promise<HermesConfig> {
  return new Promise((resolve) => {
    chrome.storage.local.get('hermesConfig', (result) => {
      const stored = result.hermesConfig as Partial<HermesConfig> | undefined;
      resolve({ ...DEFAULT_CONFIG, ...(stored || {}) });
    });
  });
}

/**
 * Save config to chrome.storage
 */
export async function saveConfig(config: Partial<HermesConfig>): Promise<void> {
  const current = await loadConfig();
  const updated = { ...current, ...config };
  return new Promise((resolve) => {
    chrome.storage.local.set({ hermesConfig: updated }, resolve);
  });
}
