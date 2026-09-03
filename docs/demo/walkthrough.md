# Demo walkthrough

The included appointment page gives the team a deterministic environment for demonstrating the full Aegis pipeline.

## Demo objective

Show that Aegis can:

1. inspect a page
2. understand controls with DOM and visual signals
3. identify sensitive fields
4. display a sanitized server-facing representation
5. obtain a structured next action
6. execute it locally
7. continue until the task is complete

## Recommended judge-facing sequence

### 1. Show the page before Aegis

Briefly point out public and sensitive fields.

### 2. Inspect

Open the side panel and show the extracted element IDs and labels.

### 3. Perceive

Run local perception and show model/device/latency plus OCR/detection output.

### 4. Sanitize

This is the key moment. Show the privacy counts and compare raw local values with the sanitized representation.

### 5. Agent step

Send the sanitized state to the server and show the returned action JSON.

### 6. Execute

Run the action locally and show that the page changes.

### 7. Autonomous mode

Finish with a complete multi-step task if the final build is stable enough.

## Demo narration

Keep the story focused on the architecture:

> "The server does not need unrestricted browser access. Aegis observes locally, transforms the state locally, sends a purpose-built representation and executes only a narrow structured action."

## Evidence to keep visible

- privacy preview
- current session/step
- action target
- perception latency
- final success state
