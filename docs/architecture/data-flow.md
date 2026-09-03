# Data flow

The most important architectural distinction in Aegis is the difference between **raw local state**, **sanitized outbound state** and **structured inbound actions**.

```mermaid
sequenceDiagram
  participant U as User
  participant UI as Side panel
  participant C as Content script
  participant O as Offscreen inference
  participant P as Privacy engine
  participant S as Server
  participant L as LLM

  U->>UI: Enter task
  UI->>C: Inspect page
  C-->>UI: BrowserState
  UI->>O: Screenshot / perceive
  O-->>UI: classification + detections + OCR
  UI->>UI: Fuse DOM + vision
  UI->>P: BrowserState + task
  P-->>UI: SanitizedState
  UI->>S: POST /agent/step
  S->>L: Prompt from sanitized state
  L-->>S: Structured next action
  S-->>UI: AgentStepResponse
  UI->>C: Execute action
  C-->>UI: ActionResult
  UI->>C: Observe changed page
```

## Local data

May include page values, DOM attributes, the screenshot and the pseudonym mapping. These should remain inside the trusted extension boundary according to the final policy.

## Outbound data

The server contract contains:

- sanitized elements
- page information
- task text
- privacy statistics
- step number
- previous action result
- session identifier

See [Sanitized state](../reference/sanitized-state.md) and [HTTP API](../reference/api.md).

## Inbound data

The server returns one structured action with optional parameters, reasoning/status text, completion status and session identifier.
