"""Like endpoints: toggle and query course likes."""

from uuid import UUID

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends

from app.core.container import Container
from app.core.deps import CurrentUser, DbSession
from app.services.like_service import LikeService

router = APIRouter(prefix="/courses", tags=["likes"])


@router.post("/{course_id}/like", status_code=200)
@inject
async def toggle_like(
    course_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    like_service: LikeService = Depends(Provide[Container.like_service]),
) -> dict:
    """Toggle like status for a course.

    If the user already liked the course, the like is removed.
    Otherwise, a new like is created.

    Returns {"is_liked": bool, "like_count": int}.
    """
    return await like_service.toggle_like(
        db=db,
        course_id=course_id,
        user_id=current_user.id,
    )


@router.get("/{course_id}/like/status", status_code=200)
@inject
async def get_like_status(
    course_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    like_service: LikeService = Depends(Provide[Container.like_service]),
) -> dict:
    """Get the like status for the current user on a course.

    Returns {"is_liked": bool, "like_count": int}.
    """
    return await like_service.get_like_status(
        db=db,
        course_id=course_id,
        user_id=current_user.id,
    )
