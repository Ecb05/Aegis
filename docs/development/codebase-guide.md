# Codebase guide

Aegis is organized by runtime responsibility rather than by one large agent module.

```text
extension/
├── background/       service worker and runtime orchestration
├── content/          DOM/accessibility extraction + local actions
├── offscreen/        Transformers.js and OCR inference host
├── perception/       screenshot helpers, UI detector and fusion
├── privacy/          classification, relevance and treatments
├── ui/sidepanel/     user interface and autonomous loop
└── utils/            messaging, config, debugger bridge, logging

server/
├── agent/            planner, orchestrator, prompts, session state
├── api/              FastAPI routes
├── models/           Pydantic request/response schemas
├── tools/            action schemas/validation helpers
├── config.py         provider/server configuration
└── main.py           FastAPI application

demo/
└── appointment-site/ deterministic test page
```

## Where to change what

| Goal | Start here |
|---|---|
| Add a browser action | `extension/content/action-executor.ts`, server action schemas |
| Change DOM extraction | `extension/content/dom-parser.ts` |
| Change local models | `extension/offscreen/offscreen.ts` |
| Tune fusion thresholds | `extension/perception/fusion.ts` |
| Add a PII type | `extension/privacy/` + shared messaging types |
| Change privacy behavior | `extension/privacy/redactor.ts`, `policy.ts` |
| Change LLM provider | `server/config.py`, `server/agent/planner.py` |
| Change API contract | `server/models/schemas.py` + extension caller |
| Change autonomous flow | `extension/ui/sidepanel/sidepanel.ts` |

## Naming note

The final public project name is **Aegis**. When renaming historical implementation identifiers, keep schema contracts and documentation examples synchronized in the same pull request.
