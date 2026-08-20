"""Async SQLite engine and session factory with DI support."""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from ..core.config import Settings, settings


class Base(DeclarativeBase):
    pass


class Database:
    """Manages database connection and session creation."""

    def __init__(self, app_settings: Settings | None = None) -> None:
        self.settings = app_settings or settings
        self.database_url = f"sqlite+aiosqlite:///{self.settings.db_path}"
        self.engine: AsyncEngine = create_async_engine(
            self.database_url,
            echo=False,
            connect_args={"check_same_thread": False},
        )
        self.session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
            self.engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )

    async def init_db(self) -> None:
        """Create all tables if they don't exist."""
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def close(self) -> None:
        """Dispose of the engine connection pool."""
        await self.engine.dispose()

    async def get_session(self) -> AsyncGenerator[AsyncSession, None]:
        """Dependency: yield an async DB session."""
        async with self.session_factory() as session:
            yield session


# Default singleton instance
_default_db = Database(settings)
engine = _default_db.engine
AsyncSessionLocal = _default_db.session_factory


async def init_db() -> None:
    """Module-level init_db for backward compatibility."""
    await _default_db.init_db()


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Dependency: yield an async DB session."""
    async with _default_db.session_factory() as session:
        yield session
