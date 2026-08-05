"""API Router for managing User Preferences and Chatbot Context."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.database import get_session
from ..db.models import UserPreferenceModel
from ..models import UserPreferenceSchema

router = APIRouter(prefix="/api/preferences", tags=["preferences"])


async def get_or_create_user_preference(session: AsyncSession) -> UserPreferenceModel:
    """Helper to fetch or initialize the single user preference record."""
    stmt = select(UserPreferenceModel).where(UserPreferenceModel.id == 1)
    result = await session.execute(stmt)
    pref = result.scalar_one_or_none()
    if not pref:
        pref = UserPreferenceModel(id=1)
        session.add(pref)
        await session.commit()
        await session.refresh(pref)
    return pref


@router.get("", response_model=UserPreferenceSchema)
async def get_preferences(db: AsyncSession = Depends(get_session)):
    """Get current user preferences."""
    pref = await get_or_create_user_preference(db)
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
    db: AsyncSession = Depends(get_session),
):
    """Update user preferences."""
    pref = await get_or_create_user_preference(db)
    pref.role_title = data.role_title
    pref.interested_topics = data.interested_topics
    pref.response_style = data.response_style
    pref.custom_instructions = data.custom_instructions
    await db.commit()
    await db.refresh(pref)

    return UserPreferenceSchema(
        role_title=pref.role_title or "",
        interested_topics=pref.interested_topics or "",
        response_style=pref.response_style or "sut_tich",
        custom_instructions=pref.custom_instructions or "",
    )
