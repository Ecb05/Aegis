# Hermes Privacy Model

## Core Principle

Raw sensitive information must remain on the client. Only sanitized, pseudonymized data crosses the privacy boundary to the network.

```
RAW DATA → LOCAL PROCESSING → SANITIZED DATA → NETWORK
```

## Sensitivity Classification

### Level 0 — Public
- Public webpage content
- Non-personal labels, headings, UI text
- **Treatment**: Allow — transmitted as-is

### Level 1 — Low Sensitivity
- Generic UI element metadata (button roles, bounding boxes)
- Non-personal form labels
- **Treatment**: Allow — transmitted as-is

### Level 2 — Personal
- User-entered names in non-critical fields
- Browsing patterns (what page, what action)
- **Treatment**: Pseudonymize — replace with tokens like `<PERSON_1>`, `<EMAIL_1>`

### Level 3 — Confidential
- Email addresses
- Phone numbers
- Physical addresses
- Account identifiers
- **Treatment**: Redact or block — replace with `<REDACTED>` or omit entirely

### Level 4 — Highly Sensitive
- Passwords
- Credit card numbers
- API keys / secrets
- Financial account numbers
- Health information
- **Treatment**: Never transmit — always remain local

## PII Detection Methods

### DOM Semantics
```html
<input type="password"> → Level 4
<input type="email"> → Level 3
<input type="tel"> → Level 3
```

### Regex Patterns
- Email: `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`
- Phone: Various international formats
- Credit card: `\\d{4}[ -]?\\d{4}[ -]?\\d{4}[ -]?\\d{4}`
- API keys: Common patterns (sk-, ak-, key_)

### NLP / NER (Future)
- Person names
- Organizations
- Locations
- Dates with personal significance

### Computer Vision (Future)
- Face detection
- Document detection
- Signature detection

## Semantic Privacy

Hermes preserves semantic structure while removing sensitive values:

```
RAW:    "Send email to John Smith at john@gmail.com"
SANITIZED: "Send email to <PERSON_1> at <EMAIL_1>"
```

The remote model understands the structure (send email, to a person, at an address) without receiving actual private data.

## Redaction Strategies

### Full Redaction
Replace entire value with a placeholder token.
```
"john@gmail.com" → "<EMAIL_1>"
```

### Partial Redaction
Keep structure, mask sensitive parts.
```
"john@gmail.com" → "j***@gmail.com"
```

### Semantic Anonymization
Replace with category-preserving placeholder.
```
"John Smith" → "<PERSON_1>"
"123 Main St" → "<ADDRESS_1>"
```

### Omission
Remove the element entirely from the sanitized state.

## Privacy Modes

| Mode         | Description                                      |
|-------------|--------------------------------------------------|
| Standard    | Default sensitivity classification               |
| Strict      | More aggressive redaction, more confirmation prompts |
| Local-only  | No data leaves the client; local LLM only        |
| Custom      | User-configured sensitivity thresholds           |
