# Redaction and protective proxying

Aegis chooses a treatment based on sensitivity, relevance and the selected privacy mode.

## Redaction

A redacted value can be represented with a typed marker:

```text
[REDACTED_EMAIL]
[REDACTED_CREDIT_CARD]
```

Typed markers preserve the semantic fact that a field contains a certain class of data without exposing the value.

## Omission

For data that should not appear in the server state at all, the value is omitted.

## Protective proxy

A protective proxy is intended for the difficult quadrant: **the field is needed for the task but the value should remain local**.

Instead of the value, the server can receive status:

```json
{
  "id": "input_5",
  "role": "textbox",
  "label": "Sensitive field",
  "sensitivity": 4,
  "relevance": "RELEVANT",
  "treatment": "protective_proxy",
  "status": "pre-filled"
}
```

The model can plan around the control without reading the secret.

## Treatment matrix

A simplified view of the current policy is:

| Sensitivity | Relevance | Typical treatment |
|---|---|---|
| 0–1 | any | pass |
| 2 | relevant | pseudonymize |
| 2 | low relevance | pseudonymize/redact depending on mode |
| 3+ | relevant | protective proxy |
| 3+ | conditional/low | redact or omit |
| any | `NEVER` | omit |

See [Privacy modes](privacy-modes.md) for policy variations.
