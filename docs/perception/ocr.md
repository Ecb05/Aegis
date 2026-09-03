# OCR

Aegis uses Tesseract.js to extract visible text from the screenshot locally.

## Output

OCR returns:

- full recognized text
- individual text blocks/lines
- confidence scores
- bounding boxes

Example:

```json
{
  "fullText": "Book Appointment",
  "confidence": 0.94,
  "textBlocks": [
    {
      "text": "Book Appointment",
      "confidence": 0.96,
      "bbox": { "x": 420, "y": 650, "width": 160, "height": 40 }
    }
  ]
}
```

## Why OCR matters

DOM text is often sufficient for standard controls, but OCR helps with text rendered inside images, canvas-like areas or visually present content that is not reliably represented in the DOM.

## Quality evaluation

For final testing, OCR should be evaluated as one contributor to overall **visual-context accuracy**, not as an isolated headline metric unless the problem statement specifically requires it.
