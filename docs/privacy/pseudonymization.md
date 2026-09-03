# Pseudonymization

Pseudonymization replaces a real value with a semantic token while retaining enough identity for multi-step reasoning.

Example:

```text
rahul@example.com  →  <EMAIL_1>
Aarav Sharma       →  <PERSON_1>
```

The server can reason:

> Type `<EMAIL_1>` into the email field.

while the client can resolve the token locally when the final implementation requires it.

## Desired properties

A session-scoped pseudonym map should provide:

- deterministic mapping within one task session
- different namespaces for different data types
- no server-side access to the reverse mapping
- clear reset behavior when the task ends

## Why tokens are more useful than blanket redaction

`[REDACTED]` tells a model that something exists but not whether two references represent the same value. Semantic tokens preserve identity and type without exposing the underlying string.

## Testing

Test repeated appearances of the same value, multiple values of the same type and session-reset behavior. Include these cases in [Redaction precision](../evaluation/redaction-precision.md).
