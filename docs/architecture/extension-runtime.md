# Extension runtime

Chrome Manifest V3 divides Aegis across multiple execution contexts. This is not just an implementation detail: each context has different capabilities and lifetime rules.

| Context | Primary responsibility |
|---|---|
| Side panel | User controls, inspection output, privacy preview, agent loop UI |
| Service worker | Messaging, tab coordination, offscreen lifecycle, privacy orchestration |
| Content script | DOM/accessibility extraction and page interaction |
| Offscreen document | Persistent local ML/OCR runtime |

## Why an offscreen document

Manifest V3 service workers do not provide a normal page DOM and can be suspended. Model inference, OCR workers and WebAssembly assets are better hosted in an offscreen document designed to remain available while the extension needs it.

## Debugger bridge

The repository includes a Chrome Debugger API bridge for capabilities such as background-tab screenshots, runtime evaluation, mouse/key dispatch and viewport information.

This expands what the prototype can test, but it also raises an explicit permission warning in Chrome. Document that trade-off in demos rather than hiding it.

## Messaging

Runtime contexts exchange typed message names such as `INSPECT_PAGE`, `PERCEIVE`, `SANITIZE`, `EXECUTE_ACTION` and `STOP_AGENT`.

See [Extension messages](../reference/messages.md).
