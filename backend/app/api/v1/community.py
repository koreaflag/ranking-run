"""Community endpoints: posts, comments, likes."""

import logging
from uuid import UUID

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, BackgroundTasks, Depends, Query

from app.core.container import Container
from app.core.deps import CurrentUser, DbSession
from app.schemas.community import (
    CommunityCommentCreateRequest,
    CommunityCommentListResponse,
    CommunityCommentResponse,
    CommunityLikeResponse,
    CommunityPostCreateRequest,
    CommunityPostDetailResponse,
    CommunityPostListResponse,
    CommunityPostResponse,
    CommunityPostUpdateRequest,
)
from app.services.community_service import CommunityService
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/community", tags=["community"])


@router.get("/posts", response_model=CommunityPostListResponse)
@inject
async def get_posts(
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(0, ge=0),
    per_page: int = Query(20, ge=1, le=100),
    post_type: str | None = Query(
        None,
        pattern="^(general|crew_recruit|crew_promo|race_review|question|tip)$",
    ),
    crew_id: UUID | None = Query(None),
    community_service: CommunityService = Depends(
        Provide[Container.community_service]
    ),
) -> CommunityPostListResponse:
    """Get paginated list of community posts."""
    posts, total_count = await community_service.get_posts(
        db=db,
        page=page,
        per_page=per_page,
        post_type=post_type,
        crew_id=crew_id,
        current_user_id=current_user.id,
    )
    return CommunityPostListResponse(
        data=[CommunityPostResponse(**p) for p in posts],
        total_count=total_count,
    )


@router.post("/posts", response_model=CommunityPostResponse, status_code=201)
@inject
async def create_post(
    body: CommunityPostCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
    community_service: CommunityService = Depends(
        Provide[Container.community_service]
    ),
) -> CommunityPostResponse:
    """Create a new community post."""
    post = await community_service.create_post(
        db=db,
        user_id=current_user.id,
        data=body.model_dump(),
    )
    return CommunityPostResponse(**post)


@router.get("/posts/{post_id}", response_model=CommunityPostDetailResponse)
@inject
async def get_post_detail(
    post_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    community_service: CommunityService = Depends(
        Provide[Container.community_service]
    ),
) -> CommunityPostDetailResponse:
    """Get a single post with its first 5 comments."""
    post = await community_service.get_post_detail(
        db=db,
        post_id=post_id,
        current_user_id=current_user.id,
    )
    return CommunityPostDetailResponse(**post)


@router.patch("/posts/{post_id}", response_model=CommunityPostResponse)
@inject
async def update_post(
    post_id: UUID,
    body: CommunityPostUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
    community_service: CommunityService = Depends(
        Provide[Container.community_service]
    ),
) -> CommunityPostResponse:
    """Update a community post (author only)."""
    post = await community_service.update_post(
        db=db,
        post_id=post_id,
        user_id=current_user.id,
        data=body.model_dump(exclude_unset=True),
    )
    return CommunityPostResponse(**post)


@router.delete("/posts/{post_id}", status_code=204)
@inject
async def delete_post(
    post_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    community_service: CommunityService = Depends(
        Provide[Container.community_service]
    ),
) -> None:
    """Delete a community post (author or crew admin/owner)."""
    await community_service.delete_post(
        db=db, post_id=post_id, user_id=current_user.id
    )


@router.get(
    "/posts/{post_id}/comments",
    response_model=CommunityCommentListResponse,
)
@inject
async def get_comments(
    post_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(0, ge=0),
    per_page: int = Query(20, ge=1, le=100),
    community_service: CommunityService = Depends(
        Provide[Container.community_service]
    ),
) -> CommunityCommentListResponse:
    """Get paginated comments for a post."""
    comments, total_count = await community_service.get_comments(
        db=db, post_id=post_id, page=page, per_page=per_page
    )
    return CommunityCommentListResponse(
        data=[CommunityCommentResponse(**c) for c in comments],
        total_count=total_count,
    )


@router.post(
    "/posts/{post_id}/comments",
    response_model=CommunityCommentResponse,
    status_code=201,
)
@inject
async def create_comment(
    post_id: UUID,
    body: CommunityCommentCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
    bg: BackgroundTasks,
    community_service: CommunityService = Depends(
        Provide[Container.community_service]
    ),
    notification_service: NotificationService = Depends(
        Provide[Container.notification_service]
    ),
) -> CommunityCommentResponse:
    """Create a comment on a post."""
    comment = await community_service.create_comment(
        db=db,
        post_id=post_id,
        user_id=current_user.id,
        content=body.content,
    )

    # Notify post author (skip if commenter is author)
    post_author_id = comment.get("post_author_id")
    if post_author_id and str(post_author_id) != str(current_user.id):
        try:
            await notification_service.create_and_send(
                db=db,
                user_id=UUID(str(post_author_id)),
                notification_type="post_comment",
                actor_id=current_user.id,
                title=current_user.nickname or "누군가",
                body="님이 댓글을 남겼습니다",
                target_id=str(post_id),
                target_type="post",
            )
        except Exception:
            logger.warning("Failed to send comment notification for post %s", post_id)

    return CommunityCommentResponse(**comment)


@router.delete(
    "/posts/{post_id}/comments/{comment_id}", status_code=204
)
@inject
async def delete_comment(
    post_id: UUID,
    comment_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    community_service: CommunityService = Depends(
        Provide[Container.community_service]
    ),
) -> None:
    """Delete a comment (author only)."""
    await community_service.delete_comment(
        db=db, comment_id=comment_id, user_id=current_user.id
    )


@router.post(
    "/posts/{post_id}/like", response_model=CommunityLikeResponse
)
@inject
async def toggle_like(
    post_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    community_service: CommunityService = Depends(
        Provide[Container.community_service]
    ),
    notification_service: NotificationService = Depends(
        Provide[Container.notification_service]
    ),
) -> CommunityLikeResponse:
    """Toggle a like on a community post."""
    is_liked, like_count, post_author_id = await community_service.toggle_like(
        db=db, post_id=post_id, user_id=current_user.id
    )

    # Notify post author on like (not unlike, not self)
    if is_liked and post_author_id and str(post_author_id) != str(current_user.id):
        try:
            await notification_service.create_and_send(
                db=db,
                user_id=post_author_id,
                notification_type="post_like",
                actor_id=current_user.id,
                title=current_user.nickname or "누군가",
                body="님이 회원님의 게시글을 좋아합니다",
                target_id=str(post_id),
                target_type="post",
            )
        except Exception:
            logger.warning("Failed to send like notification for post %s", post_id)

    return CommunityLikeResponse(is_liked=is_liked, like_count=like_count)
