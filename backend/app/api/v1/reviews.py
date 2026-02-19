"""Review endpoints: course reviews CRUD and listing."""

from uuid import UUID

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, Query

from app.core.container import Container
from app.core.deps import CurrentUser, DbSession, OptionalCurrentUser
from app.schemas.review import (
    CreatorReplyRequest,
    ReviewAuthorInfo,
    ReviewCreateRequest,
    ReviewListResponse,
    ReviewResponse,
    ReviewUpdateRequest,
)
from app.services.review_service import ReviewService

router = APIRouter(prefix="/courses", tags=["reviews"])


def _to_review_response(review) -> ReviewResponse:
    """Map a Review ORM instance to a ReviewResponse schema."""
    return ReviewResponse(
        id=str(review.id),
        course_id=str(review.course_id),
        rating=review.rating,
        content=review.content,
        author=ReviewAuthorInfo(
            id=str(review.user.id),
            nickname=review.user.nickname,
            avatar_url=review.user.avatar_url,
        ),
        created_at=review.created_at,
        updated_at=review.updated_at,
        creator_reply=review.creator_reply,
        creator_reply_at=review.creator_reply_at,
    )


@router.post("/{course_id}/reviews", response_model=ReviewResponse, status_code=201)
@inject
async def create_review(
    course_id: UUID,
    body: ReviewCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
    review_service: ReviewService = Depends(Provide[Container.review_service]),
) -> ReviewResponse:
    """Create a review for a course. One review per user per course."""
    review = await review_service.create_review(
        db=db,
        course_id=course_id,
        user_id=current_user.id,
        rating=body.rating,
        content=body.content,
    )
    return _to_review_response(review)


@router.get("/{course_id}/reviews", response_model=ReviewListResponse)
@inject
async def get_course_reviews(
    course_id: UUID,
    db: DbSession,
    current_user: OptionalCurrentUser = None,
    page: int = Query(0, ge=0),
    per_page: int = Query(20, ge=1, le=100),
    review_service: ReviewService = Depends(Provide[Container.review_service]),
) -> ReviewListResponse:
    """Get paginated reviews for a course."""
    result = await review_service.get_course_reviews(
        db=db,
        course_id=course_id,
        page=page,
        per_page=per_page,
    )

    data = [_to_review_response(r) for r in result["data"]]

    return ReviewListResponse(
        data=data,
        total_count=result["total_count"],
        avg_rating=result["avg_rating"],
    )


@router.get("/{course_id}/reviews/mine", response_model=ReviewResponse | None)
@inject
async def get_my_review(
    course_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    review_service: ReviewService = Depends(Provide[Container.review_service]),
) -> ReviewResponse | None:
    """Get the current user's review on a specific course."""
    review = await review_service.get_my_review(
        db=db,
        course_id=course_id,
        user_id=current_user.id,
    )
    if review is None:
        return None
    return _to_review_response(review)


@router.patch("/reviews/{review_id}", response_model=ReviewResponse)
@inject
async def update_review(
    review_id: UUID,
    body: ReviewUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
    review_service: ReviewService = Depends(Provide[Container.review_service]),
) -> ReviewResponse:
    """Update the current user's review."""
    review = await review_service.update_review(
        db=db,
        review_id=review_id,
        user_id=current_user.id,
        rating=body.rating,
        content=body.content,
    )
    return _to_review_response(review)


@router.delete("/reviews/{review_id}", status_code=204)
@inject
async def delete_review(
    review_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    review_service: ReviewService = Depends(Provide[Container.review_service]),
) -> None:
    """Delete the current user's review."""
    await review_service.delete_review(
        db=db,
        review_id=review_id,
        user_id=current_user.id,
    )


@router.post("/{course_id}/reviews/{review_id}/reply", response_model=ReviewResponse)
@inject
async def reply_to_review(
    course_id: UUID,
    review_id: UUID,
    body: CreatorReplyRequest,
    current_user: CurrentUser,
    db: DbSession,
    review_service: ReviewService = Depends(Provide[Container.review_service]),
) -> ReviewResponse:
    """Reply to a review as the course creator."""
    review = await review_service.reply_to_review(
        db=db,
        course_id=course_id,
        review_id=review_id,
        creator_id=current_user.id,
        content=body.content,
    )
    return _to_review_response(review)
