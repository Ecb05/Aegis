# End-to-end latency

**SIH weight: 15%.**

Report both **stage latency** and **user-visible task latency**.

## Stage timing

```text
DOM inspection
screenshot capture
local perception
fusion
privacy pipeline
network request
server prompt/planning
LLM inference
local action execution
page settle / re-observation
```

## Results template

| Stage | Mean | p50 | p95 | Runs |
|---|---:|---:|---:|---:|
| DOM inspection | TODO | TODO | TODO | TODO |
| Screenshot | TODO | TODO | TODO | TODO |
| Local perception | TODO | TODO | TODO | TODO |
| Fusion | TODO | TODO | TODO | TODO |
| Privacy | TODO | TODO | TODO | TODO |
| Server + LLM | TODO | TODO | TODO | TODO |
| Action execution | TODO | TODO | TODO | TODO |
| **One complete step** | **TODO** | **TODO** | **TODO** | **TODO** |

## End-to-end task timing

Measure several complete tasks with a fixed start condition and success condition. Report successful task time separately from failed/aborted tasks.

## Cold vs warm

Always distinguish model cold-start time from warm step latency. Mixing them into one average can make the number difficult to interpret.
