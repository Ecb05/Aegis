# Hermes Privacy Model

## Core Principle

Raw sensitive information must remain on the client. Only sanitized, pseudonymized data crosses the privacy boundary to the network. Privacy is NOT hardcoded per-site — it's a generalized, site-agnostic engine.

```
RAW DATA → LOCAL PROCESSING → SANITIZED DATA → NETWORK
```

## The Three-Layer Privacy Engine

### Layer 1: Universal Detection (Site-Agnostic)

Every element is classified using a detection cascade that works on ANY website:

```
DETECTION CASCADE (first match wins):
═════════════════════════════════════

1. autocomplete attribute
   autocomplete="cc-number"   → CREDIT CARD (Level 4)
   autocomplete="email"       → EMAIL (Level 3)
   autocomplete="tel"         → PHONE (Level 3)
   autocomplete="address-*"   → ADDRESS (Level 3)
   autocomplete="name"        → NAME (Level 2)

2. input type attribute
   type="password"            → PASSWORD (Level 4)
   type="email"               → EMAIL (Level 3)
   type="tel"                 → PHONE (Level 3)
   type="hidden"              → HIDDEN (Level 4)
   type="number"              → NUMERIC (Level 1-2)
   type="text"                → UNKNOWN (check further)

3. ARIA labels
   aria-label="Password"      → PASSWORD (Level 4)
   aria-label="Email address" → EMAIL (Level 3)
   role="searchbox"           → SEARCH (Level 1)

4. Label proximity
   <label for="x">Email</label> → EMAIL (Level 3)

5. Placeholder text
   placeholder="Enter email"  → EMAIL (Level 3, confidence: 0.8)

6. Value regex scan
   Matches email pattern      → EMAIL (Level 3, confidence: 1.0)
   Matches phone pattern      → PHONE (Level 3, confidence: 0.9)
   Matches card pattern       → CREDIT CARD (Level 4, confidence: 0.95)

7. Default
   No signals matched         → Level 1 (low sensitivity)
```

### Layer 2: Universal Sensitivity Taxonomy

A fixed mapping of data types to sensitivity levels. Works across all websites:

**Level 4 — Never Transmit:**
password, pin, credit_card, debit_card, bank_account, cvv, card_expiry, pan_number, aadhaar_number, ssn, passport_number, api_key, medical_record, diagnosis, mfa_code, hidden_fields

**Level 3 — Redact:**
email, phone, address_line, ifsc_code, upi_id, insurance_id, prescription, otp, security_question

**Level 2 — Pseudonymize:**
full_name, first_name, last_name, date_of_birth, gender, zip_code

**Level 0-1 — Allow (public/low sensitivity):**
product_name, price, date, time, location_name, category, rating, quantity, search_query, url, page_title, button_label, navigation_text, movie_name, showtime, seat_number

### Layer 3: Task Relevance Assessment

The same field can be sensitive or not depending on the task:

```
TASK: "Buy this book"              TASK: "Just browse products"
  → Email needed for receipt         → Email irrelevant
  → Task relevance: HIGH             → Task relevance: LOW

Same field, different treatment based on what the agent NEEDS.
```

**Relevance classification per element:**
- **RELEVANT**: Agent must interact with this field to complete the task
- **CONDITIONAL**: Only relevant in certain contexts (e.g., payment if purchasing)
- **NEVER**: Agent should never handle (passwords, always)

**The Quadrant Model:**

```
                        TASK RELEVANCE
                   Low              High
              ┌──────────────┬──────────────┐
   High       │              │              │
   Sensitiv   │ REDACT       │ PROTECTIVE   │
   ity        │ (not needed, │ PROXY        │
              │  hide it)    │ (needed, but │
              │              │  handle      │
              │              │  locally)    │
              ├──────────────┼──────────────┤
   Low        │              │              │
   Sensitiv   │ PASS         │ PASS         │
   ity        │ THROUGH      │ THROUGH      │
              │ (harmless)   │ (needed,     │
              │              │  safe)       │
              └──────────────┴──────────────┘
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
- **Treatment**: Redact or Protective Proxy (see below)

### Level 4 — Highly Sensitive
- Passwords
- Credit card numbers
- API keys / secrets
- Financial account numbers
- Health information
- **Treatment**: Never transmit — always remain local

## PII Detection Methods

### DOM Semantics (Strongest Signal)
```html
<input type="password"> → Level 4
<input type="email"> → Level 3
<input type="tel"> → Level 3
<input type="hidden"> → Level 4
<input autocomplete="cc-number"> → Level 4
```

### Regex Patterns
- Email: `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`
- Phone: `+\d{1,3}[\s-]?\d{5,10}` (international format)
- Credit card: `\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}`
- API keys: `(sk-|ak-|key_|ghp_|gho_|Bearer )`
- Indian PAN: `^[A-Z]{5}\d{4}[A-Z]$`
- Indian Aadhaar: `\b\d{12}\b` (lower confidence)

### NLP / NER (Future)
- Person names
- Organizations
- Locations
- Other entities

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

**Key insight**: The LLM needs structure to plan, not values. Knowing "there's an email field" is enough to plan the action — it doesn't need to know the actual email address.

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

### Protective Proxy (NEW)
Agent operates on the field without seeing the value.
```
Server says: { "action": "click", "target": "submit_button" }
Client executes: clicks submit. Pre-filled email submitted as-is.
Server never typed it, never saw it.
```

### Omission
Remove the element entirely from the sanitized state.

## Three Patterns for Sensitive Data

The agent can effectively operate the browser even with redaction, using these patterns:

### Pattern 1: Pre-filled Fields — "Don't Touch"
```
DOM state: input_3 (email) = "rahul@gmail.com" (pre-filled)
Server sees: { field: "email", status: "pre-filled", sensitivity: 3 }
Server action: { "action": "click", "target": "submit" }
Client: clicks submit. Pre-filled value goes with the form.
Result: Agent works without knowing the actual email.
```

### Pattern 2: Empty Sensitive Fields — "Ask User"
```
DOM state: input_3 (email) = "" (empty)
Server sees: { field: "email", status: "empty", sensitivity: 3 }
Server action: { "action": "ask_user", "message": "What email?" }
Client: prompts user, user types email locally.
Client: types value into browser. Server never sees it.
Result: Value crosses user→browser, never browser→server.
```

### Pattern 3: User-Provided Values — "Extract Locally"
```
User task: "Book tickets with email rahul@gmail.com"
Client: extracts "rahul@gmail.com" from task, stores locally
Client: sends sanitized task "Book tickets with <EMAIL_1>"
Server: plans action referencing <EMAIL_1>
Client: maps <EMAIL_1> → "rahul@gmail.com" at execution time
Result: LLM plans with tokens, client resolves to real values.
```

## Session-Scoped Pseudonymization Map

A client-side map that ensures consistent token references across observe cycles:

```
PSEUDONYMIZATION MAP (client-side only):
  "rahul@gmail.com"  → "<EMAIL_1>"
  "+91 98765 43210"   → "<PHONE_1>"
  "Rahul Sharma"      → "<PERSON_1>"

Rules:
- Map lives CLIENT-SIDE ONLY (never sent to server)
- Tokens are sequential (<PERSON_1>, <PERSON_2>, etc.)
- Same real value always maps to same token within a session
- Map is cleared when task completes
```

## Privacy Modes

| Mode | Description |
|------|-------------|
| Standard | Default: Level 0-1 pass, Level 2 pseudonymize, Level 3 redact, Level 4 never transmit |
| Strict | More aggressive: Level 2 redact (not pseudonymize), Level 3 omit entirely |
| Local-only | Nothing crosses the boundary; requires local LLM only |
| Custom | User-configured per-category sensitivity thresholds |

## Pseudonymization Redaction

Applied after classification, before transmission:

```
Element: { id: "input_3", value: "rahul@gmail.com", sensitivity: 3 }
After pseudonymization: { id: "input_3", value: "<EMAIL_1>", sensitivity: 3 }
```

The server receives the token, not the value. The client maintains the mapping.
