"""Repository for User Preferences."""

from datetime import UTC, datetime

from sqlalchemy import select

from ..db.models import UserPreferenceModel
from ..schemas.chat import UserPreferenceSchema
from .base import BaseRepository


class PreferenceRepository(BaseRepository[UserPreferenceModel]):
    """Data access layer for user preference configuration."""

    async def get_or_create_preference(self) -> UserPreferenceModel:
        """Fetch existing user preference (singleton record id=1) or create default."""
        stmt = select(UserPreferenceModel).where(UserPreferenceModel.id == 1)
        result = await self.session.execute(stmt)
        pref = result.scalar_one_or_none()
        if not pref:
            pref = UserPreferenceModel(id=1)
            self.session.add(pref)
            await self.session.commit()
            await self.session.refresh(pref)
        return pref

    async def update_preference(self, data: UserPreferenceSchema) -> UserPreferenceModel:
        """Update user preferences and return updated model."""
        pref = await self.get_or_create_preference()
        pref.role_title = data.role_title
        pref.interested_topics = data.interested_topics
        pref.response_style = data.response_style
        pref.custom_instructions = data.custom_instructions
        pref.updated_at = datetime.now(UTC)
        await self.session.commit()
        await self.session.refresh(pref)
        return pref
