# Technical Decisions

> All architectural decisions made during the planning phase, with rationale.

## Decision 1: Offscreen Document for Model Inference

**Decision**: Model inference runs in a Chrome Extension offscreen document, not the service worker or content script.

**Rationale**:
- Service Worker: No DOM access, no WebGPU, gets killed by Chrome when idle
- Content Script: No WebGPU, subject to page CSP, dies with the tab
- Offscreen Document: Has DOM, has WebGPU, persistent, only one per extension

**Tradeoff**: Only one offscreen document can exist at a time. All model inference for all tabs shares this single runtime.

**Reference**: Chrome Extension Offscreen API (Chrome 109+). Used by production extensions like PaneTrans (Transformers.js + WebGPU).

## Decision 2: Debugger API for Multi-Tab Operation

**Decision**: Use `chrome.debugger` API to operate on background tabs, rather than requiring the user to stay on the target tab.

**Rationale**:
- `chrome.tabs.captureVisibleTab()` only captures the currently visible tab
- Content scripts in background tabs get JavaScript timer throttled to 1Hz
- `chrome.debugger` provides full DevTools Protocol access to any tab:
  - `Page.captureScreenshot` — screenshot any tab
  - `Runtime.evaluate` — execute JS in any tab context
  - `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent` — click/type in any tab
  - `DOM.getDocument` — full DOM access
  - Not subject to timer throttling

**Tradeoffs**:
- Requires `"debugger"` permission in manifest.json
- Shows a one-time "Hermes is debugging this browser" warning per session
- Slightly heavier than content-script-only approach

**User impact**: One approval click per browser session. After that, agent operates silently in background.

## Decision 3: Perception Fusion via IoU Matching

**Decision**: Fuse DOM perception and vision perception using Intersection over Union (IoU) spatial matching.

**Rationale**:
- DOM provides exact structure, types, labels, attributes (but blind to visual overlays)
- Vision provides visual detection, OCR, overlay detection (but noisy coordinates, can't read attributes)
- Fusion gives higher confidence than either source alone

**Matching algorithm**:
- IoU > 0.5: Confirmed match → merge (DOM for structure, vision for confidence)
- IoU 0.2-0.5: Possible match → flag for review
- IoU < 0.2: Unmatched → vision-only or DOM-only element

**Conflict resolution**:
- DOM wins for structure (role, type, attributes)
- Vision wins for rendered text content (what user actually sees)
- DOM aria-label takes precedence over vision OCR for labels

## Decision 4: Three-Layer Generalized Privacy Engine

**Decision**: Privacy engine uses universal detection + task relevance + sensitivity classification, NOT per-site rules.

**Rationale**: Hardcoding rules per website doesn't scale. The detection cascade works on ANY website using standard HTML/ARIA signals.

**Layer 1 — Universal Detection Cascade**:
```
autocomplete attribute → input type → aria-label → 
<label> proximity → placeholder → value regex → default Level 1
```

**Layer 2 — Universal Sensitivity Taxonomy**:
Fixed mapping of data types to sensitivity levels (password→L4, email→L3, name→L2, price→L0, etc.)

**Layer 3 — Task Relevance Assessment**:
Parse user's task description to determine which fields matter:
- RELEVANT: agent must interact with for this task
- CONDITIONAL: only relevant in certain contexts (e.g., payment only if purchasing)
- NEVER: agent should never handle (passwords, always)

**Quadrant Treatment**:
| | Low Relevance | High Relevance |
|---|---|---|
| **Low Sensitivity** | Pass through | Pass through |
| **High Sensitivity** | Redact | Protective Proxy |

## Decision 5: Protective Proxy Pattern for Sensitive Values

**Decision**: When sensitive data is both needed for the task AND highly sensitive, use a "protective proxy" — the agent operates on the field without ever seeing the actual value.

**Three patterns**:

1. **Pre-filled fields** (e.g., saved email on login):
   - Server sees: `{ field: "email", status: "pre-filled", sensitivity: 3 }`
   - Server action: `{ "action": "click", "target": "submit" }` (don't touch the email)
   - Client: executes click, pre-filled value submitted as-is

2. **Empty sensitive fields** (e.g., new registration):
   - Server sees: `{ field: "email", status: "empty", sensitivity: 3 }`
   - Server action: `{ "action": "ask_user", "message": "What email?" }`
   - Client: prompts user, types value locally, server never sees it

3. **User-provided values in task** (e.g., "book with rahul@gmail.com"):
   - Client extracts PII from task description before sending to server
   - Client stores locally, sends sanitized task: "book with \<EMAIL_1\>"
   - Server plans action referencing \<EMAIL_1\>
   - Client maps token back to real value at execution time

## Decision 6: Session-Scoped Pseudonymization Map

**Decision**: Maintain a client-side pseudonymization map that persists across observe cycles within a task session.

**Rationale**: If "rahul@gmail.com" becomes \<EMAIL_1\> in step 3, the LLM must be able to reference \<EMAIL_1\> consistently in step 7.

**Rules**:
- Map lives CLIENT-SIDE ONLY (never sent to server)
- Tokens are sequential: \<PERSON_1\>, \<PERSON_2\>, \<EMAIL_1\>, etc.
- Map is per-session (cleared when task completes)
- Same real value always maps to same token within a session

## Decision 7: Model Stack

**Decision**: Use Transformers.js v4 + ONNX Runtime Web for all local inference.

**Rationale**:
- Transformers.js v4 (2026): WebGPU runtime rewritten in C++, 53% smaller bundle, ~200ms build time
- ONNX Runtime Web: WebGPU backend (GPU accelerated), WASM fallback (universal)
- HuggingFace Hub: model catalog, automatic download + cache

**Models planned**:
| Model | Task | Size | Notes |
|-------|------|------|-------|
| MobileNetV4 | Page type classification | ~15MB | Lightweight, fast |
| DETR-ResNet-50 | UI element detection | ~170MB | Object detection with bounding boxes |
| Tesseract.js | OCR (text extraction) | ~25MB | WASM-based, for text in images |
| mxbai-embed-xsmall | Text embeddings | ~30MB | For semantic similarity |

**Device selection**: `device: 'webgpu'` preferred, auto-fallback to `'wasm'`.

## Decision 8: Task Relevance Assessment Algorithm

**Decision**: Determine task relevance by parsing the user's task description into intent + parameters, then mapping to required field types.

**Algorithm**:
1. Parse task: extract action, domain, parameters from user instruction
2. Map intent to required field types (e.g., "book movie" → needs movie selection, showtime, seats, payment)
3. For each element in browser state, check if its field type is required by the task
4. Classify: RELEVANT / CONDITIONAL / NEVER

**Example**:
- Task: "Book movie at 5pm" → needs: movie (RELEVANT), time (RELEVANT), seats (RELEVANT), payment (CONDITIONAL), email (CONDITIONAL if not logged in), password (NEVER)
