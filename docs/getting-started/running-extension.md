# Run the extension

## Build

From the repository root:

```bash
npm run build
```

The build compiles TypeScript and packages the extension into the generated `dist/` directory.

Useful commands:

```bash
npm run typecheck
npm run build
npm run clean
```

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the generated `dist/` directory.
5. Pin/open Aegis and open its side panel.

## Extension permissions

The prototype manifest uses permissions including:

- `activeTab`
- `sidePanel`
- `scripting`
- `tabs`
- `storage`
- `debugger`
- `offscreen`

It also requests `<all_urls>` host access so the prototype can inspect and operate across test pages.

!!! warning "Permission review before release"
    Hackathon prototypes often use broad permissions for development speed. Before any production distribution, review the requested permissions and narrow them to the smallest set required by the final product.

## First model load

Local visual models are fetched and cached by the extension's offscreen runtime. The first perception request can therefore be noticeably slower and more bandwidth-heavy than later requests. Benchmark **cold start** and **warm inference** separately.

Next: [Run the server](running-server.md).
