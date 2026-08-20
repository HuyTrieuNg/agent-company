"""Repository for Chat History Sessions and Messages."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select

from ..db.models import ChatHistoryMessage, ChatHistorySession
from .base import BaseRepository


class ChatRepository(BaseRepository[ChatHistorySession]):
    """Data access layer for chat sessions and history messages."""

    async def list_sessions(self) -> list[ChatHistorySession]:
        """Fetch all chat sessions ordered by latest update first."""
        stmt = select(ChatHistorySession).order_by(ChatHistorySession.updated_at.desc())
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def get_session(self, session_id: str) -> ChatHistorySession | None:
        """Fetch a single chat session by its UUID."""
        stmt = select(ChatHistorySession).where(ChatHistorySession.id == session_id)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def create_session(
        self, session_id: str | None = None, title: str = "Cuộc trò chuyện mới"
    ) -> ChatHistorySession:
        """Create and persist a new chat session."""
        sid = session_id or str(uuid.uuid4())
        session_obj = ChatHistorySession(id=sid, title=title)
        self.session.add(session_obj)
        await self.session.commit()
        await self.session.refresh(session_obj)
        return session_obj

    async def get_or_create_session(
        self, session_id: str | None, initial_title: str
    ) -> tuple[ChatHistorySession, bool]:
        """Fetch session or create one. Returns (session, created_flag)."""
        if session_id:
            existing = await self.get_session(session_id)
            if existing:
                return existing, False

        sid = session_id or str(uuid.uuid4())
        session_obj = ChatHistorySession(id=sid, title=initial_title)
        self.session.add(session_obj)
        await self.session.commit()
        await self.session.refresh(session_obj)
        return session_obj, True

    async def update_session_title(self, session_id: str, title: str) -> ChatHistorySession | None:
        """Update session title and refresh updated_at."""
        session_obj = await self.get_session(session_id)
        if session_obj:
            session_obj.title = title
            session_obj.updated_at = datetime.now(UTC)
            await self.session.commit()
            await self.session.refresh(session_obj)
        return session_obj

    async def delete_session(self, session_id: str) -> bool:
        """Delete a chat session and its messages."""
        del_msg = delete(ChatHistoryMessage).where(ChatHistoryMessage.session_id == session_id)
        await self.session.execute(del_msg)

        del_sess = delete(ChatHistorySession).where(ChatHistorySession.id == session_id)
        await self.session.execute(del_sess)

        await self.session.commit()
        return True

    async def get_messages(self, session_id: str) -> list[ChatHistoryMessage]:
        """Fetch all messages for a session ordered chronologically."""
        stmt = (
            select(ChatHistoryMessage)
            .where(ChatHistoryMessage.session_id == session_id)
            .order_by(ChatHistoryMessage.id.asc())
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def add_message(self, session_id: str, role: str, content: str) -> ChatHistoryMessage:
        """Add a single message to history."""
        msg = ChatHistoryMessage(session_id=session_id, role=role, content=content)
        self.session.add(msg)
        await self.session.commit()
        await self.session.refresh(msg)
        return msg

    async def save_turn(self, session_id: str, user_content: str, model_content: str) -> None:
        """Save a user-model conversational turn and update session timestamp."""
        user_msg = ChatHistoryMessage(session_id=session_id, role="user", content=user_content)
        model_msg = ChatHistoryMessage(session_id=session_id, role="model", content=model_content)
        self.session.add(user_msg)
        self.session.add(model_msg)

        session_obj = await self.get_session(session_id)
        if session_obj:
            session_obj.updated_at = datetime.now(UTC)

        await self.session.commit()
