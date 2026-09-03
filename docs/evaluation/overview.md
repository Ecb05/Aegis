# SIH evaluation

Aegis documentation is organized so each SIH evaluation criterion has a corresponding evidence page.

| Criterion | Weight | What Aegis should show |
|---|---:|---|
| Visual-context accuracy | **25%** | annotated UI/context benchmark and task-grounded correctness |
| Sensitive/PII detection precision & recall | **20%** | labeled PII field dataset, TP/FP/FN and per-class metrics |
| Redaction precision | **20%** | expected vs actual transformation for sensitive values |
| Client-side resource utilization | **20%** | memory, CPU, model size/load and client inference cost |
| Overall end-to-end latency | **15%** | stage-wise and task-level timing |

## Evidence philosophy

Do not make the evaluation pages a marketing summary. Each page should answer:

1. **What exactly was measured?**
2. **On what device/browser/build?**
3. **How many samples/runs?**
4. **What formula produced the metric?**
5. **What was the result?**
6. **What are the known failure cases?**

## Freeze the build first

Benchmark only after recording:

```text
commit SHA:
Chrome version:
OS:
CPU:
RAM:
GPU:
privacy mode:
model checkpoints:
server provider/model:
network condition:
```

This turns benchmark numbers into reproducible engineering evidence.

!!! note "Editable placeholders"
    The metric pages below intentionally contain blank result tables. Replace them only with measurements from the final or clearly identified prototype build.
