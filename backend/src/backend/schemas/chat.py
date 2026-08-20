"""Pydantic schemas for chat and user preferences."""

from typing import Any

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str = Field(..., description="Role of the author: 'user' or 'model'")
    content: str = Field(..., description="Content of the message")


class ChatRequest(BaseModel):
    message: str = Field(..., description="User prompt message")
    session_id: str | None = Field(default=None, description="Optional chat session ID")
    history: list[ChatMessage] = Field(
        default_factory=list[ChatMessage], description="Recent conversation turns"
    )
    # Danh sách bài báo đã retrieve từ câu hỏi trước, dùng để cache lại và tránh truy vấn DB
    cached_articles: list[dict[str, Any]] = Field(
        default_factory=list[dict[str, Any]], description="Cached articles from previous turns"
    )
    # Danh sách bài báo người dùng ghim trực tiếp từ trang Tin tức làm Context
    pinned_articles: list[dict[str, Any]] = Field(
        default_factory=list[dict[str, Any]], description="Articles pinned by the user"
    )


class ChatResponse(BaseModel):
    reply: str = Field(..., description="Generated AI reply")
    session_id: str | None = Field(default=None, description="Chat session ID")
    history: list[ChatMessage] = Field(
        default_factory=list[ChatMessage], description="Updated conversation history"
    )
    cached_articles: list[dict[str, Any]] = Field(
        default_factory=list[dict[str, Any]], description="Articles used in context"
    )


class ChatSessionSummary(BaseModel):
    id: str = Field(..., description="Session UUID")
    title: str = Field(..., description="Session display title")
    created_at: str | None = Field(default=None, description="ISO timestamp of creation")
    updated_at: str | None = Field(default=None, description="ISO timestamp of last update")


class ChatSessionDetail(BaseModel):
    id: str = Field(..., description="Session UUID")
    title: str = Field(..., description="Session display title")
    created_at: str | None = Field(default=None, description="ISO timestamp of creation")
    updated_at: str | None = Field(default=None, description="ISO timestamp of last update")
    messages: list[ChatMessage] = Field(
        default_factory=list[ChatMessage], description="All messages in session"
    )


class UserPreferenceSchema(BaseModel):
    role_title: str = Field(default="", description="User role / addressing term")
    interested_topics: str = Field(default="", description="Topics or stock symbols of interest")
    response_style: str = Field(default="sut_tich", description="sut_tich | chi_tiet | phan_tich")
    custom_instructions: str = Field(
        default="", description="Additional system prompt instructions"
    )
