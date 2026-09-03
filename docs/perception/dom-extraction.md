# DOM extraction

The content-script parser turns interactive page elements into a compact `BrowserState` representation.

## Element discovery

The parser identifies interactive or semantically useful elements and derives:

- an Aegis element ID
- semantic role
- accessible label
- HTML tag
- bounding box when available
- visibility
- relevant attributes

The parser also traverses nested/shadow-root structures where supported by the implementation.

## Accessible labels

Labels can come from browser-accessibility signals such as `aria-label`, associated labels and other element metadata. These are preferable to positional guesses because they preserve the semantic meaning of the control.

## Element IDs

Aegis uses readable IDs such as:

```text
button_0
input_1
select_2
link_3
```

The model uses these IDs as action targets. The reasoning server does not need to generate a CSS selector or executable JavaScript.

## Page metadata

A `BrowserState` also records page title, URL, domain, extraction timestamp and element count.

See [Browser state](../reference/browser-state.md) for the schema.
