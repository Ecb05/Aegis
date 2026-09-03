# Design decisions

This page records the reasoning behind the current architecture so future changes are deliberate rather than accidental.

## 1. Browser extension as trusted runtime

**Decision:** keep perception, privacy transformation and action execution inside the extension.

**Why:** the browser is where raw task context originates. Moving these controls remote would defeat the privacy boundary.

## 2. Offscreen document for local inference

**Decision:** host model/OCR workers in an MV3 offscreen document.

**Why:** inference needs a more persistent environment than a service worker and benefits from local WebAssembly assets and browser caching.

## 3. DOM + vision fusion

**Decision:** combine structured DOM semantics with rendered-page visual evidence using bounding-box overlap.

**Why:** DOM and vision fail in different ways; fusion can increase reliability.

## 4. Generalized privacy classification

**Decision:** infer data types from common HTML/accessibility/value signals rather than maintaining per-site privacy rules.

**Why:** the hackathon problem requires a browser-agent primitive that generalizes across websites.

## 5. Sensitivity × task relevance

**Decision:** treatment depends on both sensitivity and whether a field is needed for the task.

**Why:** blanket redaction protects privacy but can make legitimate tasks impossible.

## 6. Structured action protocol

**Decision:** the remote model returns a small JSON action rather than arbitrary code.

**Why:** structured actions are easier to validate, log, constrain and explain.

## 7. One-step planning loop

**Decision:** re-observe after each action.

**Why:** browser state is dynamic; a long plan can become stale after one interaction.

## 8. Provider-neutral reasoning interface

**Decision:** use an OpenAI-compatible chat-completions shape for supported providers.

**Why:** the prototype can switch between local and hosted reasoning without changing the browser contract.
