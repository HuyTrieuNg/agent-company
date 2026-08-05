from pydantic import BaseModel
from typing import Any, Optional


class ChatMessage(BaseModel):
    role: str  # "user" or "model"
    content: str


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    history: list[ChatMessage] = []
    # Danh sách bài báo đã retrieve từ câu hỏi trước, dùng để cache lại và tránh truy vấn DB
    cached_articles: list[dict[str, Any]] = []
    # Danh sách bài báo người dùng ghim trực tiếp từ trang Tin tức làm Context
    pinned_articles: list[dict[str, Any]] = []


class ChatResponse(BaseModel):
    reply: str
    session_id: Optional[str] = None
    history: list[ChatMessage]
    # Trả về danh sách bài báo đã dùng (có thể từ cache hoặc mới retrieve)
    cached_articles: list[dict[str, Any]] = []


class ChatSessionSummary(BaseModel):
    id: str
    title: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ChatSessionDetail(BaseModel):
    id: str
    title: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    messages: list[ChatMessage] = []


class UserPreferenceSchema(BaseModel):
    role_title: str = ""
    interested_topics: str = ""
    response_style: str = "sut_tich"
    custom_instructions: str = ""

