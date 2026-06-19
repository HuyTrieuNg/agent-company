from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    gemini_api_key: str
    allowed_origins: list[str] = ["http://localhost:3000"]
    model_name: str = "gemini-3.5-flash"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
