# Hermes Action Protocol

## Overview

All browser actions in Hermes are structured JSON objects validated locally before execution. The LLM never directly executes JavaScript.

## Action Schema

```json
{
  "action": "click",
  "target": "button_4",
  "params": {}
}
```

### Required Fields

| Field    | Type   | Description                          |
|----------|--------|--------------------------------------|
| action   | string | The action type to perform           |
| target   | string | Hermes element ID (e.g., "button_4") |

### Optional Fields

| Field  | Type   | Description                          |
|--------|--------|--------------------------------------|
| params | object | Action-specific parameters           |

## Supported Actions

### click
Click on an element.
```json
{ "action": "click", "target": "button_4" }
```

### type
Type text into an input field.
```json
{ "action": "type", "target": "input_0", "params": { "text": "John Smith" } }
```

### scroll
Scroll the page or a specific element.
```json
{ "action": "scroll", "params": { "direction": "down", "amount": 500 } }
```

### select
Select an option from a dropdown.
```json
{ "action": "select", "target": "select_2", "params": { "value": "morning" } }
```

### hover
Hover over an element.
```json
{ "action": "hover", "target": "button_4" }
```

### navigate
Navigate to a URL.
```json
{ "action": "navigate", "params": { "url": "https://example.com" } }
```

### wait
Wait for a condition or duration.
```json
{ "action": "wait", "params": { "duration": 2000 } }
```
```json
{ "action": "wait", "params": { "selector": "#loading", "state": "hidden", "timeout": 10000 } }
```

### press_key
Press a keyboard key or combination.
```json
{ "action": "press_key", "params": { "key": "Enter" } }
```
```json
{ "action": "press_key", "params": { "key": "Tab", "modifiers": ["Shift"] } }
```

## Risk Classification

| Risk    | Examples                              | Default Behavior      |
|---------|---------------------------------------|-----------------------|
| Low     | Scroll, search, click, filter         | Automatic             |
| Medium  | Send email, upload file, submit form  | Confirmation          |
| High    | Payment, transfer, account deletion   | Block / confirmation  |

## Action Validation Pipeline

```
LLM Action JSON
    │
    ▼
Schema Validation (type checking, required fields)
    │
    ▼
Target Resolution (Hermes ID → DOM element)
    │
    ▼
Risk Assessment (classify action + target sensitivity)
    │
    ▼
Policy Check (domain rules, user preferences)
    │
    ▼
User Confirmation (if risk ≥ medium)
    │
    ▼
Execution (dispatch native browser events)
```

## Element ID Format

Hermes assigns IDs to interactive elements:
- `button_N` — buttons and clickable elements
- `input_N` — text inputs, textareas
- `select_N` — select/dropdown elements
- `link_N` — anchor tags
- `form_N` — form elements

Where N is a sequential index.
