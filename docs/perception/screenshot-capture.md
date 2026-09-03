# Screenshot capture

Visual perception starts with a screenshot of the rendered browser surface.

The repository contains two capture paths:

1. **Visible-tab capture** for the current active tab.
2. **Debugger-assisted capture** for advanced/background-tab operation.

## Capture result

The perception helper returns image data plus metadata such as dimensions and capture time where available.

## Local handling

The screenshot is consumed by the extension's local inference path. The architecture is designed around converting the screenshot into structured local signals rather than using the raw image as the normal server payload.

## Benchmarking note

When measuring screenshot cost, record it separately from model inference:

| Stage | Metric |
|---|---|
| Capture | ms |
| Image conversion/resizing | ms |
| Classification | ms |
| Detection | ms |
| OCR | ms |
| Total perception | ms |

This makes performance regressions easier to diagnose.
