# Client-side resource utilization

**SIH weight: 20%.**

Because perception runs locally, resource use is a first-class design constraint.

## Record environment

```text
Device:
CPU:
RAM:
GPU:
OS:
Chrome version:
Aegis commit:
Model cache state:
```

## Measure separately

| Component | Suggested metric |
|---|---|
| Extension idle | baseline memory |
| Model initialization | peak memory + load time |
| Classification | latency + CPU/GPU load |
| Detection | latency + CPU/GPU load |
| OCR | latency + CPU load |
| Full perception | peak memory + total client time |
| Autonomous loop | sustained memory/CPU over N steps |

## Results

| Scenario | Memory | CPU | GPU | Notes |
|---|---:|---:|---:|---|
| Idle extension | TODO | TODO | TODO | |
| Models loaded | TODO | TODO | TODO | |
| Full warm perception | TODO | TODO | TODO | |
| 10-step task | TODO | TODO | TODO | |

## Model footprint

Record both network download size and on-disk/cache footprint for the final checkpoints. If models change, do not carry old size numbers forward.
