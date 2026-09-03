# On-device perception

On-device perception means that visual inference happens inside the user's browser environment rather than by uploading the raw screenshot to a remote visual model.

In Aegis, the offscreen extension document hosts local inference because it can provide a persistent DOM-capable context for WebAssembly-based model execution while the service worker remains focused on orchestration.

## What local perception produces

The current prototype can derive:

- page/image classification predictions
- object detections with labels, confidence and bounding boxes
- OCR text blocks and confidence
- text embeddings
- elapsed perception time and device/backend metadata

These outputs become structured signals that can be combined with DOM elements.

## Why combine DOM and vision

DOM gives exact attributes and semantic roles when the page exposes them correctly. Vision sees the rendered surface, including cases where layout or overlay behavior is not obvious from the DOM.

Aegis therefore treats them as complementary sensors rather than choosing one source exclusively.

See [Perception](../perception/overview.md) for the implementation details.
