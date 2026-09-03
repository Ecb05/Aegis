# Sensitive/PII detection

**SIH weight: 20%.**

This test evaluates the detection cascade before the final treatment is applied.

## Test set

Include multiple examples of:

- email
- phone
- name
- address
- date of birth
- payment/card-related fields
- account/government identifiers relevant to the taxonomy
- passwords/PIN/CVV/OTP-like controls
- non-sensitive fields that resemble sensitive patterns

## Metrics

```text
Precision = TP / (TP + FP)
Recall    = TP / (TP + FN)
F1        = 2PR / (P + R)
```

Report **macro** metrics across data types in addition to aggregate counts when class balance is uneven.

## Results

| Data type | Samples | Precision | Recall | F1 |
|---|---:|---:|---:|---:|
| Email | TODO | TODO | TODO | TODO |
| Phone | TODO | TODO | TODO | TODO |
| Name | TODO | TODO | TODO | TODO |
| Address | TODO | TODO | TODO | TODO |
| Credential fields | TODO | TODO | TODO | TODO |
| Financial identifiers | TODO | TODO | TODO | TODO |
| **Macro / overall** | **TODO** | **TODO** | **TODO** | **TODO** |

## Failure cases

Keep examples of both false negatives and false positives. For privacy systems, a high-level score without a false-negative analysis can hide the most important failure mode.
