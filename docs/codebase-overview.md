# Hermes Codebase Overview

> Generated after commit `86fe743` — fix sidepanel and service worker
> Updated with planning session context (see docs/session-context.md)

## Architecture: 3 Layers, 2 Message Paths

```
┌──────────────────────┐
│   SIDE PANEL (UI)    │  User sees elements, triggers actions
│   sidepanel.ts       │
└──────────┬───────────┘
           │ chrome.runtime.connect() → port
┌──────────▼───────────┐
│   SERVICE WORKER     │  Routes messages, manages tabs, injects scripts
│   service-worker.ts  │
└──────────┬───────────┘
           │ chrome.tabs.sendMessage()
┌──────────▼───────────┐
│   CONTENT SCRIPT     │  Lives inside the webpage, touches the DOM
│   content.ts         │
└──────────────────────┘
           │ chrome.runtime.sendMessage() → back to service worker → port → side panel
```

## File-by-File Breakdown

### `extension/manifest.json` — Extension Config
Chrome Manifest V3 configuration. Declares:
- **Permissions**: `activeTab`, `sidePanel`, `scripting`, `tabs`, `storage`
- **Content script**: `content/content.js` injected on all pages at `document_idle`
- **Service worker**: `background/service-worker.js`
- **Side panel**: `ui/sidepanel/sidepanel.html`

⚠️ **MISSING PERMISSIONS** (needed for next phases):
- `"debugger"` — multi-tab operation via DevTools Protocol
- `"offscreen"` — model inference in hidden document

---

### `extension/utils/messaging.ts` — The Type System
Defines every message and data structure in the system:

| Type | What it carries |
|------|----------------|
| `HermesMessage` | `{ type, payload, source, timestamp }` — every message follows this |
| `BrowserState` | `{ page, elements[], metadata }` — the full page snapshot |
| `HermesElement` | `{ id, role, label, tag, bbox, visible, attributes }` — one interactive element |
| `ActionRequest` | `{ action, target, params }` — what to do and where |
| `ActionResult` | `{ success, action, target, error }` — what happened |
| `ActionType` | `'click' \| 'type' \| 'scroll' \| 'select' \| 'hover' \| 'navigate' \| 'wait' \| 'press_key'` |

---

### `extension/utils/config.ts` — Settings
Stores extension config in `chrome.storage.local`. Defaults for privacy mode, server URL (`localhost:8000`), thresholds. Not used by the UI yet — prepared for Phase 4+.

---

### `extension/utils/logger.ts` — Logging
A `Logger` class with levels (debug/info/warn/error), stores last 1000 entries in memory. Not imported by other files yet — ready for structured logging.

---

### `extension/background/service-worker.ts` — The Router
**Two message paths:**

1. **Receives requests from side panel** → forwards to content script
   ```
   side panel port.onMessage → handleFromSidePanel()
     → ensure content script injected (PING test → inject if missing)
     → chrome.tabs.sendMessage(tabId, message) → fire-and-forget
   ```

2. **Receives responses from content script** → forwards to side panel
   ```
   chrome.runtime.onMessage (from content) → port.postMessage(message)
   ```

Also tracks `activeTabId` via `tabs.onActivated` and `tabs.onUpdated`.

**Future role**: Will become the task manager routing perception/action to specific tabs via debugger API.

---

### `extension/content/content.ts` — The Orchestrator
Runs inside every webpage. One message listener with two jobs:

1. **INSPECT_PAGE** → calls `buildBrowserState()` → sends `PAGE_STATE` back via `chrome.runtime.sendMessage()`
2. **EXECUTE_ACTION** → calls `executeAction()` → sends `ACTION_RESULT` back via `chrome.runtime.sendMessage()`

`buildBrowserState()` does:
1. Clears old `data-hermes-id` attributes
2. Calls `extractElements()` from dom-parser
3. Wraps in `BrowserState` with page info + metadata

---

### `extension/content/dom-parser.ts` — The Eyes
Extracts interactive elements from any page. Key functions:

| Function | What it does |
|----------|-------------|
| `extractElements()` | Main entry — walks DOM, returns `HermesElement[]` |
| `queryAllDeep(root)` | Recursively finds all interactive elements, including shadow DOM |
| `isInteractive(el)` | Checks tag, ARIA role, contenteditable, tabindex |
| `getElementRole(el)` | Maps DOM element → Hermes role (button/textbox/select/etc) |
| `getAccessibleLabel(el)` | Tries aria-label → labelledby → placeholder → text → name |
| `getBoundingBox(el)` | Gets element position/size for visual overlay |
| `isElementVisible(el)` | Checks display/visibility/opacity/bounds |

The `walk()` inside `queryAllDeep` visits **every child recursively** (not just direct children), which is why it finds elements on complex pages like WhatsApp.

---

### `extension/content/action-executor.ts` — The Hands
Executes actions on DOM elements. Key functions:

| Function | How it works |
|----------|-------------|
| `executeClick(target)` | scrollIntoView → focus → mousedown/mouseup/click events with coordinates |
| `executeType(target, text)` | Simulates real keystrokes: keydown → keypress → `execCommand('insertText')` → keyup per character |
| `executeScroll(params)` | `window.scrollBy()` with direction/amount |
| `executeSelect(target, value)` | Finds option by value or text → sets selectedIndex → dispatches change |
| `executeHover(target)` | mouseenter/mouseover/mousemove events |
| `executeNavigate(params)` | `window.location.href = url` |
| `executeWait(params)` | Either sleep for duration, or poll for element visibility/hidden |
| `executePressKey(params)` | keydown/keyup on active element with modifiers |
| `findElementByHermesId(id)` | First tries `querySelector([data-hermes-id])`, then falls back to role+index |

---

### `extension/ui/sidepanel/sidepanel.*` — The UI
- **HTML**: Two-column dark layout with page info, element list, action tester, JSON output
- **CSS**: Dark theme, role badges, interactive element list
- **TS**: Connects via port, sends requests, receives responses, renders everything

Key flow:
```
inspectPage() → sendAndWait('INSPECT_PAGE') → displayState()
testAction()  → sendAndWait('EXECUTE_ACTION') → show result → auto re-inspect
```

---

### `demo/appointment-site/index.html` — Test Page
Simple appointment booking form with: Patient Name, Email, Phone, Date, Time (dropdown), Department (dropdown), Notes, Submit button. Auto-sets date to tomorrow. On submit shows confirmation.

---

### `scripts/build-extension.js` — Build System
1. Uses esbuild to bundle each TS file into a single IIFE (no ES module imports)
2. Copies `manifest.json`, HTML, CSS, icons to `dist/`
3. Output: `dist/` folder ready to load as unpacked extension

---

### `docs/` — Documentation
| File | Purpose |
|------|---------|
| `docs/architecture.md` | System architecture, data flow diagrams, technology stack |
| `docs/privacy-model.md` | Sensitivity levels, PII detection, redaction strategies |
| `docs/action-protocol.md` | Action schema, risk classification, validation pipeline |
| `docs/technical-decisions.md` | Detailed rationale for all architectural choices |
| `docs/session-context.md` | Planning session briefing for CLI agents |
| `docs/codebase-overview.md` | This file |

---

## Message Flow: Inspect Page

```
Side Panel                Service Worker              Content Script
    │                          │                          │
    │── INSPECT_PAGE ─────────▶│                          │
    │                          │── INSPECT_PAGE ─────────▶│
    │                          │                          │ (extracts DOM)
    │                          │◀── PAGE_STATE ───────────│
    │◀── PAGE_STATE ───────────│                          │
    │ (renders elements)       │                          │
```

## Message Flow: Execute Action

```
Side Panel                Service Worker              Content Script
    │                          │                          │
    │── EXECUTE_ACTION ───────▶│                          │
    │                          │── EXECUTE_ACTION ───────▶│
    │                          │                          │ (runs action)
    │                          │◀── ACTION_RESULT ────────│
    │◀── ACTION_RESULT ────────│                          │
    │ (shows result, re-inspects)                        │
```

---

## What's Built vs What's Next

| Phase | Feature | Status |
|-------|---------|--------|
| 0 | Repo structure, docs | ✅ |
| 1 | DOM extraction, Hermes IDs, messaging | ✅ |
| 2 | Action executor, 8 action types | ✅ |
| **3** | **Local visual perception (screenshot + CV)** | ❌ Next |
| **4** | **Privacy engine (PII detection, redaction)** | ❌ |
| **5** | **FastAPI server + LLM integration** | ❌ |
| **6** | **Agent loop (observe→reason→act cycle)** | ❌ |
| **7** | **Policy engine (allow/confirm/block)** | ❌ |

## Next Steps (From Planning Session)

1. **Add missing manifest permissions**: `debugger`, `offscreen`
2. **Create offscreen document**: `extension/offscreen/index.html` + `inference.ts`
3. **Add debugger bridge**: `extension/utils/debugger-bridge.ts` for background tab operation
4. **Build perception pipeline**: screenshot → ONNX inference → DOM+vision fusion
5. **Build privacy engine**: detection cascade → sensitivity taxonomy → task relevance → redaction
6. **Build server**: FastAPI + LLM integration + action planning
7. **Wire agent loop**: observe → perceive → sanitize → reason → validate → execute → repeat

See `docs/session-context.md` for full architectural decisions and `docs/technical-decisions.md` for detailed rationale.
