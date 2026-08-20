"""SQLAlchemy ORM models for Research Agent and Chatbot."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def _utc_now() -> datetime:
    return datetime.now(UTC)


class ArticleCache(Base):
    """Cache for fetched articles to avoid re-fetching within TTL."""

    __tablename__ = "article_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    url_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)  # cleaned text (no HTML)
    source_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime, default=_utc_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    def __repr__(self) -> str:
        return f"<ArticleCache url={self.url[:60]}>"


class SourceProfile(Base):
    """News source configuration profiles."""

    __tablename__ = "source_profiles"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    base_url: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(50), default="economics")
    language: Mapped[str] = mapped_column(String(10), default="vi")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    priority: Mapped[int] = mapped_column(Integer, default=5)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utc_now)

    def __repr__(self) -> str:
        return f"<SourceProfile id={self.id} name={self.name}>"

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "base_url": self.base_url,
            "category": self.category,
            "language": self.language,
            "is_active": self.is_active,
            "priority": self.priority,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ResearchSession(Base):
    """Tracks research sessions for async result retrieval."""

    __tablename__ = "research_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID
    query: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="running")  # running/done/error
    current_step: Mapped[str | None] = mapped_column(String(100), nullable=True)
    result_md: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utc_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    def __repr__(self) -> str:
        return f"<ResearchSession id={self.id} status={self.status}>"

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "query": self.query,
            "status": self.status,
            "current_step": self.current_step,
            "result_md": self.result_md,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


class ChatHistorySession(Base):
    """Stores chat session conversations."""

    __tablename__ = "chat_history_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID
    title: Mapped[str] = mapped_column(String(255), default="Cuộc trò chuyện mới")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utc_now, onupdate=_utc_now)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class ChatHistoryMessage(Base):
    """Stores individual messages within a chat history session."""

    __tablename__ = "chat_history_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # "user" or "model"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utc_now)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "session_id": self.session_id,
            "role": self.role,
            "content": self.content,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class UserPreferenceModel(Base):
    """Stores user preferences for chatbot context generation."""

    __tablename__ = "user_preferences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    role_title: Mapped[str | None] = mapped_column(
        String(200), default="", nullable=True
    )  # e.g., "Nhà đầu tư cá nhân"
    interested_topics: Mapped[str | None] = mapped_column(
        Text, default="", nullable=True
    )  # e.g., "Cổ phiếu VNM, HPG, Vàng SJC"
    response_style: Mapped[str | None] = mapped_column(
        String(100), default="sut_tich", nullable=True
    )  # e.g., "sut_tich", "chi_tiet", "phan_tich"
    custom_instructions: Mapped[str | None] = mapped_column(Text, default="", nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utc_now, onupdate=_utc_now)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "role_title": self.role_title or "",
            "interested_topics": self.interested_topics or "",
            "response_style": self.response_style or "sut_tich",
            "custom_instructions": self.custom_instructions or "",
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
