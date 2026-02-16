"""Run endpoints: sessions, chunks, completion, recovery, and record detail."""

from uuid import UUID

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, BackgroundTasks, Depends, status

from app.core.container import Container
from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import NotFoundError
from app.schemas.run import (
    BatchChunkUploadRequest,
    BatchChunkUploadResponse,
    ChunkUploadRequest,
    ChunkUploadResponse,
    RunCompleteRequest,
    RunCompleteResponse,
    RunCourseCompletion,
    RunCourseInfo,
    RunRecordDetail,
    RunRecoverRequest,
    RunRecoverResponse,
    RunSplitDetail,
    SessionCreateRequest,
    SessionCreateResponse,
    UserStatsUpdate,
)
from app.services.run_service import RunService
from app.tasks.ranking import recalculate_course_ranking
from app.tasks.stats import update_stats_after_run

router = APIRouter(prefix="/runs", tags=["runs"])


@router.post("/sessions", response_model=SessionCreateResponse, status_code=status.HTTP_201_CREATED)
@inject
async def create_run_session(
    body: SessionCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
    run_service: RunService = Depends(Provide[Container.run_service]),
) -> SessionCreateResponse:
    """Create a new run session when the user starts running."""
    course_id = UUID(body.course_id) if body.course_id else None
    session = await run_service.create_session(
        db=db,
        user_id=current_user.id,
        started_at=body.started_at,
        course_id=course_id,
        device_info=body.device_info.model_dump() if body.device_info else None,
    )

    return SessionCreateResponse(
        session_id=str(session.id),
        created_at=session.created_at,
    )


@router.post(
    "/sessions/{session_id}/chunks",
    response_model=ChunkUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
@inject
async def upload_run_chunk(
    session_id: UUID,
    body: ChunkUploadRequest,
    current_user: CurrentUser,
    db: DbSession,
    run_service: RunService = Depends(Provide[Container.run_service]),
) -> ChunkUploadResponse:
    """Upload a GPS data chunk during a run."""
    chunk = await run_service.upload_chunk(
        db=db,
        user_id=current_user.id,
        session_id=session_id,
        sequence=body.sequence,
        chunk_type=body.chunk_type,
        raw_gps_points=[p.model_dump() for p in body.raw_gps_points],
        filtered_points=[p.model_dump() for p in body.filtered_points] if body.filtered_points else None,
        chunk_summary=body.chunk_summary.model_dump(),
        cumulative=body.cumulative.model_dump(),
        completed_splits=[s.model_dump() for s in body.completed_splits],
        pause_intervals=[p.model_dump() for p in body.pause_intervals],
    )

    return ChunkUploadResponse(
        chunk_id=str(chunk.id),
        sequence=chunk.sequence,
        received_at=chunk.created_at,
    )


@router.post(
    "/sessions/{session_id}/chunks/batch",
    response_model=BatchChunkUploadResponse,
)
@inject
async def batch_upload_run_chunks(
    session_id: UUID,
    body: BatchChunkUploadRequest,
    current_user: CurrentUser,
    db: DbSession,
    run_service: RunService = Depends(Provide[Container.run_service]),
) -> BatchChunkUploadResponse:
    """Batch upload missed chunks for recovery."""
    chunks_data = []
    for chunk_req in body.chunks:
        chunks_data.append({
            "sequence": chunk_req.sequence,
            "chunk_type": chunk_req.chunk_type,
            "raw_gps_points": [p.model_dump() for p in chunk_req.raw_gps_points],
            "filtered_points": [p.model_dump() for p in chunk_req.filtered_points] if chunk_req.filtered_points else None,
            "chunk_summary": chunk_req.chunk_summary.model_dump(),
            "cumulative": chunk_req.cumulative.model_dump(),
            "completed_splits": [s.model_dump() for s in chunk_req.completed_splits],
            "pause_intervals": [p.model_dump() for p in chunk_req.pause_intervals],
        })

    received, failed = await run_service.batch_upload_chunks(
        db=db,
        user_id=current_user.id,
        session_id=session_id,
        chunks_data=chunks_data,
    )

    return BatchChunkUploadResponse(
        received_sequences=received,
        failed_sequences=failed,
    )


@router.post(
    "/sessions/{session_id}/complete",
    response_model=RunCompleteResponse,
    status_code=status.HTTP_201_CREATED,
)
@inject
async def complete_run_session(
    session_id: UUID,
    body: RunCompleteRequest,
    current_user: CurrentUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
    run_service: RunService = Depends(Provide[Container.run_service]),
) -> RunCompleteResponse:
    """Complete a run session and create the final run record."""
    complete_data = body.model_dump()
    if body.route_geometry:
        complete_data["route_geometry"] = body.route_geometry.model_dump()
    if body.course_completion:
        complete_data["course_completion"] = body.course_completion.model_dump()
    if body.filter_config:
        complete_data["filter_config"] = body.filter_config.model_dump()
    complete_data["splits"] = [s.model_dump() for s in body.splits]
    complete_data["pause_intervals"] = [p.model_dump() for p in body.pause_intervals]

    run_record, missing_chunks = await run_service.complete_session(
        db=db,
        user_id=current_user.id,
        session_id=session_id,
        complete_data=complete_data,
    )

    background_tasks.add_task(
        update_stats_after_run,
        user_id=current_user.id,
        run_record_id=run_record.id,
        course_id=run_record.course_id,
        distance_meters=run_record.distance_meters,
    )

    if run_record.course_id and run_record.course_completed:
        background_tasks.add_task(
            recalculate_course_ranking,
            course_id=run_record.course_id,
            user_id=current_user.id,
            run_record_id=run_record.id,
        )

    user_stats_update = UserStatsUpdate(
        total_distance_meters=current_user.total_distance_meters + run_record.distance_meters,
        total_runs=current_user.total_runs + 1,
    )

    return RunCompleteResponse(
        run_record_id=str(run_record.id),
        user_stats_update=user_stats_update,
        missing_chunk_sequences=missing_chunks,
    )


@router.post(
    "/sessions/{session_id}/recover",
    response_model=RunRecoverResponse,
)
@inject
async def recover_run_session(
    session_id: UUID,
    body: RunRecoverRequest,
    current_user: CurrentUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
    run_service: RunService = Depends(Provide[Container.run_service]),
) -> RunRecoverResponse:
    """Recover a crashed run session from server-held chunks."""
    run_record, missing_chunks = await run_service.recover_session(
        db=db,
        user_id=current_user.id,
        session_id=session_id,
        finished_at=body.finished_at,
        total_chunks=body.total_chunks,
        uploaded_chunk_sequences=body.uploaded_chunk_sequences,
    )

    background_tasks.add_task(
        update_stats_after_run,
        user_id=current_user.id,
        run_record_id=run_record.id,
        course_id=run_record.course_id,
        distance_meters=run_record.distance_meters,
    )

    return RunRecoverResponse(
        run_record_id=str(run_record.id),
        recovered_distance_meters=run_record.distance_meters,
        recovered_duration_seconds=run_record.duration_seconds,
        missing_chunk_sequences=missing_chunks,
    )


@router.get("/{run_id}", response_model=RunRecordDetail)
@inject
async def get_run_record_detail(
    run_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    run_service: RunService = Depends(Provide[Container.run_service]),
) -> RunRecordDetail:
    """Get a detailed run record."""
    record = await run_service.get_run_record(db, run_id, current_user.id)
    if record is None:
        raise NotFoundError(code="NOT_FOUND", message="Run record not found")

    course_info = None
    if record.course is not None:
        course_info = RunCourseInfo(
            id=str(record.course.id),
            title=record.course.title,
            distance_meters=record.course.distance_meters,
        )

    course_completion = None
    if record.course_completed is not None:
        course_completion = RunCourseCompletion(
            is_completed=record.course_completed,
            route_match_percent=record.route_match_percent or 0.0,
        )

    route_geo = None
    if record.route_geometry is not None:
        route_geo = record.route_geometry

    splits = None
    if record.splits:
        splits = [RunSplitDetail(**s) if isinstance(s, dict) else s for s in record.splits]

    return RunRecordDetail(
        id=str(record.id),
        user_id=str(record.user_id),
        course_id=str(record.course_id) if record.course_id else None,
        distance_meters=record.distance_meters,
        duration_seconds=record.duration_seconds,
        total_elapsed_seconds=record.total_elapsed_seconds,
        avg_pace_seconds_per_km=record.avg_pace_seconds_per_km,
        best_pace_seconds_per_km=record.best_pace_seconds_per_km,
        avg_speed_ms=record.avg_speed_ms,
        max_speed_ms=record.max_speed_ms,
        calories=record.calories,
        elevation_gain_meters=record.elevation_gain_meters,
        elevation_loss_meters=record.elevation_loss_meters,
        route_geometry=route_geo,
        elevation_profile=record.elevation_profile,
        splits=splits,
        started_at=record.started_at,
        finished_at=record.finished_at,
        course=course_info,
        course_completion=course_completion,
    )
