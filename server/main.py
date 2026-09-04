"""Hermes Server — FastAPI Application

Entry point for the Hermes server. Run with:
    python -m server.main
    # or
    uvicorn server.main:app --reload --host 0.0.0.0 --port 8000

Environment variables:
    LLM_PROVIDER=ollama|openrouter|groq|deepseek|openai|mock
    LLM_BASE_URL=http://localhost:11434/v1  (for Ollama)
    LLM_API_KEY=your-api-key  (not needed for Ollama)
    LLM_MODEL=qwen2.5:7b
"""

import asyncio
import logging
import time
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from server.config import get_config
from server.api.routes import router

# ─── Logging ────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("hermes")


# ─── Warm-up ────────────────────────────────────────────────

async def _warm_model() -> None:
    """Preload the local model so the user's FIRST task doesn't pay the cold-
    load cost (which can be minutes on a 7B model). Fire-and-forget from the
    lifespan: requests queue behind the load inside Ollama, and `keep_alive`
    keeps the model resident afterwards.
    """
    config = get_config()
    url = f"{config.llm_base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": config.llm_model,
        "messages": [{"role": "user", "content": "ping"}],
        "max_tokens": 1,
    }
    if config.llm_keep_alive:
        payload["keep_alive"] = config.llm_keep_alive
    try:
        t0 = time.monotonic()
        async with httpx.AsyncClient(timeout=httpx.Timeout(900.0)) as client:
            resp = await client.post(url, json=payload)
        if resp.status_code == 200:
            logger.info(
                f"Local model {config.llm_model} warm in {time.monotonic() - t0:.0f}s "
                f"(kept alive for {config.llm_keep_alive})"
            )
        else:
            logger.warning(f"Model warm-up returned HTTP {resp.status_code}")
    except Exception as e:
        logger.warning(f"Model warm-up failed — first request will load it instead: {e}")


# ─── Lifespan ───────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    config = get_config()
    logger.info(f"Hermes server starting...")
    logger.info(f"  Provider: {config.llm_provider}")
    logger.info(f"  Model: {config.llm_model}")
    logger.info(f"  Base URL: {config.llm_base_url}")
    logger.info(f"  Port: {config.port}")
    logger.info(
        f"  Elements shown to LLM per step: {config.llm_max_elements} "
        f"(LLM_MAX_ELEMENTS), timeout: {config.llm_timeout}s (LLM_TIMEOUT)"
    )

    warmup_task = None
    if config.llm_provider == "ollama":
        logger.info("Warming local model in the background...")
        warmup_task = asyncio.create_task(_warm_model())
    try:
        yield
    finally:
        if warmup_task is not None:
            warmup_task.cancel()
        logger.info("Hermes server shutting down.")


# ─── App ────────────────────────────────────────────────────

app = FastAPI(
    title="Hermes Server",
    description="Privacy-preserving browser agent server. Receives sanitized state, plans actions via LLM.",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow extension and localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(router)


# ─── Root ───────────────────────────────────────────────────

@app.get("/")
async def root():
    config = get_config()
    return {
        "name": "Hermes Server",
        "version": "0.1.0",
        "status": "running",
        "provider": config.llm_provider,
        "model": config.llm_model,
        "docs": "/docs",
    }


# ─── Run ────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    config = get_config()
    uvicorn.run(
        "server.main:app",
        host=config.host,
        port=config.port,
        reload=config.debug,
    )
