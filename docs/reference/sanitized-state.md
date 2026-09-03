# Sanitized state reference

`SanitizedState` is the server-facing state after the privacy pipeline.

## Shape

```json
{
  "elements": [],
  "task": "Book an appointment tomorrow",
  "pageInfo": {
    "title": "Appointment Demo",
    "url": "http://localhost:...",
    "domain": "localhost"
  },
  "stats": {
    "total": 12,
    "passed": 6,
    "pseudonymized": 2,
    "redacted": 1,
    "omitted": 2,
    "protected": 1
  }
}
```

## Sanitized element

| Field | Description |
|---|---|
| `id` | local element/action target ID |
| `role` | semantic role |
| `label` | human-readable label |
| `value` | transformed value, if included |
| `originalDataType` | inferred data class |
| `sensitivity` | integer 0–4 |
| `relevance` | `RELEVANT`, `CONDITIONAL`, `NEVER` |
| `treatment` | pass/pseudonymize/redact/omit/protective_proxy |
| `status` | optional pre-filled/empty/user-provided proxy status |
| `visible` | optional visibility |
| `bbox` | optional bounding box |

## Privacy statistics

The stats block is useful both for the UI and for benchmarking. It shows the distribution of treatments applied to the current observation.
