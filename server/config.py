"""Hermes Server Configuration

Supports multiple LLM providers via OpenAI-compatible API:
- Ollama (local): http://localhost:11434/v1
- OpenRouter: https://openrouter.ai/api/v1
- Groq: https://api.groq.com/openai/v1
- DeepSeek: https://api.deepseek.com/v1
- OpenAI: https://api.openai.com/v1
- Anthropic: (separate handler)

Set LLM_PROVIDER env var to choose, or configure individually.
"""

import os
from dataclasses import dataclass, field


@dataclass
class Config:
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True

    # LLM Provider — single OpenAI-compatible interface
    llm_provider: str = "ollama"  # ollama | openrouter | groq | deepseek | openai | mock
    llm_base_url: str = "http://localhost:11434/v1"
    llm_api_key: str = ""  # Not needed for Ollama
    llm_model: str = "qwen2.5:7b"
    llm_max_tokens: int = 1024
    llm_temperature: float = 0.1  # Low temperature for structured output

    # Agent
    max_steps: int = 20  # Max actions per task
    require_confirmation: bool = False  # Ask user before medium/high risk actions

    # CORS (for extension communication)
    cors_origins: list = field(default_factory=lambda: ["http://localhost:*", "chrome-extension://*"])


# Provider presets — override defaults when provider is selected
PROVIDER_PRESETS: dict[str, dict] = {
    "ollama": {
        "llm_base_url": "http://localhost:11434/v1",
        "llm_api_key": "",
        "llm_model": "qwen2.5:7b-instruct-64k",
    },
    "openrouter": {
        "llm_base_url": "https://openrouter.ai/api/v1",
        "llm_model": "google/gemma-3-12b-it:free",
    },
    "groq": {
        "llm_base_url": "https://api.groq.com/openai/v1",
        "llm_model": "llama-3.3-70b-versatile",
    },
    "deepseek": {
        "llm_base_url": "https://api.deepseek.com",
        "llm_model": "deepseek-chat",
    },
    "openai": {
        "llm_base_url": "https://api.openai.com/v1",
        "llm_model": "gpt-4o-mini",
    },
    "mock": {
        "llm_model": "mock",
    },
}


def load_config() -> Config:
    """Load config from environment variables with provider presets."""
    provider = os.environ.get("LLM_PROVIDER", "ollama").lower()

    # Start with provider preset
    preset = PROVIDER_PRESETS.get(provider, {})

    config = Config(
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "8000")),
        debug=os.environ.get("DEBUG", "true").lower() == "true",
        llm_provider=provider,
        llm_base_url=os.environ.get("LLM_BASE_URL", preset.get("llm_base_url", "")),
        llm_api_key=os.environ.get("LLM_API_KEY", preset.get("llm_api_key", "")),
        llm_model=os.environ.get("LLM_MODEL", preset.get("llm_model", "")),
        llm_max_tokens=int(os.environ.get("LLM_MAX_TOKENS", "1024")),
        llm_temperature=float(os.environ.get("LLM_TEMPERATURE", "0.1")),
        max_steps=int(os.environ.get("MAX_STEPS", "20")),
        require_confirmation=os.environ.get("REQUIRE_CONFIRMATION", "false").lower() == "true",
    )

    return config


# Singleton
_config: Config | None = None


def get_config() -> Config:
    global _config
    if _config is None:
        _config = load_config()
    return _config
