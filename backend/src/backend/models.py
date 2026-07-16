from pydantic import BaseModel
from typing import Any


class ChatMessage(BaseModel):
    role: str  # "user" or "model"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []
    # Danh sách bài báo đã retrieve từ câu hỏi trước, dùng để cache lại và tránh truy vấn DB
    cached_articles: list[dict[str, Any]] = []


class ChatResponse(BaseModel):
    reply: str
    history: list[ChatMessage]
    # Trả về danh sách bài báo đã dùng (có thể từ cache hoặc mới retrieve)
    cached_articles: list[dict[str, Any]] = []
