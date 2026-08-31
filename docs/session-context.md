# Session Context — Planning Phase Summary

> **Purpose**: This file captures all architectural decisions from the planning session.
> The CLI agent should read this FIRST before continuing development.

## Current Codebase State

**Phase 1 (DOM extraction + messaging): ✅ COMPLETE**
**Phase 2 (Action executor): ✅ COMPLETE**
**Phase 3 (Visual perception): ❌ NOT STARTED**
**Phase 4 (Privacy engine): ❌ NOT STARTED**
**Phase 5 (Server + LLM): ❌ NOT STARTED**

### What's Already Built

| Component | File | Status |
|-----------|------|--------|
| Manifest V3 | `extension/manifest.json` | ✅ (missing `debugger` + `offscreen` permissions) |
| Service Worker | `extension/background/service-worker.ts` | ✅ Routes messages, tracks active tab |
| Content Script | `extension/content/content.ts` | ✅ INSPECT_PAGE + EXECUTE_ACTION handlers |
| DOM Parser | `extension/content/dom-parser.ts` | ✅ Recursive DOM extraction, Hermes IDs, shadow DOM |
| Action Executor | `extension/content/action-executor.ts` | ✅ All 8 action types (click, type, scroll, select, hover, navigate, wait, press_key) |
| Messaging Types | `extension/utils/messaging.ts` | ✅ Full type system (HermesMessage, BrowserState, HermesElement, ActionRequest, ActionResult) |
| Side Panel UI | `extension/ui/sidepanel/` | ✅ Dark theme, element list, action tester |
| Config | `extension/utils/config.ts` | ✅ Settings storage (not wired to UI yet) |
| Logger | `extension/utils/logger.ts` | ✅ Structured logging (not imported yet) |
| Build System | `scripts/build-extension.js` | ✅ esbuild bundler → `dist/` |
| Demo Page | `demo/appointment-site/index.html` | ✅ Appointment booking test form |

### What the Codebase Overview Doc Captures

`docs/codebase-overview.md` has a complete file-by-file breakdown of the existing code. Read it for details on every existing file.

## What Needs to Be Built Next

### Immediate: Missing Manifest Permissions

The manifest is missing permissions needed for multi-tab operation and offscreen documents:

```json
// ADD these to manifest.json permissions:
"debugger",       // multi-tab operation via DevTools Protocol
"offscreen"       // model inference in hidden document
```

### Phase 3: Local Visual Perception

**New files needed:**
```
extension/offscreen/
  index.html              ← offscreen document entry point
  inference.ts            ← ONNX Runtime Web + Transformers.js
  model-manager.ts        ← model loading, caching, lifecycle

extension/perception/
  screenshot.ts           ← screenshot capture (content script + debugger API)
  vision-model.ts         ← local vision inference (calls offscreen doc)
  ui-detector.ts          ← object detection, bounding boxes
  dom-perception.ts       ← DOM-based element detection (already in dom-parser.ts)
  fusion.ts               ← IoU matching between DOM + vision results
```

**Key decisions:**
- All model inference runs in offscreen document (not service worker, not content script)
- ONNX Runtime Web with WebGPU preferred, WASM fallback
- Models: MobileNetV4 (classification), DETR (detection), Tesseract.js (OCR)
- Transformers.js v4 for model loading + pipeline API
- Screenshot captured via `chrome.debugger` for background tab support

### Phase 4: Privacy Engine

**New files needed:**
```
extension/privacy/
  detection-cascade.ts    ← universal detection pipeline (autocomplete → type → aria → label → regex)
  taxonomy.ts             ← universal sensitivity taxonomy (fixed data type → level mapping)
  task-relevance.ts       ← task-aware relevance assessment (RELEVANT/CONDITIONAL/NEVER)
  pii-detector.ts         ← regex-based PII detection (email, phone, card, etc.)
  sensitivity.ts          ← level classification
  redactor.ts             ← redaction/pseudonymization
  pseudonym-map.ts        ← session-scoped token mapping (client-side only)
  policy.ts               ← privacy modes, user preferences
```

**Key decisions:**
- Three-layer engine: Detection Cascade → Sensitivity Taxonomy → Task Relevance
- Quadrant treatment: sensitivity × relevance → PASS/REDACT/PSEUDONYMIZE/PROTECTIVE_PROXY
- Session-scoped pseudonymization map (same value → same token within task)
- Three patterns for sensitive data: pre-filled ("don't touch"), empty ("ask user"), user-provided ("extract locally")

### Phase 5: Server + LLM

```
server/
  main.py                 ← FastAPI app
  config.py               ← settings
  api/
    routes.py             ← HTTP endpoints
    websocket.py          ← WebSocket (later)
  agent/
    orchestrator.py       ← task loop management
    planner.py            ← LLM prompt building + action planning
    state.py              ← session state
    prompts/              ← system/user prompts
  models/
    llm.py                ← LLM provider abstraction
    vlm.py                ← vision model (future)
  tools/
    browser-tools.py      ← browser action schemas
    schemas.py            ← Pydantic models
```

### Phase 6: Agent Loop (observe→reason→act)

The full autonomous loop:
1. Observe: DOM extraction + screenshot
2. Perceive: Local vision inference
3. Fuse: DOM + vision via IoU matching
4. Sanitize: Privacy engine (detect → classify → redact)
5. Send: Sanitized state to server
6. Reason: LLM determines next action
7. Validate: Schema + risk assessment
8. Execute: Browser action
9. Repeat

## Multi-Tab Architecture (New)

The user's key requirement: **agent operates on one tab while user browses another**.

This requires `chrome.debugger` API:
- `Page.captureScreenshot` — screenshot any tab (not just visible)
- `Runtime.evaluate` — execute JS in any tab
- `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent` — click/type in any tab
- No timer throttling in background tabs

**Implementation:**
```
extension/utils/debugger-bridge.ts  ← chrome.debugger wrapper
```

The service worker becomes a **task manager** routing perception/action to specific tabs via debugger API.

## Privacy Engine Design

### Universal Detection Cascade (Site-Agnostic)

```
autocomplete attribute → input type → aria-label → 
<label> proximity → placeholder → value regex → default Level 1
```

Works on ANY website without per-site configuration.

### Sensitivity Taxonomy (Fixed)

| Level | Data Types |
|-------|-----------|
| 4 (Never) | password, pin, credit_card, cvv, ssn, pan, aadhaar, api_key, medical |
| 3 (Redact) | email, phone, address, ifsc, upi, insurance |
| 2 (Pseudo) | name, dob, gender, zip |
| 0-1 (Allow) | price, date, time, location, product, button_label, navigation |

### Quadrant Treatment

| | Low Relevance | High Relevance |
|---|---|---|
| **Low Sensitivity** | Pass through | Pass through |
| **High Sensitivity** | Redact | Protective Proxy |

### Protective Proxy Pattern

When sensitive data is needed for the task but must stay local:
1. Pre-filled fields → "Don't touch" (agent clicks submit without seeing value)
2. Empty fields → "Ask user" (user provides value, typed locally)
3. User-provided in task → "Extract locally" (PII parsed from task, mapped to tokens)

## Competitive Positioning

| Feature | ChatGPT Atlas | Anthropic Computer Use | Browser Use | **Hermes** |
|---------|--------------|----------------------|-------------|-----------|
| Perception | AXTree + vision | Screenshots | AXTree | **DOM + local vision** |
| User session | ✗ Fresh browser | ✗ Remote VM | ✗ Fresh browser | **✓ User's browser** |
| Anti-bot | Low detect | Medium | HIGH detect | **None** |
| Privacy | ✗ Server sees all | ✗ Server sees all | ✗ Server sees all | **✓ Client-only PII** |
| Bad A11Y | ⚠️ Fallback | ✓ Pixels | ✗ Breaks | **✓ Live DOM** |
| Multi-tab | ✓ Browser | ✗ | ✗ | **✓ Debugger API** |

## Key Messages to Pass to CLI

If starting fresh in the Freebuff CLI, paste this:

```
Read docs/session-context.md — full briefing from planning session.
Then read docs/codebase-overview.md — file-by-file breakdown of 
existing code. Then read docs/architecture.md, docs/privacy-model.md,
docs/action-protocol.md, and docs/technical-decisions.md for specs.

The codebase already has Phase 1 (DOM extraction + messaging) and 
Phase 2 (action executor) complete. We need to build:
1. Add debugger + offscreen permissions to manifest
2. Phase 3: Offscreen document + local vision perception
3. Phase 4: Generalized privacy engine
4. Phase 5: FastAPI server + LLM integration
5. Phase 6: Full agent loop

Start by adding the missing manifest permissions, then we'll 
build the offscreen document for model inference.
```
