# System components

## Side panel

The user-facing control surface. It can inspect the page, run visual perception, fuse signals, preview privacy results, request an agent step, execute an action and run an autonomous loop.

Source: `extension/ui/sidepanel/`.

## Content script

Runs in the page context available to the extension. It extracts interactive elements, page metadata and accessibility information, and performs local DOM-backed actions.

Source: `extension/content/`.

## Service worker

Acts as the extension message hub. It routes requests between the side panel, content script and offscreen document and invokes the privacy pipeline.

Source: `extension/background/service-worker.ts`.

## Offscreen document

Hosts local model inference and OCR. In the current snapshot it runs Transformers.js pipelines with a WebAssembly backend and maintains the long-lived Tesseract worker.

Source: `extension/offscreen/`.

## Perception layer

Converts visual detections into Aegis-style elements and fuses them with DOM elements using bounding-box overlap.

Source: `extension/perception/`.

## Privacy engine

Runs the detection cascade, sensitivity classification, task-relevance logic and final treatment.

Source: `extension/privacy/`.

## FastAPI server

Exposes health, agent-step and session-management endpoints. It validates requests with Pydantic and delegates planning to the agent orchestrator.

Source: `server/`.

## Planner and session manager

The planner constructs an LLM prompt from sanitized elements and recent history. Session state records actions/results across multiple steps.

Source: `server/agent/`.
