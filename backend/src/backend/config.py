from pydantic_settings import BaseSettings
import os


class Settings(BaseSettings):
    gemini_api_key: str = ""
    allowed_origins: list[str] = [
        "http://localhost:3000",
        "https://retributively-iodometric-max.ngrok-free.dev"
    ]
    model_name: str = "gemma3:4b"
    ollama_base_url: str = "http://localhost:11434"

    # Research Agent
    research_model_name: str = "gemma3:4b"
    # Gemini model used for summarization when GEMINI_API_KEY is set
    gemini_summarizer_model: str = "gemini-2.5-flash"

    cache_ttl_hours: int = 6
    max_sources_per_query: int = 2
    max_articles_per_source: int = 2
    context_dir: str = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "context")
    db_path: str = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "research.db")
    log_level: str = "INFO"


    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
