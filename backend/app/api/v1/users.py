"""User endpoints: profile, stats, run history, and courses."""

from typing import Literal

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import desc, func, select

from app.core.container import Container
from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ConflictError
from app.models.course import Course, CourseStats
from app.models.run_record import RunRecord
from app.models.user import User
from app.schemas.course import CourseStatsInfo, MyCourseItem
from app.schemas.run import RunCourseInfo, RunHistoryItem, RunHistoryResponse
from app.schemas.user import (
    ProfileResponse,
    ProfileSetupRequest,
    ProfileUpdateRequest,
    UserResponse,
    UserStats,
    WeeklyStats,
)
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

    await db.flush()

    return ProfileResponse(
        id=str(current_user.id),
        nickname=current_user.nickname,
        avatar_url=current_user.avatar_url,
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
