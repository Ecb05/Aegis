# Reasoning server

The reasoning service is implemented with FastAPI and Pydantic.

## Main endpoint

```http
POST /agent/step
Content-Type: application/json
```

The request contains sanitized state, task, step number, previous action result and optional session ID.

The response contains:

- next action
- reasoning/status text
- current step
- `done` flag
- optional user message
- session ID

## LLM interface

The planner targets an OpenAI-compatible chat-completions API:

```text
{base_url}/chat/completions
```

This lets multiple local/hosted providers use the same planner path when they implement the compatible contract.

## Structured output

The planner expects JSON, strips common Markdown fences when needed and parses the result before constructing the response schema.

For the final build, consider enforcing the strongest structured-output mode supported by the selected provider to reduce malformed actions.
