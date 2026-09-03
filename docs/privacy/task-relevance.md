# Task relevance

Sensitivity alone is not enough. A user's email can be sensitive **and** necessary for a registration task, while the same email may be irrelevant to a product search.

Aegis therefore classifies an element as:

- `RELEVANT`
- `CONDITIONAL`
- `NEVER`

## Current approach

The prototype uses task keywords and intent-to-field mappings. Examples:

| Intent | Relevant examples | Conditional examples |
|---|---|---|
| book / reserve / order | date, time, quantity, product | email, phone, address, name, payment |
| login | email | — |
| register | email, full name | phone, date of birth, address |
| search / find | query, category, location | — |
| contact / send | email, phone | name, address |
| payment / checkout | price, payment field class | contact/shipping fields |

Certain classes are treated as `NEVER` in the current implementation regardless of task intent.

## Why relevance matters

Relevance allows Aegis to distinguish:

```text
Sensitive + not needed  → hide it
Sensitive + needed      → preserve utility with local/proxy treatment
Public + needed         → pass it
```

Task-relevance accuracy should be tested with tasks that deliberately mention and omit sensitive fields.
