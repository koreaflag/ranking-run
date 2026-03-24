"""User endpoints: profile, stats, run history, and courses."""

from datetime import date, datetime, timezone
from typing import Literal
from uuid import UUID

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Body, Depends, Query, status
import json

from geoalchemy2.functions import ST_AsGeoJSON
from sqlalchemy import desc, func, select, update

from app.core.container import Container
from app.core.deps import CurrentUser, CurrentUserAllowBanned, DbSession
from app.core.exceptions import AuthenticationError, BadRequestError, ConflictError, NotFoundError
from app.models.course import Course, CourseStats
from app.models.like import CourseLike
from app.models.ranking import Ranking
from app.models.run_record import RunRecord
from app.models.run_session import RunSession
from app.models.user import User
from app.schemas.course import CourseStatsInfo, MyCourseItem
from app.services.course_service import get_route_preview, get_thumbnail_url_for_course
from app.schemas.run import (
    RunCourseInfo, RunHistoryItem, RunHistoryResponse,
    AnalyticsResponse, WeeklyStatItem, PaceTrendItem, ActivityDay, BestEffortItem,
)
from app.schemas.user import (
    ConsentRequest,
    ConsentResponse,
    ProfileResponse,
    ProfileSetupRequest,
    ProfileUpdateRequest,
    PublicProfileCourse,
    PublicProfileGear,
    PublicProfileRanking,
    PublicProfileResponse,
    SocialCountsResponse,
    UserResponse,
    UserSearchItem,
    UserSearchResponse,
    UserStats,
    WeeklyStats,
)
from app.schemas.point_transaction import PointHistoryResponse, PointTransactionItem
from app.services.follow_service import FollowService
from app.services.gear_service import GearService
from app.services.stats_service import StatsService

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/search/code", response_model=PublicProfileResponse | None)
@inject
async def search_by_code(
    code: str = Query(..., min_length=5, max_length=5),
    current_user: CurrentUser = None,
    db: DbSession = None,
    follow_service: FollowService = Depends(Provide[Container.follow_service]),
) -> PublicProfileResponse:
    """Search for a user by their unique 5-digit code."""
    if current_user is None:
        raise AuthenticationError(code="AUTH_REQUIRED", message="인증이 필요합니다")

    result = await db.execute(select(User).where(User.user_code == code))
    user = result.scalar_one_or_none()
    if user is None:
        raise NotFoundError(code="NOT_FOUND", message="해당 코드의 사용자를 찾을 수 없습니다")

    follow_status = await follow_service.get_follow_status(db, current_user.id, user.id)

    return PublicProfileResponse(
        id=str(user.id),
        user_code=user.user_code or "",
        nickname=user.nickname,
        avatar_url=user.avatar_url,
        bio=user.bio,
        instagram_username=user.instagram_username,
        activity_region=user.activity_region,
        country=user.country,
        crew_name=user.crew_name,
        runner_level=user.runner_level or 1,
        total_distance_meters=user.total_distance_meters,
        total_runs=user.total_runs,
        total_points=user.total_points or 0,
        created_at=user.created_at,
        followers_count=follow_status["followers_count"],
        following_count=follow_status["following_count"],
        is_following=follow_status["is_following"],
    )


@router.get("/search", response_model=UserSearchResponse)
async def search_users(
    q: str = Query(..., min_length=1, max_length=50),
    page: int = Query(0, ge=0),
    per_page: int = Query(20, ge=1, le=50),
    db: DbSession = None,
) -> UserSearchResponse:
    """Search users by nickname."""
    base_filter = [User.nickname.ilike(f"%{q}%"), User.nickname.isnot(None)]

    count_result = await db.execute(
        select(func.count(User.id)).where(*base_filter)
    )
    total_count = count_result.scalar() or 0

    result = await db.execute(
        select(User)
        .where(*base_filter)
        .order_by(User.nickname)
        .offset(page * per_page)
        .limit(per_page)
    )
    users = result.scalars().all()

    data = [
        UserSearchItem(
            id=str(u.id),
            nickname=u.nickname,
            avatar_url=u.avatar_url,
            crew_name=u.crew_name,
            activity_region=u.activity_region,
        )
        for u in users
    ]

    return UserSearchResponse(
        data=data,
        total_count=total_count,
        has_next=(page + 1) * per_page < total_count,
    )


@router.get("/me", response_model=UserResponse)
async def get_my_profile(current_user: CurrentUser) -> UserResponse:
    """Get the current user's profile."""
    return UserResponse(
        id=str(current_user.id),
        user_code=current_user.user_code,
        email=current_user.email,
        nickname=current_user.nickname,
        avatar_url=current_user.avatar_url,
        birthday=current_user.birthday,
        gender=current_user.gender,
        height_cm=current_user.height_cm,
        weight_kg=current_user.weight_kg,
        bio=current_user.bio,
        instagram_username=current_user.instagram_username,
        activity_region=current_user.activity_region,
        country=current_user.country,
        crew_name=current_user.crew_name,
        total_distance_meters=current_user.total_distance_meters,
        total_runs=current_user.total_runs,
        total_points=current_user.total_points,
        runner_level=current_user.runner_level,
        created_at=current_user.created_at,
    )


@router.put("/me/consent", response_model=ConsentResponse)
async def update_consent(
    body: ConsentRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> ConsentResponse:
    """Save user consent preferences (terms, privacy, location, contacts, marketing)."""
    now = datetime.now(timezone.utc)
    if body.terms:
        current_user.consent_terms_at = now
    if body.privacy:
        current_user.consent_privacy_at = now
    if body.location:
        current_user.consent_location_at = now
    current_user.consent_contacts_at = now if body.contacts else None
    current_user.consent_marketing_at = now if body.marketing else None
    await db.flush()
    return ConsentResponse()


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
    if body.country is not None:
        current_user.country = body.country
    if body.activity_region is not None:
        current_user.activity_region = body.activity_region
    await db.flush()

    return ProfileResponse(
        id=str(current_user.id),
        nickname=current_user.nickname,
        avatar_url=current_user.avatar_url,
        activity_region=current_user.activity_region,
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
    if "gender" in body.model_fields_set:
        current_user.gender = body.gender
    if body.height_cm is not None:
        current_user.height_cm = body.height_cm
    if body.weight_kg is not None:
        current_user.weight_kg = body.weight_kg
    if body.bio is not None:
        current_user.bio = body.bio
    if body.instagram_username is not None:
        current_user.instagram_username = body.instagram_username
    if body.activity_region is not None:
        current_user.activity_region = body.activity_region
    # country: update when explicitly sent (including null to clear)
    if "country" in body.model_fields_set:
        current_user.country = body.country
    # crew_name: update when explicitly sent (including null to clear)
    if "crew_name" in body.model_fields_set:
        current_user.crew_name = body.crew_name

    await db.flush()

    return ProfileResponse(
        id=str(current_user.id),
        nickname=current_user.nickname,
        avatar_url=current_user.avatar_url,
        birthday=current_user.birthday,
        gender=current_user.gender,
        height_cm=current_user.height_cm,
        weight_kg=current_user.weight_kg,
        bio=current_user.bio,
        instagram_username=current_user.instagram_username,
        activity_region=current_user.activity_region,
        country=current_user.country,
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


@router.get("/me/points/history", response_model=PointHistoryResponse)
async def get_point_history(
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    """Get the current user's point transaction history."""
    from app.models.point_transaction import PointTransaction

    offset = page * limit

    count_result = await db.execute(
        select(func.count(PointTransaction.id)).where(
            PointTransaction.user_id == current_user.id,
        )
    )
    total_count = count_result.scalar() or 0

    result = await db.execute(
        select(PointTransaction)
        .where(PointTransaction.user_id == current_user.id)
        .order_by(desc(PointTransaction.created_at))
        .offset(offset)
        .limit(limit)
    )
    rows = result.scalars().all()

    return PointHistoryResponse(
        data=[
            PointTransactionItem(
                id=str(tx.id),
                amount=tx.amount,
                balance_after=tx.balance_after,
                tx_type=tx.tx_type,
                description=tx.description,
                created_at=tx.created_at,
            )
            for tx in rows
        ],
        total_count=total_count,
        has_next=(offset + limit) < total_count,
    )


@router.post("/me/daily-checkin")
async def daily_checkin(
    current_user: CurrentUser,
    db: DbSession,
):
    """Daily attendance check-in. Awards 5 points once per day."""
    from app.models.point_transaction import PointTransaction

    today = date.today()

    # Lock the user row first to prevent race conditions on concurrent check-ins
    user_result = await db.execute(
        select(User).where(User.id == current_user.id).with_for_update()
    )
    user = user_result.scalar_one()

    # Check if already checked in today
    existing = await db.execute(
        select(PointTransaction.id).where(
            PointTransaction.user_id == current_user.id,
            PointTransaction.tx_type == "daily_checkin",
            func.date(PointTransaction.created_at) == today,
        )
    )
    if existing.scalar() is not None:
        return {"checked_in": True, "points_earned": 0, "total_points": user.total_points, "already": True}

    # Award 5 points atomically to prevent race conditions
    await db.execute(
        update(User)
        .where(User.id == current_user.id)
        .values(total_points=User.total_points + 5)
    )
    # Refresh to get the updated value
    await db.refresh(user, ["total_points"])

    tx = PointTransaction(
        user_id=current_user.id,
        amount=5,
        balance_after=user.total_points,
        tx_type="daily_checkin",
        description=None,
    )
    db.add(tx)
    await db.commit()

    return {"checked_in": True, "points_earned": 5, "total_points": user.total_points, "already": False}


@router.patch("/me/weekly-goal")
async def update_weekly_goal(
    current_user: CurrentUser,
    db: DbSession,
    goal_km: float = Body(..., ge=1.0, le=500.0, embed=True),
):
    """Update the current user's weekly running goal (km)."""
    user_result = await db.execute(select(User).where(User.id == current_user.id))
    user = user_result.scalar_one()
    user.weekly_goal_km = goal_km
    await db.flush()
    return {"weekly_goal_km": user.weekly_goal_km}


@router.get("/me/runs", response_model=RunHistoryResponse)
async def get_my_runs(
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(0, ge=0),
    per_page: int = Query(20, ge=1, le=500),
    limit: int | None = Query(None, ge=1, le=500),
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
        select(
            RunRecord,
            RunSession.device_info,
            ST_AsGeoJSON(RunRecord.route_geometry).label("route_geojson"),
            ST_AsGeoJSON(RunRecord.raw_route_geometry).label("raw_route_geojson"),
            ST_AsGeoJSON(Course.route_geometry).label("course_route_geojson"),
        )
        .outerjoin(RunSession, RunRecord.session_id == RunSession.id)
        .outerjoin(Course, RunRecord.course_id == Course.id)
        .where(RunRecord.user_id == current_user.id)
        .order_by(order_column)
        .offset(page * actual_limit)
        .limit(actual_limit)
    )
    rows = result.all()

    data = []
    for record, device_info, route_geojson, raw_route_geojson, course_route_geojson in rows:
        course_info = None
        if record.course is not None:
            course_info = RunCourseInfo(
                id=str(record.course.id),
                title=record.course.title,
            )
        device_model = None
        if device_info and isinstance(device_info, dict):
            device_model = device_info.get("device_model")

        # Build simplified route preview (every Nth point, max ~30 points)
        # For course runs: prefer the course's clean route line (corrected/clean)
        # For free runs: use run's route_geometry, fallback to raw_route_geometry
        route_preview = None

        # Determine which geometry to use for preview
        if course_route_geojson and record.course_id is not None:
            # Course run → use the course's clean route (same as course tab)
            best_geojson = course_route_geojson
        else:
            best_geojson = route_geojson
            if best_geojson:
                try:
                    geo = json.loads(best_geojson)
                    coords = geo.get("coordinates", [])
                    if len(coords) < 5 and raw_route_geojson:
                        best_geojson = raw_route_geojson
                except (json.JSONDecodeError, KeyError):
                    best_geojson = raw_route_geojson
            elif raw_route_geojson:
                best_geojson = raw_route_geojson

        if best_geojson:
            try:
                geo = json.loads(best_geojson)
                coords = geo.get("coordinates", [])
                if len(coords) >= 2:
                    step = max(1, len(coords) // 30)
                    simplified = coords[::step]
                    if coords[-1] != simplified[-1]:
                        simplified.append(coords[-1])
                    # [lng, lat] pairs only
                    route_preview = [[round(c[0], 5), round(c[1], 5)] for c in simplified]
            except (json.JSONDecodeError, KeyError, IndexError):
                pass

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
                device_model=device_model,
                route_preview=route_preview,
            )
        )

    has_next = (page + 1) * actual_limit < total_count
    return RunHistoryResponse(data=data, total_count=total_count, has_next=has_next)


@router.get("/me/analytics", response_model=AnalyticsResponse)
async def get_analytics(
    current_user: CurrentUser,
    db: DbSession,
) -> AnalyticsResponse:
    """Aggregated analytics data for charts and graphs."""
    from datetime import timedelta
    now = datetime.now(timezone.utc)

    # 1. Weekly stats (last 12 weeks)
    twelve_weeks_ago = now - timedelta(weeks=12)
    weekly_result = await db.execute(
        select(
            func.date_trunc('week', RunRecord.finished_at).label('week_start'),
            func.sum(RunRecord.distance_meters).label('distance'),
            func.count(RunRecord.id).label('cnt'),
            func.sum(RunRecord.duration_seconds).label('duration'),
            func.avg(RunRecord.avg_pace_seconds_per_km).label('avg_pace'),
        )
        .where(RunRecord.user_id == current_user.id, RunRecord.finished_at >= twelve_weeks_ago)
        .group_by('week_start')
        .order_by('week_start')
    )
    weekly_stats = [
        WeeklyStatItem(
            week_start=row.week_start.strftime('%Y-%m-%d'),
            distance_meters=int(row.distance or 0),
            run_count=int(row.cnt or 0),
            duration_seconds=int(row.duration or 0),
            avg_pace=int(row.avg_pace) if row.avg_pace else None,
        )
        for row in weekly_result.all()
    ]

    # 2. Pace trend (last 30 runs with pace data)
    pace_result = await db.execute(
        select(
            RunRecord.finished_at,
            RunRecord.avg_pace_seconds_per_km,
            RunRecord.distance_meters,
        )
        .where(
            RunRecord.user_id == current_user.id,
            RunRecord.avg_pace_seconds_per_km.isnot(None),
            RunRecord.avg_pace_seconds_per_km > 0,
        )
        .order_by(desc(RunRecord.finished_at))
        .limit(30)
    )
    pace_rows = pace_result.all()
    pace_trend = [
        PaceTrendItem(
            date=row.finished_at.isoformat(),
            avg_pace=row.avg_pace_seconds_per_km,
            distance_meters=row.distance_meters,
        )
        for row in reversed(pace_rows)  # oldest first for chart x-axis
    ]

    # 3. Activity calendar (last 90 days)
    ninety_days_ago = now - timedelta(days=90)
    cal_result = await db.execute(
        select(
            func.date(RunRecord.finished_at).label('run_date'),
            func.sum(RunRecord.distance_meters).label('distance'),
            func.count(RunRecord.id).label('cnt'),
        )
        .where(RunRecord.user_id == current_user.id, RunRecord.finished_at >= ninety_days_ago)
        .group_by('run_date')
        .order_by('run_date')
    )
    activity_calendar = [
        ActivityDay(
            date=str(row.run_date),
            distance_meters=int(row.distance or 0),
            run_count=int(row.cnt or 0),
        )
        for row in cal_result.all()
    ]

    # 4. Best efforts at standard distances (single query using LATERAL or window)
    DISTANCES = [
        ("1K", 1000),
        ("3K", 3000),
        ("5K", 5000),
        ("10K", 10000),
        ("Half", 21097),
        ("Full", 42195),
    ]

    # Fetch all qualifying runs in a single query, then pick bests in Python
    max_target = max(t for _, t in DISTANCES)
    all_efforts_result = await db.execute(
        select(
            RunRecord.id,
            RunRecord.finished_at,
            RunRecord.avg_pace_seconds_per_km,
            RunRecord.distance_meters,
            RunRecord.duration_seconds,
        )
        .where(
            RunRecord.user_id == current_user.id,
            RunRecord.distance_meters >= DISTANCES[0][1],  # >= 1K
            RunRecord.avg_pace_seconds_per_km.isnot(None),
            RunRecord.avg_pace_seconds_per_km > 0,
        )
        .order_by(RunRecord.avg_pace_seconds_per_km.asc())
    )
    all_effort_rows = all_efforts_result.all()

    best_efforts = []
    for label, target in DISTANCES:
        best_row = None
        for row in all_effort_rows:
            if row.distance_meters >= target:
                best_row = row
                break
        if best_row:
            estimated_time = int(target / 1000 * best_row.avg_pace_seconds_per_km)
            best_efforts.append(BestEffortItem(
                distance_label=label,
                target_meters=target,
                best_time_seconds=estimated_time,
                best_pace=best_row.avg_pace_seconds_per_km,
                achieved_date=best_row.finished_at.isoformat(),
                run_id=str(best_row.id),
            ))
        else:
            best_efforts.append(BestEffortItem(
                distance_label=label,
                target_meters=target,
            ))

    # 5. Weekly goal (this week's distance)
    # Week starts Monday
    today = now.date()
    week_start = today - timedelta(days=today.weekday())
    week_start_dt = datetime.combine(week_start, datetime.min.time()).replace(tzinfo=timezone.utc)
    weekly_dist_result = await db.execute(
        select(func.sum(RunRecord.distance_meters))
        .where(RunRecord.user_id == current_user.id, RunRecord.finished_at >= week_start_dt)
    )
    weekly_current = weekly_dist_result.scalar() or 0
    weekly_goal_km = current_user.weekly_goal_km

    return AnalyticsResponse(
        weekly_stats=weekly_stats,
        pace_trend=pace_trend,
        activity_calendar=activity_calendar,
        best_efforts=best_efforts,
        weekly_goal_km=weekly_goal_km,
        weekly_current_km=round(weekly_current / 1000, 2),
    )


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
                description=course.description,
                distance_meters=course.distance_meters,
                thumbnail_url=course.thumbnail_url,
                is_public=course.is_public,
                course_type=course.course_type,
                lap_count=course.lap_count,
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
    gear_service: GearService = Depends(Provide[Container.gear_service]),
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

    # Batch fetch like counts for all courses (avoids N+1 queries)
    course_ids = [c.id for c in courses]
    like_counts_map: dict = {}
    if course_ids:
        like_counts_result = await db.execute(
            select(CourseLike.course_id, func.count(CourseLike.id))
            .where(CourseLike.course_id.in_(course_ids))
            .group_by(CourseLike.course_id)
        )
        like_counts_map = {row[0]: row[1] for row in like_counts_result.all()}

    course_items = []
    for c in courses:
        like_count = like_counts_map.get(c.id, 0)
        course_items.append(PublicProfileCourse(
            id=str(c.id),
            title=c.title,
            distance_meters=c.distance_meters,
            thumbnail_url=get_thumbnail_url_for_course(c),
            route_preview=get_route_preview(c),
            total_runs=c.stats.total_runs if c.stats else 0,
            like_count=like_count,
        ))

    # Top rankings (top 5 best ranks) with course title joined (avoids N+1)
    rankings_result = await db.execute(
        select(Ranking, Course.title)
        .join(Course, Ranking.course_id == Course.id)
        .where(Ranking.user_id == user_id)
        .order_by(Ranking.rank.asc())
        .limit(5)
    )
    ranking_rows = rankings_result.all()

    ranking_items = []
    for r, course_title in ranking_rows:
        ranking_items.append(PublicProfileRanking(
            course_id=str(r.course_id),
            course_title=course_title or "알 수 없는 코스",
            rank=r.rank,
            best_duration_seconds=r.best_duration_seconds,
        ))

    # Running gear
    gear_items_orm = await gear_service.list_user_gear(db, user_id)
    gear_items = [
        PublicProfileGear(
            id=str(g.id),
            brand=g.brand,
            model_name=g.model_name,
            image_url=g.image_url,
            is_primary=g.is_primary,
            total_distance_meters=g.total_distance_meters,
        )
        for g in gear_items_orm
    ]
    primary_gear = next((g for g in gear_items if g.is_primary), None)

    total_likes = sum(c.like_count for c in course_items)

    return PublicProfileResponse(
        id=str(user.id),
        user_code=user.user_code or "",
        nickname=user.nickname,
        avatar_url=user.avatar_url,
        bio=user.bio,
        instagram_username=user.instagram_username,
        activity_region=user.activity_region,
        country=user.country,
        crew_name=user.crew_name,
        runner_level=user.runner_level or 1,
        total_distance_meters=user.total_distance_meters,
        total_runs=user.total_runs,
        total_points=user.total_points or 0,
        total_likes_received=total_likes,
        created_at=user.created_at,
        followers_count=follow_status["followers_count"],
        following_count=follow_status["following_count"],
        is_following=follow_status["is_following"],
        courses=course_items,
        top_rankings=ranking_items,
        primary_gear=primary_gear,
        gear_items=gear_items,
    )


@router.post("/me/ban-appeal", status_code=status.HTTP_201_CREATED)
async def submit_ban_appeal(
    current_user: CurrentUserAllowBanned,
    db: DbSession,
    message: str = Body(..., min_length=1, max_length=2000, embed=True),
):
    """Submit a ban appeal message. Only accessible to banned users."""
    from app.models.ban_appeal import BanAppeal

    if not current_user.is_banned:
        raise BadRequestError(code="NOT_BANNED", message="User is not banned")

    appeal = BanAppeal(
        user_id=current_user.id,
        message=message,
    )
    db.add(appeal)
    await db.flush()

    return {"submitted": True}


@router.delete("/me/account", status_code=status.HTTP_200_OK)
async def delete_account(
    current_user: CurrentUser,
    db: DbSession,
):
    """Permanently delete the current user's account and all associated data."""
    user_id = current_user.id

    # Nullify user references in run records/sessions (don't delete running data)
    await db.execute(
        update(RunRecord).where(RunRecord.user_id == user_id).values(user_id=None)
    )
    await db.execute(
        update(RunSession).where(RunSession.user_id == user_id).values(user_id=None)
    )

    # Nullify course creator references (keep courses alive)
    await db.execute(
        update(Course).where(Course.creator_id == user_id).values(creator_id=None)
    )

    # Delete the user — cascading FKs handle:
    # social_accounts, refresh_tokens, gear_items, follows, rankings,
    # community_posts, notifications, ban_appeals, device_tokens, etc.
    await db.delete(current_user)
    await db.commit()

    return {"deleted": True}
