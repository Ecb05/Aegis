# Configuration

Aegis has browser-side configuration and server-side provider configuration.

## Browser configuration

The extension configuration includes concepts such as:

| Setting | Purpose |
|---|---|
| `privacyMode` | standard/strict/local-only/custom policy selection |
| `sensitivityThreshold` | local sensitivity threshold |
| `serverUrl` | reasoning server base URL |
| `serverTimeout` | network timeout in milliseconds |
| `enableVisualPerception` | feature flag for visual perception |
| `enableAccessibilityTree` | accessibility extraction flag |
| `showOverlay` | UI/visual debugging option |
| `autoInspect` | automatic inspection option |
| `requireConfirmation` | action confirmation policy |
| `confirmationThreshold` | low/medium/high threshold |
| `maxRetries` | retry limit |

The configuration is stored through `chrome.storage.local`.

## Server configuration

Common environment variables map to the `Config` dataclass:

```text
HOST
PORT
DEBUG
LLM_PROVIDER
LLM_BASE_URL
LLM_API_KEY
LLM_MODEL
LLM_MAX_TOKENS
LLM_TEMPERATURE
```

The current defaults use:

```text
host: 0.0.0.0
port: 8000
provider: ollama
base URL: http://localhost:11434/v1
model: qwen2.5:7b
max tokens: 1024
temperature: 0.1
```

!!! warning "Secrets"
    Never commit API keys or credentials. Use environment variables or a local `.env` file that is excluded from Git.
