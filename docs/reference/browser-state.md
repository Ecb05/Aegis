# Browser state reference

`BrowserState` is the local structured observation produced by the content layer before privacy transformation.

## Shape

```ts
interface BrowserState {
  page: PageInfo;
  elements: Element[];
  metadata: StateMetadata;
}
```

### PageInfo

```json
{
  "title": "Appointment Demo",
  "url": "http://localhost:...",
  "domain": "localhost"
}
```

### Element

Representative fields:

| Field | Type | Meaning |
|---|---|---|
| `id` | string | action target identifier |
| `role` | string | semantic role |
| `label` | string | accessible/human-readable label |
| `tag` | string | HTML tag |
| `bbox` | object | optional x/y/width/height |
| `visible` | boolean | visibility estimate |
| `sensitive` | boolean | local marker used in state |
| `attributes` | object | selected DOM attributes |
| `confidence` | number | optional perception confidence |
| `sources` | array | optional `dom` / `vision` provenance |

## Element roles

Current roles include button, textbox, select, link, form, checkbox, radio, image, heading, text and other.

!!! warning
    `BrowserState` is a **local/raw representation**. Do not treat it as the normal server contract; use `SanitizedState` after the privacy pipeline.
