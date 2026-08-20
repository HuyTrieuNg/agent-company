"""Application configuration settings."""

import os

from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)


class Settings(BaseSettings):
    gemini_api_key: str = ""
    # Model dùng cho query rewriting / structured extraction (nhanh, rẻ token)
    gemini_model_fast: str | list[str] = [
        "gemini-3.1-flash-lite",
        "gemini-3.5-flash",
        "gemini-3-flash-preview",
        "gemini-2.5-flash",
    ]
    # Model dùng cho chat response (có thể dùng model mạnh hơn)
    gemini_model_chat: str | list[str] = [
        "gemini-3.5-flash",
        "gemini-3-flash-preview",
        "gemini-3.1-flash-lite",
        "gemini-2.5-flash",
    ]
    allowed_origins: list[str] = [
        "http://localhost:3000",
        "https://retributively-iodometric-max.ngrok-free.dev",
    ]
    model_name: str = "gemma3:4b"
    ollama_base_url: str = "http://localhost:11434"

    # Qdrant Database
    qdrant_url: str = ""
    qdrant_api_key: str = ""
    qdrant_collection: str = "articles"

    # Vnstock API Key
    vnstock_api_key: str = ""

    cache_ttl_hours: int = 6
    max_sources_per_query: int = 2
    max_articles_per_source: int = 2
    context_dir: str = os.path.join(_BACKEND_DIR, "context")
    db_path: str = os.path.join(_BACKEND_DIR, "research.db")
    log_level: str = "INFO"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
