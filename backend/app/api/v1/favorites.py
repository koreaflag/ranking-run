"""Course favorites endpoints."""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import delete, select
from sqlalchemy.orm import joinedload

from app.core.deps import CurrentUser, DbSession
from app.models.course import Course
from app.models.favorite import CourseFavorite
from app.schemas.favorite import FavoriteCourseItem, FavoriteToggleResponse
from app.services.course_service import get_thumbnail_url_for_course

router = APIRouter(prefix="/favorites", tags=["favorites"])


@router.post("/courses/{course_id}", response_model=FavoriteToggleResponse)
async def toggle_favorite(
    course_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> FavoriteToggleResponse:
    """Toggle favorite status for a course. Returns new state."""
    existing = await db.execute(
        select(CourseFavorite).where(
            CourseFavorite.user_id == current_user.id,
            CourseFavorite.course_id == course_id,
        )
    )
    fav = existing.scalar_one_or_none()

    if fav:
        await db.execute(
            delete(CourseFavorite).where(CourseFavorite.id == fav.id)
        )
        await db.flush()
        return FavoriteToggleResponse(is_favorited=False)
    else:
        new_fav = CourseFavorite(user_id=current_user.id, course_id=course_id)
        db.add(new_fav)
        await db.flush()
        return FavoriteToggleResponse(is_favorited=True)


@router.get("/courses", response_model=list[FavoriteCourseItem])
async def get_favorite_courses(
    current_user: CurrentUser,
    db: DbSession,
) -> list[FavoriteCourseItem]:
    """Get all favorite courses for the current user."""
    result = await db.execute(
        select(CourseFavorite, Course)
        .join(Course, CourseFavorite.course_id == Course.id)
        .options(joinedload(Course.creator))
        .where(CourseFavorite.user_id == current_user.id)
        .order_by(CourseFavorite.created_at.desc())
    )
    rows = result.unique().all()

    return [
        FavoriteCourseItem(
            id=str(course.id),
            title=course.title,
            thumbnail_url=get_thumbnail_url_for_course(course),
            distance_meters=course.distance_meters,
            estimated_duration_seconds=course.estimated_duration_seconds,
            creator_nickname=course.creator.nickname if course.creator else "Unknown",
            favorited_at=fav.created_at,
        )
        for fav, course in rows
    ]


@router.get("/courses/{course_id}/status")
async def check_favorite_status(
    course_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> FavoriteToggleResponse:
    """Check if a course is favorited."""
    result = await db.execute(
        select(CourseFavorite).where(
            CourseFavorite.user_id == current_user.id,
            CourseFavorite.course_id == course_id,
        )
    )
    return FavoriteToggleResponse(is_favorited=result.scalar_one_or_none() is not None)
