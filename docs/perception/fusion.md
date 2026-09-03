# DOM + vision fusion

Aegis matches DOM elements with visual detections using **Intersection over Union (IoU)** between their bounding boxes.

## IoU

For two boxes `A` and `B`:

```text
IoU = area(A ∩ B) / area(A ∪ B)
```

The implementation uses two useful thresholds:

- **IoU > 0.5** — high-confidence spatial match
- **IoU 0.2–0.5** — weaker/possible overlap
- **IoU < 0.2** — effectively unmatched for the current fusion logic

## Merge strategy

A matched element can combine:

- DOM role, tag, attributes and accessible label
- visual detection label and confidence
- shared bounding-box evidence
- source metadata indicating `dom`, `vision` or both

## Why not trust one source completely

DOM can be semantically rich but miss rendered overlays or non-standard UI. Vision can see the surface but may misclassify generic controls. Fusion allows the system to preserve the strengths of both.

## Evaluation

Measure fusion against annotated UI elements using precision, recall and match correctness rather than reporting only a detector confidence score. See [Visual-context accuracy](../evaluation/visual-context-accuracy.md).
