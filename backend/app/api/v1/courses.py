"""Course endpoints: CRUD, nearby search, viewport bounds, stats."""

from typing import Literal
from uuid import UUID

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, BackgroundTasks, Depends, Query, status

from app.core.container import Container
from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import NotFoundError
from app.schemas.course import (
    CourseCreateRequest,
    CourseCreateResponse,
    CourseCreatorInfo,
    CourseDetail,
    CourseListItem,
    CourseListResponse,
    CourseMarker,
    CourseStatsInfo,
    CourseStatsResponse,
    CourseUpdateRequest,
    NearbyCourse,
)
from app.services.course_service import CourseService
from app.tasks.thumbnail import generate_course_thumbnail

router = APIRouter(prefix="/courses", tags=["courses"])


@router.post("", response_model=CourseCreateResponse, status_code=status.HTTP_201_CREATED)
@inject
async def create_course(
    body: CourseCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
    course_service: CourseService = Depends(Provide[Container.course_service]),
) -> CourseCreateResponse:
    """Create a new course from a run record."""
    course = await course_service.create_course(
        db=db,
        user_id=current_user.id,
        run_record_id=UUID(body.run_record_id),
        title=body.title,
        description=body.description,
        route_geometry_geojson=body.route_geometry.model_dump(),
        distance_meters=body.distance_meters,
        estimated_duration_seconds=body.estimated_duration_seconds,
        elevation_gain_meters=body.elevation_gain_meters,
        elevation_profile=body.elevation_profile,
        is_public=body.is_public,
        tags=body.tags,
    )

    background_tasks.add_task(generate_course_thumbnail, course_id=course.id)

    return CourseCreateResponse(
        id=str(course.id),
        title=course.title,
        distance_meters=course.distance_meters,
        thumbnail_url=course.thumbnail_url,
        created_at=course.created_at,
    )


@router.get("", response_model=CourseListResponse)
@inject
async def list_courses(
    db: DbSession,
    search: str | None = Query(None, min_length=1, max_length=100),
    min_distance: int | None = Query(None, ge=0),
    max_distance: int | None = Query(None, ge=0),
    near_lat: float | None = Query(None, ge=-90, le=90),
    near_lng: float | None = Query(None, ge=-180, le=180),
    near_radius: int = Query(10000, ge=100, le=100000),
    order_by: Literal["created_at", "total_runs", "distance_meters", "distance_from_user"] = Query("created_at"),
    order: Literal["asc", "desc"] = Query("desc"),
    page: int = Query(0, ge=0),
    per_page: int = Query(20, ge=1, le=100),
    course_service: CourseService = Depends(Provide[Container.course_service]),
) -> CourseListResponse:
    """List public courses with filtering, spatial search, and pagination."""
    courses_data, total_count = await course_service.list_courses(
        db=db,
        search=search,
        min_distance=min_distance,
        max_distance=max_distance,
        near_lat=near_lat,
        near_lng=near_lng,
        near_radius=near_radius,
        order_by=order_by,
        order=order,
        page=page,
        per_page=per_page,
    )

    data = [
        CourseListItem(
            id=c["id"],
            title=c["title"],
            thumbnail_url=c["thumbnail_url"],
            distance_meters=c["distance_meters"],
            estimated_duration_seconds=c["estimated_duration_seconds"],
            elevation_gain_meters=c["elevation_gain_meters"],
            creator=CourseCreatorInfo(**c["creator"]),
            stats=CourseStatsInfo(**c["stats"]),
            created_at=c["created_at"],
            distance_from_user_meters=c.get("distance_from_user_meters"),
        )
        for c in courses_data
    ]

    has_next = (page + 1) * per_page < total_count
    return CourseListResponse(data=data, total_count=total_count, has_next=has_next)


@router.get("/nearby", response_model=list[NearbyCourse])
@inject
async def get_nearby_courses(
    db: DbSession,
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius: int = Query(5000, ge=100, le=50000),
    limit: int = Query(5, ge=1, le=50),
    course_service: CourseService = Depends(Provide[Container.course_service]),
) -> list[NearbyCourse]:
    """Get nearby courses for the home screen."""
    nearby_data = await course_service.get_nearby_courses(db=db, lat=lat, lng=lng, radius=radius, limit=limit)
    return [NearbyCourse(**c) for c in nearby_data]


@router.get("/bounds", response_model=list[CourseMarker])
@inject
async def get_courses_in_bounds(
    db: DbSession,
    sw_lat: float = Query(..., ge=-90, le=90),
    sw_lng: float = Query(..., ge=-180, le=180),
    ne_lat: float = Query(..., ge=-90, le=90),
    ne_lng: float = Query(..., ge=-180, le=180),
    limit: int = Query(50, ge=1, le=200),
    course_service: CourseService = Depends(Provide[Container.course_service]),
) -> list[CourseMarker]:
    """Get course markers within a map viewport bounding box."""
    markers_data = await course_service.get_courses_in_bounds(
        db=db, sw_lat=sw_lat, sw_lng=sw_lng, ne_lat=ne_lat, ne_lng=ne_lng, limit=limit,
    )
    return [CourseMarker(**m) for m in markers_data]


@router.get("/{course_id}", response_model=CourseDetail)
@inject
async def get_course_detail(
    course_id: UUID,
    db: DbSession,
    course_service: CourseService = Depends(Provide[Container.course_service]),
) -> CourseDetail:
    """Get full course detail including route geometry."""
    detail = await course_service.get_course_detail(db, course_id)
    if detail is None:
        raise NotFoundError(code="NOT_FOUND", message="Course not found")

    return CourseDetail(
        id=detail["id"],
        title=detail["title"],
        description=detail["description"],
        route_geometry=detail["route_geometry"],
        distance_meters=detail["distance_meters"],
        estimated_duration_seconds=detail["estimated_duration_seconds"],
        elevation_gain_meters=detail["elevation_gain_meters"],
        elevation_profile=detail["elevation_profile"],
        thumbnail_url=detail["thumbnail_url"],
        is_public=detail["is_public"],
        created_at=detail["created_at"],
        creator=CourseCreatorInfo(**detail["creator"]),
    )


@router.get("/{course_id}/stats", response_model=CourseStatsResponse)
@inject
async def get_course_stats(
    course_id: UUID,
    db: DbSession,
    course_service: CourseService = Depends(Provide[Container.course_service]),
) -> CourseStatsResponse:
    """Get statistics for a specific course."""
    course = await course_service.get_course_by_id(db, course_id)
    if course is None:
        raise NotFoundError(code="NOT_FOUND", message="Course not found")

    stats = await course_service.get_course_stats(db, course_id)
    if stats is None:
        return CourseStatsResponse(course_id=str(course_id))

    return CourseStatsResponse(
        course_id=str(stats.course_id),
        total_runs=stats.total_runs,
        unique_runners=stats.unique_runners,
        avg_duration_seconds=stats.avg_duration_seconds,
        avg_pace_seconds_per_km=stats.avg_pace_seconds_per_km,
        best_duration_seconds=stats.best_duration_seconds,
        best_pace_seconds_per_km=stats.best_pace_seconds_per_km,
        completion_rate=stats.completion_rate,
        runs_by_hour=stats.runs_by_hour or {},
        updated_at=stats.updated_at,
    )


@router.patch("/{course_id}", status_code=status.HTTP_200_OK)
@inject
async def update_course(
    course_id: UUID,
    body: CourseUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
    course_service: CourseService = Depends(Provide[Container.course_service]),
) -> dict:
    """Update a course (owner only)."""
    update_data = body.model_dump(exclude_unset=True)
    course = await course_service.update_course(db=db, course_id=course_id, user_id=current_user.id, update_data=update_data)
    return {"id": str(course.id), "title": course.title, "updated": True}


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def delete_course(
    course_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    course_service: CourseService = Depends(Provide[Container.course_service]),
) -> None:
    """Delete a course (owner only)."""
    await course_service.delete_course(db=db, course_id=course_id, user_id=current_user.id)
