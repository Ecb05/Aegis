Hermes

Privacy-preserving runtime for lightweight browser agents.

Hermes is an experimental browser-agent runtime designed around a simple principle:

AI agents should be able to operate a user's browser without receiving unrestricted access to the user's private data or unrestricted control over the browser.

Developed as a prototype for Smart India Hackathon 2026 — PS26171: On-device Visual Perception for Light-weight Browser Agents.

Vision

Traditional browser agents often follow:

Browser → Screenshot → Cloud AI → Action → Browser

This creates a privacy problem because screenshots may contain passwords, personal information, financial data, private documents, API keys, and other sensitive information.

Hermes introduces a trusted local runtime between the browser and the reasoning model:

Browser
│
├── DOM / Accessibility
└── Screenshot
│
▼
Local Perception
│
▼
Privacy Engine
│
▼
Sanitized State
│
═══ PRIVACY BOUNDARY ═══
│
▼
Server / LLM / VLM
│
▼
Action JSON
│
▼
Local Policy Engine
│ │ │
ALLOW CONFIRM BLOCK
│
▼
Browser Action

Hermes controls two fundamental flows:

Information flow: What is the AI allowed to see?

Action flow: What is the AI allowed to do?

Project Goals

Hermes aims to provide:

Local visual perception inside the browser

DOM and accessibility-aware browser perception

Privacy-preserving PII detection

Local redaction and semantic anonymization

Sanitized browser-state representation

Server-side LLM/VLM reasoning

Structured browser actions

Local action validation

Risk-based agent permissions

User confirmation for sensitive actions

Browser-agent activity logging

Efficient client-side inference

Measurable privacy, accuracy, resource and latency performance

SIH 2026 — PS26171

The prototype must demonstrate:

Client-side

Local vision processing

Browser-side visual perception

Privacy-preserving filtering

Sensitive information masking, redaction, or semantic obfuscation

Server-side

Transmission of anonymized visual context

LLM/VLM reasoning

Structured responses/actions

Local execution of browser actions

An end-to-end task assisting the user

Evaluation Targets

Metric

Weight

Accuracy of visual context from screen

25%

Precision & recall for sensitive/PII detection

20%

Precision of redaction

20%

Client-side resource utilization

20%

Overall end-to-end task latency

15%

These metrics are first-class engineering requirements.

Core Architecture

                         USER
                           │
                    Natural-language task
                           │
                           ▼

┌──────────────────────────────────────────────────────────────┐
│ BROWSER │
│ │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ TRUSTED EXTENSION │ │
│ │ │ │
│ │ DOM / ARIA ───────┐ │ │
│ │ ├──► Perception Fusion │ │
│ │ Screenshot ────────┘ │ │
│ │ │ │ │
│ │ ▼ │ │
│ │ Privacy Engine │ │
│ │ PII + sensitivity + redaction │ │
│ │ │ │ │
│ │ ▼ │ │
│ │ Sanitized UI State │ │
│ │ │ │ │
│ │ ═══ PRIVACY BOUNDARY ═══ │ │
│ └─────────────────────────┼──────────────────────────────┘ │
└────────────────────────────┼─────────────────────────────────┘
│
HTTPS / WebSocket
│
▼
┌─────────────────────────┐
│ SERVER │
│ │
│ Agent Orchestrator │
│ │ │
│ LLM / VLM │
│ │ │
│ Action Planner │
└──────────┬──────────────┘
│
Action JSON
│
▼
┌─────────────────────────┐
│ LOCAL POLICY ENGINE │
│ ALLOW / CONFIRM / BLOCK │
└──────────┬──────────────┘
│
▼
Browser Action
│
└──────► repeat

Fundamental Systems

1. Browser Extension Runtime

The trusted local environment responsible for browser interaction, local perception, privacy enforcement, agent execution, user controls, and server communication.

2. DOM / Accessibility Perception

Extract:

Buttons

Inputs

Links

Forms

Select elements

ARIA roles

Accessible names

Bounding boxes

Visibility

Page structure

Example:

{
"id": "button_4",
"role": "button",
"label": "Book Appointment",
"bbox": [420, 650, 580, 690]
}

3. Local Visual Perception

The browser captures the current visual state and runs a lightweight local model.

Target technologies:

WebGPU

WebAssembly

ONNX Runtime Web

Transformers.js

Lightweight vision models

OCR

UI element detection

The output should be structured rather than simply forwarding screenshots.

4. Perception Fusion

Hermes combines:

DOM +
Accessibility information +
Visual perception

into a canonical browser-state representation.

Example:

{
"page": {
"title": "Book Appointment"
},
"elements": [
{
"id": "input_1",
"role": "textbox",
"label": "Patient Name",
"sensitive": true
},
{
"id": "button_4",
"role": "button",
"label": "Book Appointment",
"sensitive": false
}
]
}

Privacy Engine

The privacy engine determines what information can cross the privacy boundary.

Sensitivity levels

LEVEL 0 — PUBLIC
↓
Allow

LEVEL 1 — LOW SENSITIVITY
↓
Allow

LEVEL 2 — PERSONAL
↓
Pseudonymize / Transform

LEVEL 3 — CONFIDENTIAL
↓
Redact / Block

LEVEL 4 — HIGHLY SENSITIVE
↓
Never transmit

PII Detection

Potential detection signals include:

DOM semantics

<input type="password">
<input type="email">

Regex

Email

Phone

Credit-card-like values

API keys

Account identifiers

NLP / NER

Person names

Organizations

Locations

Other entities

Computer vision

Faces

Documents

Signatures

Sensitive visual regions

OCR

Extract visible text from the screen and classify sensitive values.

Semantic Privacy

Hermes should not simply blur everything.

Instead:

RAW

Send email to John Smith at john@gmail.com

              ↓

SANITIZED

Send email to <PERSON_1> at <EMAIL_1>

The remote model understands the semantic structure without receiving the user's actual private values.

The goal is:

Privacy + Utility

rather than privacy at the cost of agent functionality.

Action Security

The server must never directly execute arbitrary JavaScript in the browser.

Instead:

LLM
↓
Structured Action
↓
Local Validator
↓
Policy
↓
Browser Executor

Example:

{
"action": "click",
"target": "button_4"
}

Initial actions:

click
type
scroll
select
hover
navigate
wait
press_key

Risk-Based Actions

Risk

Examples

Default

Low

Scroll, search, click, filter

Automatic

Medium

Send email, upload file, submit form

Confirmation

High

Payment, transfer, account deletion

Block / explicit confirmation

User Features

Natural-language task input

Side-panel agent UI

Live task progress

Privacy Preview

Privacy modes: Standard, Strict, Local-only, Custom

Agent permission controls

Risk-based confirmation

Activity/audit log

Redaction explanations

Pause/resume

Kill switch

Session summary

Primary Demo

Appointment Booking

Example:

User:
"Book an appointment tomorrow at 4 PM."

Hermes:

1. Observe browser
2. Extract DOM
3. Capture screen
4. Run local visual perception
5. Fuse DOM + CV
6. Detect sensitive information
7. Sanitize context
8. Send safe context to server
9. LLM determines next action
10. Local policy validates action
11. Execute action
12. Observe new browser state
13. Repeat
14. Ask user before final submission
15. Complete task

This demonstrates the complete PS pipeline.

Technology Stack

Client

Browser

Chrome initially

Firefox later

Extension

Manifest V3

TypeScript

Chrome Extension APIs

WebExtensions APIs

Local inference

ONNX Runtime Web

WebGPU

WebAssembly

Transformers.js

Perception

DOM APIs

Accessibility / ARIA

Computer vision

OCR

Bounding-box detection

Server

Recommended initial stack:

Python
FastAPI
LLM/VLM
Pydantic
HTTP

Start with HTTP. Move to WebSockets when persistent real-time agent sessions are needed.

Repository Structure

hermes/
│
├── README.md
├── LICENSE
├── .gitignore
│
├── docs/
│ ├── architecture.md
│ ├── threat-model.md
│ ├── privacy-model.md
│ ├── action-protocol.md
│ └── benchmarks.md
│
├── extension/
│ ├── manifest.json
│ │
│ ├── background/
│ │ └── service-worker.ts
│ │
│ ├── content/
│ │ ├── content.ts
│ │ ├── dom-parser.ts
│ │ ├── accessibility.ts
│ │ ├── action-executor.ts
│ │ └── overlay.ts
│ │
│ ├── perception/
│ │ ├── screenshot.ts
│ │ ├── vision-model.ts
│ │ ├── ui-detector.ts
│ │ ├── dom-perception.ts
│ │ └── fusion.ts
│ │
│ ├── privacy/
│ │ ├── pii-detector.ts
│ │ ├── sensitivity.ts
│ │ ├── redactor.ts
│ │ ├── semantic-mask.ts
│ │ └── policy.ts
│ │
│ ├── agent/
│ │ ├── action-schema.ts
│ │ ├── validator.ts
│ │ ├── risk-engine.ts
│ │ └── session.ts
│ │
│ ├── ui/
│ │ ├── sidepanel/
│ │ ├── popup/
│ │ ├── privacy-preview/
│ │ └── activity-log/
│ │
│ ├── utils/
│ │ ├── messaging.ts
│ │ ├── logger.ts
│ │ └── config.ts
│ │
│ └── tests/
│
├── server/
│ ├── main.py
│ ├── config.py
│ │
│ ├── api/
│ │ ├── routes.py
│ │ └── websocket.py
│ │
│ ├── agent/
│ │ ├── orchestrator.py
│ │ ├── planner.py
│ │ ├── state.py
│ │ └── prompts/
│ │
│ ├── models/
│ │ ├── llm.py
│ │ └── vlm.py
│ │
│ ├── tools/
│ │ ├── browser-tools.py
│ │ └── schemas.py
│ │
│ └── tests/
│
├── models/
│ ├── vision/
│ ├── pii/
│ └── manifests/
│
├── benchmark/
│ ├── dataset/
│ ├── annotations/
│ ├── scripts/
│ ├── metrics/
│ └── reports/
│
├── demo/
│ └── appointment-site/
│
└── scripts/
├── build-extension.sh
├── download-models.sh
└── benchmark.sh

Development Roadmap

Phase 0 — Foundation

Initialize repository

Create architecture documentation

Define privacy boundary

Define threat model

Define canonical browser-state schema

Define action schema

Phase 1 — Browser Extension

Create Manifest V3 extension

Create service worker

Create content script

Implement extension messaging

Create basic side panel

Read DOM

Extract buttons

Extract inputs

Generate Hermes element IDs

Milestone

Hermes can inspect a webpage and produce:

{
"elements": [...]
}

Phase 2 — Browser Actions

Implement:

click
type
scroll
select
navigate
wait

Before introducing an LLM, actions should work using hardcoded JSON.

Example:

{
"action": "click",
"target": "button_4"
}

Milestone

Hermes can reliably control a webpage using structured actions.

Phase 3 — Visual Perception

Screenshot capture

Image preprocessing

Local model loading

WebGPU inference

UI detection

Bounding boxes

DOM/CV fusion

Milestone

Hermes can understand the visual state of a webpage locally.

Phase 4 — Privacy

PII taxonomy

Password detection

Email detection

Phone detection

Name detection

Financial identifier detection

API-key detection

OCR

Redaction

Semantic pseudonymization

Privacy policies

Privacy preview

Milestone

Raw sensitive data remains local while useful semantic context is preserved.

Phase 5 — Agent Server

FastAPI server

State/session management

LLM integration

Structured outputs

Action planning

Retry handling

HTTP communication

Milestone

The LLM can determine the next browser action from sanitized state.

Phase 6 — Full Agent Loop

OBSERVE
↓
PERCEIVE
↓
SANITIZE
↓
SEND
↓
REASON
↓
PLAN
↓
VALIDATE
↓
ACT
↓
OBSERVE AGAIN

Milestone

Complete appointment-booking workflow.

Phase 7 — Security

Action risk classification

Confirmation prompts

Domain policies

Permission system

Kill switch

Activity logging

Audit trail

Phase 8 — Optimization

Optimize specifically for SIH metrics.

Visual accuracy

Better DOM/CV fusion

Better UI detection

Better coordinate mapping

PII precision/recall

Better classifiers

OCR

Multiple detection signals

Confidence thresholds

Redaction precision

Semantic masking

Region-level redaction

Minimal information disclosure

Resource utilization

Smaller models

Quantization

WebGPU

Caching

Lazy loading

Latency

Incremental observation

State caching

Smaller payloads

Streaming

Reduced model calls

Development Principles

1. Privacy by default

Raw sensitive information should remain on the client.

RAW DATA
↓
LOCAL PROCESSING
↓
SANITIZED DATA
↓
NETWORK

Never reverse this.

2. The LLM never directly controls the browser

Never:

LLM → JavaScript → Browser

Always:

LLM
↓
Structured Action
↓
Local Validator
↓
Policy
↓
Executor
↓
Browser

3. Start deterministic

Do not begin with an autonomous agent.

First prove:

DOM → State
State → Action
Action → Browser

Then add the LLM.

Then add autonomy.

4. Measure everything

Every major component should eventually expose:

Perception latency
Privacy latency
Inference latency
Network latency
Action latency

RAM
CPU
GPU
Model size

PII precision
PII recall
Redaction precision

Task success rate

First Milestone

The first development milestone is intentionally small.

Hermes should be able to:

Chrome
↓
Hermes Side Panel
↓
"Inspect Page"
↓
Content Script
↓
DOM
↓
Structured Browser State
↓
Side Panel

Example output:

{
"page": {
"title": "Appointment Booking",
"url": "https://example.com"
},
"elements": [
{
"id": "button_0",
"role": "button",
"label": "Book Appointment"
},
{
"id": "input_0",
"role": "textbox",
"label": "Name"
}
]
}

No LLM.

No CV.

No cloud.

No autonomous behavior.

Get the browser runtime correct first.

Long-Term Vision

Hermes should eventually become a model-agnostic privacy layer for browser agents.

                       HERMES
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
           Local AI     LAN AI      Cloud AI
              │           │           │
              └───────────┼───────────┘
                          │
                   Privacy Policy
                          │
                    Action Policy
                          │
                          ▼
                       Browser

The reasoning model can change.

The browser can change.

The agent can change.

The trusted local runtime remains the security and privacy boundary.

Current Priority

For the first development session, focus only on:

1. Manifest V3
2. Content scripts
3. Service worker
4. Extension messaging
5. DOM extraction
6. Structured browser-state JSON
7. Basic browser actions

Everything else comes after this foundation.

Project Status

Status: 🟡 Early Development

Target: SIH 2026 — PS26171

First browser: Chrome

First demo: Appointment booking

Primary research focus: On-device visual perception + privacy-preserving browser-agent execution

Long-term direction: Model-agnostic privacy-preserving runtime for browser agents
