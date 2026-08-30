# Hermes Architecture

## Overview

Hermes is a privacy-preserving runtime for lightweight browser agents. It sits between the browser and the reasoning model, enforcing a strict privacy boundary.

## System Components

```
┌─────────────────────────────────────────────────────────┐
│                        USER                             │
│                  Natural-language task                   │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                     BROWSER                             │
│  ┌─────────────────────────────────────────────────┐    │
│  │              TRUSTED EXTENSION                   │    │
│  │                                                  │    │
│  │  DOM / ARIA ──┐                                  │    │
│  │               ├──▶ Perception Fusion              │    │
│  │  Screenshot ──┘                                  │    │
│  │                     │                            │    │
│  │                     ▼                            │    │
│  │              Privacy Engine                       │    │
│  │         PII + sensitivity + redaction            │    │
│  │                     │                            │    │
│  │                     ▼                            │    │
│  │            Sanitized UI State                     │    │
│  │                                                  │    │
│  │  ═══════════ PRIVACY BOUNDARY ═══════════════    │    │
│  │                                                  │    │
│  │  Local Policy Engine                             │    │
│  │  ALLOW / CONFIRM / BLOCK                         │    │
│  │                     │                            │    │
│  │                     ▼                            │    │
│  │              Browser Action                      │    │
│  └─────────────────────────────────────────────────┘    │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS / WebSocket
┌────────────────────────▼────────────────────────────────┐
│                      SERVER                             │
│                                                         │
│  Agent Orchestrator                                     │
│       │                                                 │
│       ▼                                                 │
│  LLM / VLM                                             │
│       │                                                 │
│       ▼                                                 │
│  Action Planner                                         │
│                                                         │
│  Action JSON ──────────────────────────────────────────▶│
└─────────────────────────────────────────────────────────┘
```

## Data Flow

1. **Observe**: Extract DOM/accessibility tree + capture screenshot
2. **Perceive**: Run local visual perception model
3. **Fuse**: Combine DOM + accessibility + visual data into canonical state
4. **Sanitize**: Detect PII, apply sensitivity classification, redact/pseudonymize
5. **Send**: Transmit sanitized state to server (never raw data)
6. **Reason**: LLM/VLM determines next action
7. **Plan**: Generate structured action JSON
8. **Validate**: Local policy engine validates action against risk level
9. **Execute**: Perform browser action if allowed
10. **Repeat**: Observe new state

## Privacy Boundary

The privacy boundary is the critical architectural constraint:

```
RAW DATA → LOCAL PROCESSING → SANITIZED DATA → NETWORK
```

This direction is never reversed. Sensitive information (passwords, emails, financial data, PII) never leaves the client in raw form.

## Sensitivity Levels

| Level | Name              | Treatment                    |
|-------|-------------------|------------------------------|
| 0     | Public            | Allow                        |
| 1     | Low Sensitivity   | Allow                        |
| 2     | Personal          | Pseudonymize / Transform     |
| 3     | Confidential      | Redact / Block               |
| 4     | Highly Sensitive  | Never transmit               |

## Action Security

The LLM never directly executes JavaScript. Instead:

```
LLM → Structured Action → Local Validator → Policy → Browser Executor
```

Actions are typed, validated, and subject to risk-based policies.

## Technology Stack

### Client (Extension)
- **Browser**: Chrome (initially), Firefox (later)
- **Extension**: Manifest V3, TypeScript
- **Inference**: ONNX Runtime Web, WebGPU, WebAssembly, Transformers.js
- **Perception**: DOM APIs, Accessibility/ARIA, Computer Vision, OCR

### Server
- **Runtime**: Python 3.11+
- **Framework**: FastAPI
- **LLM/VLM**: Pluggable (OpenAI, Anthropic, local)
- **Validation**: Pydantic
- **Transport**: HTTP (initially), WebSocket (later)
