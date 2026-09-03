# Sensitivity classification

Aegis maps detected data types onto a five-level sensitivity scale.

| Level | Interpretation | Typical handling direction |
|---:|---|---|
| 0 | public/non-sensitive | pass |
| 1 | low sensitivity | usually pass |
| 2 | personal / moderate | pseudonymize or redact depending on relevance/mode |
| 3 | high sensitivity | redact/omit unless locally proxied for task utility |
| 4 | critical / never expose | omit or keep entirely local |

The type list in the current schema includes credentials, payment identifiers, government identifiers, contact details, personal attributes and public UI values.

## Examples

A final taxonomy should be kept in sync with `extension/privacy/taxonomy.ts` and the sensitivity classifier. Representative categories include:

- **critical** — password, PIN, CVV, API key, MFA code
- **high** — financial/account identifiers and selected government/medical identifiers
- **personal** — names and other personally identifying attributes
- **public/task context** — price, time, product/category, labels and navigation text

!!! important
    Exact level assignments are policy decisions. When the team changes the implementation taxonomy, update this page and the evaluation labels together so test data uses the same definition.
