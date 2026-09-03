# Sanitized context

A sanitized context is the structured page state after the local privacy pipeline has applied a treatment to each relevant element.

Instead of sending an unstructured screenshot, Aegis can send objects like:

```json
{
  "id": "input_2",
  "role": "textbox",
  "label": "Email",
  "value": "<EMAIL_1>",
  "originalDataType": "email",
  "sensitivity": 3,
  "relevance": "RELEVANT",
  "treatment": "pseudonymize"
}
```

Or, for a value that should remain local:

```json
{
  "id": "input_5",
  "role": "textbox",
  "label": "Payment field",
  "sensitivity": 4,
  "relevance": "RELEVANT",
  "treatment": "protective_proxy",
  "status": "pre-filled"
}
```

The reasoning model receives enough semantics to plan around the field without necessarily receiving the underlying value.

The exact schema is documented in [Sanitized state](../reference/sanitized-state.md).
