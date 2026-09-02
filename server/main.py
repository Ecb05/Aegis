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

import logging
from contextlib import asynccontextmanager

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
    yield
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
