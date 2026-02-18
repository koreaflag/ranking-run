"""User endpoints: profile, stats, run history, and courses."""

from typing import Literal
from uuid import UUID

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import desc, func, select

from app.core.container import Container
from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ConflictError, NotFoundError
from app.models.course import Course, CourseStats
from app.models.like import CourseLike
from app.models.ranking import Ranking
from app.models.run_record import RunRecord
from app.models.user import User
from app.schemas.course import CourseStatsInfo, MyCourseItem
from app.schemas.run import RunCourseInfo, RunHistoryItem, RunHistoryResponse
from app.schemas.user import (
    ProfileResponse,
    ProfileSetupRequest,
    ProfileUpdateRequest,
    PublicProfileCourse,
    PublicProfileRanking,
    PublicProfileResponse,
    SocialCountsResponse,
    UserResponse,
    UserStats,
    WeeklyStats,
)
from app.services.follow_service import FollowService
from app.services.stats_service import StatsService

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
async def get_my_profile(current_user: CurrentUser) -> UserResponse:
    """Get the current user's profile."""
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        nickname=current_user.nickname,
        avatar_url=current_user.avatar_url,
        birthday=current_user.birthday,
        height_cm=current_user.height_cm,
        weight_kg=current_user.weight_kg,
        bio=current_user.bio,
        instagram_username=current_user.instagram_username,
        total_distance_meters=current_user.total_distance_meters,
        total_runs=current_user.total_runs,
        created_at=current_user.created_at,
    )


@router.post("/me/profile", response_model=ProfileResponse, status_code=status.HTTP_201_CREATED)
async def setup_profile(
    body: ProfileSetupRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> ProfileResponse:
    """Initial profile setup after first social login (onboarding)."""
    existing = await db.execute(
        select(User).where(User.nickname == body.nickname, User.id != current_user.id)
    )
    if existing.scalar_one_or_none() is not None:
        raise ConflictError(code="DUPLICATE_NICKNAME", message="Nickname already taken")

    current_user.nickname = body.nickname
    if body.avatar_url is not None:
        current_user.avatar_url = body.avatar_url
    await db.flush()

    return ProfileResponse(
        id=str(current_user.id),
        nickname=current_user.nickname,
        avatar_url=current_user.avatar_url,
    )


@router.patch("/me/profile", response_model=ProfileResponse)
async def update_profile(
    body: ProfileUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> ProfileResponse:
    """Update the current user's profile (nickname, avatar)."""
    if body.nickname is not None:
        existing = await db.execute(
            select(User).where(User.nickname == body.nickname, User.id != current_user.id)
        )
        if existing.scalar_one_or_none() is not None:
            raise ConflictError(code="DUPLICATE_NICKNAME", message="Nickname already taken")
        current_user.nickname = body.nickname

    if body.avatar_url is not None:
        current_user.avatar_url = body.avatar_url
    if body.birthday is not None:
        current_user.birthday = body.birthday
    if body.height_cm is not None:
        current_user.height_cm = body.height_cm
    if body.weight_kg is not None:
        current_user.weight_kg = body.weight_kg
    if body.bio is not None:
        current_user.bio = body.bio
    if body.instagram_username is not None:
        current_user.instagram_username = body.instagram_username

    await db.flush()

    return ProfileResponse(
        id=str(current_user.id),
        nickname=current_user.nickname,
        avatar_url=current_user.avatar_url,
        birthday=current_user.birthday,
        height_cm=current_user.height_cm,
        weight_kg=current_user.weight_kg,
        bio=current_user.bio,
        instagram_username=current_user.instagram_username,
    )


@router.get("/me/stats", response_model=UserStats)
@inject
async def get_my_stats(
    current_user: CurrentUser,
    db: DbSession,
    period: Literal["all", "week", "month", "year"] = Query("all"),
    stats_service: StatsService = Depends(Provide[Container.stats_service]),
) -> UserStats:
    """Get the current user's comprehensive statistics."""
    stats = await stats_service.get_user_stats(db, current_user.id, period)
    return UserStats(**stats)


@router.get("/me/stats/weekly", response_model=WeeklyStats)
@inject
async def get_my_weekly_stats(
    current_user: CurrentUser,
    db: DbSession,
    stats_service: StatsService = Depends(Provide[Container.stats_service]),
) -> WeeklyStats:
    """Get the current user's weekly summary for the home screen."""
    stats = await stats_service.get_weekly_stats(db, current_user.id)
    return WeeklyStats(**stats)


@router.get("/me/runs", response_model=RunHistoryResponse)
async def get_my_runs(
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(0, ge=0),
    per_page: int = Query(20, ge=1, le=100),
    limit: int | None = Query(None, ge=1, le=100),
    order_by: Literal["finished_at", "distance_meters", "duration_seconds"] = Query("finished_at"),
    order: Literal["asc", "desc"] = Query("desc"),
) -> RunHistoryResponse:
    """Get the current user's run history with pagination."""
    actual_limit = limit if limit is not None else per_page

    count_result = await db.execute(
        select(func.count(RunRecord.id)).where(RunRecord.user_id == current_user.id)
    )
    total_count = count_result.scalar() or 0

    order_column = getattr(RunRecord, order_by)
    if order == "desc":
        order_column = desc(order_column)

    result = await db.execute(
        select(RunRecord)
        .where(RunRecord.user_id == current_user.id)
        .order_by(order_column)
        .offset(page * actual_limit)
        .limit(actual_limit)
    )
    records = result.scalars().all()

    data = []
    for record in records:
        course_info = None
        if record.course is not None:
            course_info = RunCourseInfo(
                id=str(record.course.id),
                title=record.course.title,
            )
        data.append(
            RunHistoryItem(
                id=str(record.id),
                distance_meters=record.distance_meters,
                duration_seconds=record.duration_seconds,
                avg_pace_seconds_per_km=record.avg_pace_seconds_per_km,
                elevation_gain_meters=record.elevation_gain_meters,
                started_at=record.started_at,
                finished_at=record.finished_at,
                course=course_info,
            )
        )

    has_next = (page + 1) * actual_limit < total_count
    return RunHistoryResponse(data=data, total_count=total_count, has_next=has_next)


@router.get("/me/courses", response_model=list[MyCourseItem])
async def get_my_courses(
    current_user: CurrentUser,
    db: DbSession,
) -> list[MyCourseItem]:
    """Get all courses created by the current user."""
    result = await db.execute(
        select(Course)
        .where(Course.creator_id == current_user.id)
        .order_by(desc(Course.created_at))
    )
    courses = result.scalars().all()

    items = []
    for course in courses:
        stats_info = CourseStatsInfo()
        if course.stats is not None:
            stats_info = CourseStatsInfo(
                total_runs=course.stats.total_runs,
                unique_runners=course.stats.unique_runners,
                avg_pace_seconds_per_km=course.stats.avg_pace_seconds_per_km,
            )
        items.append(
            MyCourseItem(
                id=str(course.id),
                title=course.title,
                distance_meters=course.distance_meters,
                thumbnail_url=course.thumbnail_url,
                is_public=course.is_public,
                created_at=course.created_at,
                stats=stats_info,
            )
        )

    return items


@router.get("/me/social-counts", response_model=SocialCountsResponse)
@inject
async def get_my_social_counts(
    current_user: CurrentUser,
    db: DbSession,
    follow_service: FollowService = Depends(Provide[Container.follow_service]),
) -> SocialCountsResponse:
    """Get the current user's social counts (followers, following, likes)."""
    # Get follow counts using existing service
    follow_status = await follow_service.get_follow_status(
        db, current_user.id, current_user.id
    )

    # Count total likes received across all user's courses
    likes_result = await db.execute(
        select(func.count(CourseLike.id))
        .join(Course, CourseLike.course_id == Course.id)
        .where(Course.creator_id == current_user.id)
    )
    total_likes = likes_result.scalar_one()

    return SocialCountsResponse(
        followers_count=follow_status["followers_count"],
        following_count=follow_status["following_count"],
        total_likes_received=total_likes,
    )


@router.get("/{user_id}/profile", response_model=PublicProfileResponse)
@inject
async def get_public_profile(
    user_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    follow_service: FollowService = Depends(Provide[Container.follow_service]),
) -> PublicProfileResponse:
    """Get a user's public profile."""
    # Fetch user
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise NotFoundError(code="NOT_FOUND", message="사용자를 찾을 수 없습니다")

    # Follow status
    follow_status = await follow_service.get_follow_status(db, current_user.id, user_id)

    # User's courses (public only, max 10)
    courses_result = await db.execute(
        select(Course)
        .where(Course.creator_id == user_id, Course.is_public == True)  # noqa: E712
        .order_by(desc(Course.created_at))
        .limit(10)
    )
    courses = courses_result.scalars().all()

    course_items = []
    for c in courses:
        # Get like count
        like_count_result = await db.execute(
            select(func.count(CourseLike.id)).where(CourseLike.course_id == c.id)
        )
        like_count = like_count_result.scalar_one()

        course_items.append(PublicProfileCourse(
            id=str(c.id),
            title=c.title,
            distance_meters=c.distance_meters,
            thumbnail_url=c.thumbnail_url,
            total_runs=c.stats.total_runs if c.stats else 0,
            like_count=like_count,
        ))

    # Top rankings (top 5 best ranks)
    rankings_result = await db.execute(
        select(Ranking)
        .where(Ranking.user_id == user_id)
        .order_by(Ranking.rank.asc())
        .limit(5)
    )
    rankings = rankings_result.scalars().all()

    ranking_items = []
    for r in rankings:
        # Get course title
        course_result = await db.execute(
            select(Course.title).where(Course.id == r.course_id)
        )
        course_title = course_result.scalar_one_or_none() or "알 수 없는 코스"
        ranking_items.append(PublicProfileRanking(
            course_id=str(r.course_id),
            course_title=course_title,
            rank=r.rank,
            best_duration_seconds=r.best_duration_seconds,
        ))

    return PublicProfileResponse(
        id=str(user.id),
        nickname=user.nickname,
        avatar_url=user.avatar_url,
        bio=user.bio,
        instagram_username=user.instagram_username,
        total_distance_meters=user.total_distance_meters,
        total_runs=user.total_runs,
        created_at=user.created_at,
        followers_count=follow_status["followers_count"],
        following_count=follow_status["following_count"],
        is_following=follow_status["is_following"],
        courses=course_items,
        top_rankings=ranking_items,
    )
