# Extension message reference

Aegis runtime contexts communicate using typed message names.

## Core messages

| Message | Purpose |
|---|---|
| `PING` / `PONG` | connectivity checks |
| `INSPECT_PAGE` | request structured page inspection |
| `PAGE_STATE` | return browser state |
| `EXECUTE_ACTION` | request local browser action |
| `ACTION_RESULT` | return execution result |
| `GET_STATE` | request current state |
| `SET_ACTIVE_TAB` | change target tab context |
| `ERROR` | structured runtime error |

## Perception messages

- `PERCEIVE`
- `PERCEPTION_RESULT`
- `CAPTURE_SCREENSHOT`
- `SCREENSHOT_RESULT`
- `ENSURE_OFFSCREEN`
- `OFFSCREEN_STATUS`
- `INIT_MODELS`
- `MODELS_STATUS`
- `OFFSCREEN_PING` / `OFFSCREEN_PONG`
- `OFFSCREEN_INIT`
- `OFFSCREEN_CLASSIFY`
- `OFFSCREEN_DETECT`
- `OFFSCREEN_OCR`
- `OFFSCREEN_EMBED`
- `OFFSCREEN_PERCEIVE`
- `OCR_RESULT`

## Privacy messages

- `SANITIZE`
- `SANITIZE_RESULT`

## Agent control

- `STOP_AGENT`

Each message also carries source context and a timestamp in the shared messaging protocol.
