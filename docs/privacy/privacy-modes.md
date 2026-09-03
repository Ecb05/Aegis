# Privacy modes

Aegis exposes multiple local privacy modes so the same detection/relevance pipeline can apply different transmission policies.

## Standard

Balances task utility with privacy transformations. High-sensitivity irrelevant values are redacted, medium values may be pseudonymized and task-required sensitive fields can use protective-proxy metadata.

## Strict

Moves more values toward redaction or omission. Use this mode when the user prefers less outbound context even at a potential cost to task completion.

## Local only

Sensitive values are omitted from outbound state. Low-sensitivity public context can remain available according to the current policy.

## Policy table

The implementation source of truth is `extension/privacy/policy.ts` and the redactor. Keep this page synchronized with code before the final demo.

!!! tip "Demo recommendation"
    Show the same page in Standard and Strict mode. A before/after payload makes the privacy policy understandable to judges much faster than a verbal explanation.
