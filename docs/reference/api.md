# HTTP API

Default development server: `http://localhost:8000`.

All agent routes use the `/agent` prefix.

## Health

```http
GET /agent/health
```

Response:

```json
{
  "status": "ok",
  "provider": "ollama",
  "model": "qwen2.5:7b",
  "version": "0.1.0"
}
```

## Plan one agent step

```http
POST /agent/step
Content-Type: application/json
```

Request:

```json
{
  "sanitizedState": {
    "elements": [
      {
        "id": "button_4",
        "role": "button",
        "label": "Book Appointment",
        "sensitivity": 0,
        "relevance": "RELEVANT",
        "treatment": "pass"
      }
    ],
    "task": "Book an appointment",
    "pageInfo": {
      "title": "Appointment",
      "url": "http://localhost:3000",
      "domain": "localhost"
    },
    "stats": {
      "total": 1,
      "passed": 1,
      "pseudonymized": 0,
      "redacted": 0,
      "omitted": 0,
      "protected": 0
    }
  },
  "task": "Book an appointment",
  "step": 0,
  "lastAction": null,
  "sessionId": null
}
```

Response:

```json
{
  "action": {
    "action": "click",
    "target": "button_4",
    "params": {},
    "reasoning": "The appointment button advances the task."
  },
  "reasoning": "The appointment button advances the task.",
  "step": 0,
  "done": false,
  "message": null,
  "sessionId": "..."
}
```

## Create session

```http
POST /agent/sessions
Content-Type: application/json

{"task":"Book an appointment"}
```

## List sessions

```http
GET /agent/sessions
```

## Get session

```http
GET /agent/sessions/{session_id}
```

## Delete session

```http
DELETE /agent/sessions/{session_id}
```

## Interactive API docs

When the FastAPI server is running, the default OpenAPI UI is typically available at:

```text
http://localhost:8000/docs
```
