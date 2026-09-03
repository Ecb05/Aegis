# Redaction precision

**SIH weight: 20%.**

PII detection answers *what the field is*. Redaction precision answers whether Aegis applied the **correct outbound treatment**.

## Label each expected treatment

For a test case, define:

```text
input value + data type + sensitivity + task + privacy mode
                      ↓
expected treatment
```

Possible labels:

```text
pass
pseudonymize
redact
omit
protective_proxy
```

## Suggested metric

```text
Treatment accuracy = correctly treated elements / evaluated elements
```

Also report a confusion matrix across treatment classes if the test set is large enough.

## Results

| Privacy mode | Cases | Correct treatments | Precision/accuracy |
|---|---:|---:|---:|
| Standard | TODO | TODO | TODO |
| Strict | TODO | TODO | TODO |
| Local only | TODO | TODO | TODO |

## Critical leakage check

For critical classes, add a separate **zero-tolerance network payload test**: inspect the outbound `/agent/step` request and confirm that disallowed raw values are absent.

<div class="metric-placeholder" markdown>

Critical leakage test result: **TODO**

</div>
