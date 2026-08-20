"""API Router for managing User Preferences and Chatbot Context with DI."""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import UserPreferenceModel
from ..repositories.preference_repository import PreferenceRepository
from ..schemas.chat import UserPreferenceSchema
from .deps import get_preference_repository

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/preferences", tags=["preferences"])


async def get_or_create_user_preference(session: AsyncSession) -> UserPreferenceModel:
    """Compatibility helper function."""
    repo = PreferenceRepository(session)
    return await repo.get_or_create_preference()


@router.get("", response_model=UserPreferenceSchema)
async def get_preferences(
    pref_repo: PreferenceRepository = Depends(get_preference_repository),
) -> UserPreferenceSchema:
    """Get current user preferences."""
    pref = await pref_repo.get_or_create_preference()
    return UserPreferenceSchema(
        role_title=pref.role_title or "",
        interested_topics=pref.interested_topics or "",
        response_style=pref.response_style or "sut_tich",
        custom_instructions=pref.custom_instructions or "",
    )


@router.put("", response_model=UserPreferenceSchema)
@router.post("", response_model=UserPreferenceSchema)
async def update_preferences(
    data: UserPreferenceSchema,
    pref_repo: PreferenceRepository = Depends(get_preference_repository),
) -> UserPreferenceSchema:
    """Update user preferences."""
    pref = await pref_repo.update_preference(data)
    return UserPreferenceSchema(
        role_title=pref.role_title or "",
        interested_topics=pref.interested_topics or "",
        response_style=pref.response_style or "sut_tich",
        custom_instructions=pref.custom_instructions or "",
    )


__all__ = ["router", "get_or_create_user_preference"]
