# Hermes Architecture

## Overview

Hermes is a privacy-preserving runtime for lightweight browser agents. It sits between the browser and the reasoning model, enforcing a strict privacy boundary.

## System Components

```
┌──────────────────────────────────────────────────────────────┐
│                         USER                                 │
│                   Natural-language task                       │
└────────────────────────┬─────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────┐
│                      BROWSER                                  │
│  ┌──────────────────────────────────────────────────────────┐│
│  │               SIDE PANEL (UI)                            ││
│  │  Task input, progress, privacy preview, activity log     ││
│  └──────────────────────────┬───────────────────────────────┘│
│                             │                                │
│  ┌──────────────────────────▼───────────────────────────────┐│
│  │               TRUSTED EXTENSION                          ││
│  │                                                          ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ││
│  │  │   CONTENT    │  │   SERVICE    │  │  OFFSCREEN   │  ││
│  │  │   SCRIPT     │  │   WORKER     │  │  DOCUMENT    │  ││
│  │  │              │  │              │  │              │  ││
│  │  │ DOM extract  │  │ Task manager │  │ ONNX Runtime │  ││
│  │  │ Screenshot   │  │ Message hub  │  │ Transformers │  ││
│  │  │ Action exec  │  │ Tab routing  │  │ WebGPU/WASM  │  ││
│  │  │              │  │              │  │              │  ││
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  ││
│  │         │                 │                 │           ││
│  │         └────────┬────────┘                 │           ││
│  │                  │                          │           ││
│  │         ┌────────▼──────────────────────────┘           ││
│  │         │                                               ││
│  │  ┌──────▼──────────┐    ┌─────────────────────┐        ││
│  │  │  PERCEPTION     │    │  PRIVACY ENGINE      │        ││
│  │  │  FUSION         │    │  Detection cascade   │        ││
│  │  │  DOM + Vision   │───▶│  Sensitivity classify│        ││
│  │  │  IoU matching   │    │  Task relevance      │        ││
│  │  └─────────────────┘    │  Redaction/proxy     │        ││
│  │                         └──────────┬──────────┘        ││
│  │                                    │                    ││
│  │                         ══════════════════════════════  ││
│  │                         ║   PRIVACY BOUNDARY    ║       ││
│  │                         ══════════════════════════════  ││
│  │                                    │                    ││
│  │  ┌─────────────────────┐          │                    ││
│  │  │  ACTION VALIDATOR   │◀─────────┘                    ││
│  │  │  Schema + Risk      │                               ││
│  │  │  Policy engine      │                               ││
│  │  │  User confirmation  │                               ││
│  │  └─────────────────────┘                               ││
│  └──────────────────────────────────────────────────────────┘│
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTPS / WebSocket
┌────────────────────────▼─────────────────────────────────────┐
│                       SERVER                                  │
│                                                              │
│   Agent Orchestrator                                         │
│        │                                                     │
│        ▼                                                     │
│   LLM / VLM  (receives sanitized state only)                │
│        │                                                     │
│        ▼                                                     │
│   Action Planner  →  Action JSON                             │
│                                                              │
│   ⚠️  Server NEVER sees: raw PII, screenshots, passwords,   │
│      credit cards, health data, API keys                     │
│   ✓  Server CAN see: page structure, element labels,         │
│      pseudonymized tokens, user's task description            │
└──────────────────────────────────────────────────────────────┘
```

## Extension Execution Contexts

Hermes runs across three Chrome extension contexts, each with specific responsibilities:

| Context | Capabilities | Limitations | Hermes Role |
|---------|-------------|-------------|-------------|
| **Service Worker** | Extension APIs, messaging, tab management | No DOM, no WebGPU, gets killed when idle | Orchestrator, task manager, message routing |
| **Content Script** | DOM access, screenshot capture, event dispatch | No WebGPU, limited by page CSP, throttled in background tabs | DOM extraction, action execution, event handling |
| **Offscreen Document** | DOM, WebGPU, persistent, WASM | Only one per extension, limited extension API access | ALL model inference (ONNX Runtime Web + Transformers.js) |

## Multi-Tab Operation (Debugger API)

Hermes uses `chrome.debugger` to operate on background tabs while the user browses elsewhere:

```
User on Tab B (YouTube)     Agent operating on Tab A (BookMyShow)
       │                            │
       │    ┌───────────────────────┘
       │    │
       │    ▼
       │  chrome.debugger.attach({ tabId: A })
       │  chrome.debugger.sendCommand({ tabId: A },
       │    "Page.captureScreenshot")    ← screenshot Tab A
       │  chrome.debugger.sendCommand({ tabId: A },
       │    "Runtime.evaluate", {...})   ← DOM of Tab A
       │  chrome.debugger.sendCommand({ tabId: A },
       │    "Input.dispatchMouseEvent")  ← click in Tab A
       │
  User freely browses Tab B, agent is unaffected
```

**Permission**: `"debugger"` + `"<all_urls>"` in manifest.json
**Tradeoff**: One-time Chrome warning banner per session ("Hermes is debugging this browser")

## Model Inference Architecture

```
OFFSCREEN DOCUMENT (hidden, persistent):
┌─────────────────────────────────────────────────────┐
│                                                      │
│  Transformers.js v4                                  │
│    │                                                 │
│    ├── pipeline("object-detection")  → UI elements   │
│    ├── pipeline("image-classification") → page type  │
│    ├── pipeline("feature-extraction") → embeddings   │
│    └── Tesseract.js (OCR)           → visible text   │
│                                                      │
│  ONNX Runtime Web                                    │
│    ├── WebGPU backend (preferred, GPU-accelerated)   │
│    └── WASM backend (fallback, universal)            │
│                                                      │
│  Model cache: Chrome CacheStorage (Service Worker)   │
│  First load: download from HuggingFace Hub           │
│  Subsequent: load from disk cache (~200ms)           │
└─────────────────────────────────────────────────────┘
```

## Data Flow

1. **Observe**: Extract DOM + capture screenshot (content script or debugger API)
2. **Perceive**: Run local vision model in offscreen document (ONNX/WebGPU)
3. **Fuse**: Combine DOM + vision via IoU spatial matching (offscreen document)
4. **Sanitize**: Detect PII, classify sensitivity, assess task relevance, redact/proxy (privacy engine)
5. **Send**: Transmit sanitized state to server (never raw data)
6. **Reason**: LLM determines next action (server)
7. **Plan**: Generate structured action JSON (server)
8. **Validate**: Local policy engine validates action (schema + risk + confirmation)
9. **Execute**: Perform browser action (content script or debugger API)
10. **Repeat**: Observe new state

## Privacy Boundary

The privacy boundary is the critical architectural constraint:

```
RAW DATA → LOCAL PROCESSING → SANITIZED DATA → NETWORK
```

This direction is never reversed. Sensitive information (passwords, emails, financial data, PII) never leaves the client in raw form.

### What Crosses the Boundary

| Data Type | Treatment | Example |
|-----------|-----------|---------|
| Page structure | Pass through | button_0 "Book Tickets" at [x,y] |
| Element labels | Pass through | "Mumbai", "5:00 PM", "₹150" |
| User's task | Pass through | "Book movie at 5pm today" |
| Element sensitivity metadata | Pass through | input_3: sensitivity=3, type=email |
| Pre-filled status | Pass through | "Email field: pre-filled (don't touch)" |
| Pseudonymized tokens | Pass through | \<EMAIL_1\>, \<PERSON_1\> |

### What NEVER Crosses

| Data Type | Treatment |
|-----------|-----------|
| Actual email addresses | Never sent to server |
| Phone numbers | Never sent to server |
| Passwords | Never transmitted, not even redacted version |
| Credit card numbers | Never transmitted |
| Health/medical data | Never transmitted |
| API keys / secrets | Never transmitted |
| Raw screenshots | Processed locally, discarded after perception |
| Pseudonymization map | Client-side only |

## Sensitivity Levels

| Level | Name | Treatment |
|-------|------|-----------|
| 0 | Public | Allow — transmitted as-is |
| 1 | Low Sensitivity | Allow — transmitted as-is |
| 2 | Personal | Pseudonymize — replace with tokens |
| 3 | Confidential | Redact or Protective Proxy |
| 4 | Highly Sensitive | Never transmit — always remain local |

## Action Security

The LLM never directly executes JavaScript. Instead:

```
LLM → Structured Action → Schema Validation → Risk Assessment
  → Policy Check → User Confirmation (if needed) → Executor
```

Actions are typed, validated, and subject to risk-based policies.

## Technology Stack

### Client (Extension)
- **Browser**: Chrome (initially), Firefox (later)
- **Extension**: Manifest V3, TypeScript, esbuild
- **Inference**: ONNX Runtime Web, WebGPU, WebAssembly, Transformers.js v4
- **Perception**: DOM APIs, Accessibility/ARIA, Computer Vision, OCR
- **Multi-tab**: Chrome Debugger API (DevTools Protocol)

### Server
- **Runtime**: Python 3.11+
- **Framework**: FastAPI
- **LLM/VLM**: Pluggable (OpenAI, Anthropic, local)
- **Validation**: Pydantic
- **Transport**: HTTP (initially), WebSocket (later)
