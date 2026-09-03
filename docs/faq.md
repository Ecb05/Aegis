# FAQ

## Does Aegis send the raw screenshot to the reasoning server?

The architecture is designed around **local visual processing and a sanitized structured server state**, not raw-screenshot forwarding as the normal agent contract. Verify the final build's actual network behavior before making an absolute privacy guarantee in the submission.

## Why use both DOM and vision?

DOM provides structure and accessibility semantics; vision provides rendered-surface evidence. Their failure modes differ, so fusion can be more robust than either source alone.

## Why not run the LLM fully inside the browser too?

The problem focuses on lightweight on-device perception and privacy-preserving context handling. Aegis keeps the reasoning layer replaceable so it can use local or hosted OpenAI-compatible providers while preserving the same browser contract.

## What happens to sensitive values needed for a task?

The privacy design supports pseudonymization and a protective-proxy pattern so a model can reason about a field without necessarily seeing its real value.

## Can the model execute JavaScript directly?

The documented agent interface uses a fixed structured action vocabulary. Browser execution happens locally.

## How are background tabs supported?

The repository includes a Chrome Debugger API bridge for advanced screenshot, DOM and input operations across tabs. This requires the `debugger` permission and may surface a browser warning.

## Which local models are used?

The current snapshot uses ViT image classification, DETR object detection, BGE-small embeddings and Tesseract.js OCR. See [Local models](perception/local-models.md). These can be updated independently of the architecture.

## How do I publish the documentation?

1. Push the documentation files and workflow to the public GitHub repository.
2. Open **Settings → Pages**.
3. Set **Source** to **GitHub Actions**.
4. Run the **Deploy documentation** workflow or push to `main`.
5. GitHub Pages will provide the published URL.

Future pushes to documentation files on `main` will automatically rebuild the site.

## Where do final benchmark numbers go?

Update the pages under `docs/evaluation/`. Each page already has a result template designed for the SIH evaluation criteria.
