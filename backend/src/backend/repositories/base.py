"""Generic Base Repository for database operations."""

from sqlalchemy.ext.asyncio import AsyncSession


class BaseRepository[T]:
    """Base repository providing AsyncSession reference and common DB utilities."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
