"""Live group run endpoints: REST + WebSocket for real-time multi-user running."""

import logging
from uuid import UUID

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.container import Container
from app.core.deps import CurrentUser, DbSession
from app.core.security import decode_access_token
from app.db.session import async_session_factory
from app.models.user import User
from app.schemas.live_group_run import (
    LiveGroupRunCreateRequest,
    LiveGroupRunListResponse,
    LiveGroupRunResponse,
)
from app.services.live_group_run_service import (
    LiveGroupRunService,
    connection_manager,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["live-group-runs"])


# ------------------------------------------------------------------
# REST endpoints
# ------------------------------------------------------------------


@router.post(
    "/live-group-runs",
    response_model=LiveGroupRunResponse,
    status_code=201,
)
@inject
async def create_live_group_run(
    body: LiveGroupRunCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
    service: LiveGroupRunService = Depends(
        Provide[Container.live_group_run_service]
    ),
) -> LiveGroupRunResponse:
    result = await service.create_live_group_run(
        db=db,
        course_id=body.course_id,
        title=body.title,
        host_user_id=current_user.id,
        max_participants=body.max_participants,
        scheduled_at=body.scheduled_at,
    )
    return LiveGroupRunResponse(**result)


@router.get(
    "/live-group-runs",
    response_model=LiveGroupRunListResponse,
)
@inject
async def list_active_live_group_runs(
    current_user: CurrentUser,
    db: DbSession,
    course_id: UUID | None = Query(None),
    page: int = Query(0, ge=0),
    per_page: int = Query(20, ge=1, le=100),
    service: LiveGroupRunService = Depends(
        Provide[Container.live_group_run_service]
    ),
) -> LiveGroupRunListResponse:
    result = await service.get_active_live_group_runs(
        db=db,
        course_id=course_id,
        page=page,
        per_page=per_page,
    )
    return LiveGroupRunListResponse(
        data=[LiveGroupRunResponse(**d) for d in result["data"]],
        total_count=result["total_count"],
    )


@router.get(
    "/live-group-runs/{live_group_run_id}",
    response_model=LiveGroupRunResponse,
)
@inject
async def get_live_group_run(
    live_group_run_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    service: LiveGroupRunService = Depends(
        Provide[Container.live_group_run_service]
    ),
) -> LiveGroupRunResponse:
    result = await service.get_live_group_run(
        db=db, live_group_run_id=live_group_run_id
    )
    return LiveGroupRunResponse(**result)


@router.post(
    "/live-group-runs/{live_group_run_id}/join",
    response_model=LiveGroupRunResponse,
)
@inject
async def join_live_group_run(
    live_group_run_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    service: LiveGroupRunService = Depends(
        Provide[Container.live_group_run_service]
    ),
) -> LiveGroupRunResponse:
    result = await service.join_live_group_run(
        db=db,
        live_group_run_id=live_group_run_id,
        user_id=current_user.id,
    )
    return LiveGroupRunResponse(**result)


@router.post(
    "/live-group-runs/{live_group_run_id}/start",
    response_model=LiveGroupRunResponse,
)
@inject
async def start_live_group_run(
    live_group_run_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    service: LiveGroupRunService = Depends(
        Provide[Container.live_group_run_service]
    ),
) -> LiveGroupRunResponse:
    result = await service.start_live_group_run(
        db=db,
        live_group_run_id=live_group_run_id,
        user_id=current_user.id,
    )
    return LiveGroupRunResponse(**result)


# ------------------------------------------------------------------
# WebSocket endpoint
# ------------------------------------------------------------------


async def _authenticate_ws_token(token: str) -> UUID | None:
    """Verify JWT token from WebSocket query parameter and return user_id."""
    try:
        payload = decode_access_token(token)
        user_id_str: str | None = payload.get("sub")
        if user_id_str is None:
            return None
        return UUID(user_id_str)
    except (JWTError, ValueError):
        return None


@router.websocket("/live-group-runs/{live_group_run_id}/ws")
async def live_group_run_ws(
    websocket: WebSocket,
    live_group_run_id: UUID,
    token: str = Query(...),
) -> None:
    """WebSocket endpoint for real-time location sharing in a live group run.

    Client → Server messages:
        {"type": "location", "lat": float, "lng": float, "distance_m": float,
         "duration_s": int, "pace": "5'30\""}
        {"type": "completed"}

    Server → Client messages:
        {"type": "participants", "data": [...]}
        {"type": "started"}
        {"type": "completed", "user_id": "..."}
        {"type": "error", "message": "..."}
    """
    # Authenticate via query parameter token
    user_id = await _authenticate_ws_token(token)
    if user_id is None:
        await websocket.close(code=4001, reason="Invalid or expired token")
        return

    await websocket.accept()

    # Verify user exists and is a participant using a fresh session
    async with async_session_factory() as db:
        try:
            user_result = await db.execute(
                select(User).where(User.id == user_id)
            )
            user = user_result.scalar_one_or_none()
            if user is None:
                await websocket.send_json(
                    {"type": "error", "message": "유저를 찾을 수 없습니다"}
                )
                await websocket.close(code=4002, reason="User not found")
                return

            if user.is_banned:
                await websocket.send_json(
                    {"type": "error", "message": "정지된 계정입니다"}
                )
                await websocket.close(code=4003, reason="User banned")
                return
        except Exception:
            await db.rollback()
            await websocket.close(code=4000, reason="Internal error")
            return

    # Register connection
    await connection_manager.connect(live_group_run_id, user_id, websocket)

    try:
        # Send initial participant snapshot
        async with async_session_factory() as db:
            try:
                service = LiveGroupRunService()
                snapshot = await service.get_participants_snapshot(
                    db, live_group_run_id
                )
                await websocket.send_json(
                    {"type": "participants", "data": snapshot}
                )
            except Exception:
                await db.rollback()

        # Main message loop
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "location":
                async with async_session_factory() as db:
                    try:
                        service = LiveGroupRunService()
                        await service.update_participant_location(
                            db=db,
                            live_group_run_id=live_group_run_id,
                            user_id=user_id,
                            lat=data.get("lat", 0),
                            lng=data.get("lng", 0),
                            distance_m=data.get("distance_m", 0),
                            duration_s=data.get("duration_s", 0),
                            pace=data.get("pace"),
                        )
                        await db.commit()

                        # Broadcast updated positions to all clients
                        snapshot = await service.get_participants_snapshot(
                            db, live_group_run_id
                        )
                        await connection_manager.broadcast_all(
                            live_group_run_id,
                            {"type": "participants", "data": snapshot},
                        )
                    except Exception:
                        await db.rollback()
                        logger.exception(
                            "Error updating location for user %s in live group run %s",
                            user_id,
                            live_group_run_id,
                        )

            elif msg_type == "completed":
                async with async_session_factory() as db:
                    try:
                        service = LiveGroupRunService()
                        await service.mark_participant_completed(
                            db=db,
                            live_group_run_id=live_group_run_id,
                            user_id=user_id,
                        )
                        await db.commit()
                    except Exception:
                        await db.rollback()
                        logger.exception(
                            "Error marking completion for user %s in live group run %s",
                            user_id,
                            live_group_run_id,
                        )

    except WebSocketDisconnect:
        logger.info(
            "WebSocket disconnected: user %s from live group run %s",
            user_id,
            live_group_run_id,
        )
    except Exception:
        logger.exception(
            "WebSocket error: user %s in live group run %s",
            user_id,
            live_group_run_id,
        )
    finally:
        await connection_manager.disconnect(live_group_run_id, user_id)

        # Mark as dropped if the group run is still running
        async with async_session_factory() as db:
            try:
                service = LiveGroupRunService()
                await service.mark_participant_dropped(
                    db=db,
                    live_group_run_id=live_group_run_id,
                    user_id=user_id,
                )
                await db.commit()

                # Broadcast updated snapshot
                snapshot = await service.get_participants_snapshot(
                    db, live_group_run_id
                )
                await connection_manager.broadcast_all(
                    live_group_run_id,
                    {"type": "participants", "data": snapshot},
                )
            except Exception:
                await db.rollback()
