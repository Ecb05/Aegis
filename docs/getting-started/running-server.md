# Run the server

Aegis uses a FastAPI server as the reasoning boundary. The extension sends a sanitized browser state and receives the next structured action.

## Start with defaults

```bash
uvicorn server.main:app --reload --port 8000
```

The server listens on port `8000` by default.

Check health:

```bash
curl http://localhost:8000/agent/health
```

Typical response:

```json
{
  "status": "ok",
  "provider": "ollama",
  "model": "qwen2.5:7b",
  "version": "0.1.0"
}
```

## Provider configuration

The server exposes an OpenAI-compatible provider interface. The current configuration supports presets for local or hosted providers and a `mock` mode for contract testing.

Common environment variables:

```bash
export LLM_PROVIDER=ollama
export LLM_BASE_URL=http://localhost:11434/v1
export LLM_MODEL=qwen2.5:7b
export LLM_API_KEY=
```

See [Configuration](../reference/configuration.md) for the complete reference.

## Use mock mode

Mock mode is useful for checking the browser-to-server loop without calling an external model:

```bash
export LLM_PROVIDER=mock
uvicorn server.main:app --reload --port 8000
```

!!! tip
    Use mock mode for UI integration tests, schema validation and latency baselines that should exclude model inference time.

Next: [Run your first task](first-task.md).
