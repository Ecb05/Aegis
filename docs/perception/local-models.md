# Local models

The current offscreen runtime uses **Transformers.js** with its bundled ONNX Runtime Web path and executes the configured models with the **WASM** device.

## Current model set

| Task | Model in current snapshot | Role |
|---|---|---|
| Image classification | `Xenova/vit-base-patch16-224` | classify screenshot/image content |
| Object detection | `Xenova/detr-resnet-50` | generate labeled bounding boxes |
| Text embeddings | `Xenova/bge-small-en-v1.5` | normalized text feature vectors |
| OCR | Tesseract.js English worker | extract visible text blocks |

!!! note "Model choices are replaceable"
    The documentation intentionally separates the **perception interface** from a particular checkpoint. If the final SIH build swaps to lighter models, update this table and the benchmark pages without rewriting the architecture.

## Runtime configuration

The offscreen document:

- allows remote model fetching
- uses browser caching
- points ONNX/WASM assets at the packaged extension directory
- uses one WASM thread in the current Manifest V3 offscreen setup
- keeps model instances alive after initialization

## Cold vs warm runs

The first model load includes download/initialization cost. Final reporting should clearly distinguish:

- **cold start** — no cached model and first initialization
- **warm start** — model cached but runtime newly created
- **warm inference** — models already initialized

This matters heavily for the SIH resource and latency criteria.
