# Visual-context accuracy

**SIH weight: 25%.**

This metric should measure whether Aegis produces the context required for the agent to understand and interact with the visible page.

## Suggested dataset

Create a labeled set of pages/screens containing:

- buttons and links
- text inputs and selects
- labels and headings
- overlays/modals
- visually rendered text
- repeated controls
- partially visible/off-screen elements
- custom-styled controls

For each page, annotate the ground-truth interactive elements and key visible context.

## Suggested measurements

### Element detection precision

```text
Precision = TP / (TP + FP)
```

### Element detection recall

```text
Recall = TP / (TP + FN)
```

### Match correctness

A detection should count as correct only if the role/label and spatial target are sufficient for the next action.

## Results

<div class="metric-placeholder" markdown>

**Final build:** `TODO`  
**Dataset:** `TODO` pages / `TODO` annotated elements  
**Precision:** `TODO`  
**Recall:** `TODO`  
**F1:** `TODO`  
**Task-grounded context accuracy:** `TODO`

</div>

## Error analysis

Record at least five representative failures and classify them as DOM miss, visual miss, OCR miss, fusion mismatch or ambiguous UI.
