"""Import endpoints: GPX/FIT file upload and management."""

import os
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile, status
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbSession
from app.db.session import async_session_factory
from app.models.external_import import ExternalImport
from app.schemas.external_import import (
    CourseMatchInfo,
    ImportDetailResponse,
    ImportListResponse,
    ImportSummary,
    ImportUploadResponse,
)
from app.services.import_service import ImportService

router = APIRouter(prefix="/imports", tags=["imports"])

ALLOWED_EXTENSIONS = {".gpx", ".fit"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB


def _source_from_extension(ext: str) -> str:
    return "gpx_upload" if ext == ".gpx" else "fit_upload"


def _build_detail_response(imp: ExternalImport) -> ImportDetailResponse:
    summary = None
    if imp.import_summary:
        summary = ImportSummary(**imp.import_summary)

    course_match = None
    if imp.course_match:
        course_match = CourseMatchInfo(**imp.course_match)

    return ImportDetailResponse(
        id=str(imp.id),
        source=imp.source,
        status=imp.status,
        external_id=str(imp.external_id) if imp.external_id else None,
        original_filename=imp.original_filename,
        import_summary=summary,
        course_match=course_match,
        run_record_id=str(imp.run_record_id) if imp.run_record_id else None,
        error_message=imp.error_message,
        created_at=imp.created_at,
    )


async def _run_import_in_background(
    import_id: UUID,
    user_id: UUID,
) -> None:
    """Background task wrapper for import processing.

    Opens its own database session so the request session can be closed
    without blocking background work.
    """
    import_service = ImportService()
    async with async_session_factory() as db:
        await import_service.process_import(db, import_id, user_id)


@router.post("/upload", status_code=201)
async def upload_activity_file(
    file: UploadFile,
    current_user: CurrentUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
) -> ImportUploadResponse:
    """Upload a GPX or FIT file for import."""
    # Validate file extension
    ext = ""
    if file.filename:
        ext = os.path.splitext(file.filename)[1].lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "VALIDATION_ERROR",
                "message": (
                    f"Invalid file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
                ),
            },
        )

    # Read and validate size
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                "code": "UPLOAD_TOO_LARGE",
                "message": "File too large. Maximum size: 20MB",
            },
        )

    # Save file to disk
    import_service = ImportService()
    source = _source_from_extension(ext)
    file_path = await import_service.save_upload_file(
        contents, file.filename or f"upload{ext}", source
    )

    # Create import record
    ext_import = ExternalImport(
        user_id=current_user.id,
        source=source,
        original_filename=file.filename,
        file_path=file_path,
        status="pending",
    )
    db.add(ext_import)
    await db.commit()
    await db.refresh(ext_import)

    # Process in background
    background_tasks.add_task(
        _run_import_in_background, ext_import.id, current_user.id
    )

    return ImportUploadResponse(
        import_id=str(ext_import.id),
        status="pending",
        message="File uploaded. Processing will start shortly.",
    )


@router.get("/{import_id}")
async def get_import_status(
    import_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> ImportDetailResponse:
    """Check import status and results."""
    result = await db.execute(
        select(ExternalImport).where(
            ExternalImport.id == import_id,
            ExternalImport.user_id == current_user.id,
        )
    )
    ext_import = result.scalar_one_or_none()
    if ext_import is None:
        raise HTTPException(status_code=404, detail="Import not found")

    return _build_detail_response(ext_import)


@router.get("/")
async def list_imports(
    current_user: CurrentUser,
    db: DbSession,
    page: int = 0,
    per_page: int = 20,
) -> ImportListResponse:
    """List user's import history."""
    # Count total
    count_result = await db.execute(
        select(func.count())
        .select_from(ExternalImport)
        .where(ExternalImport.user_id == current_user.id)
    )
    total_count = count_result.scalar() or 0

    # Fetch page
    result = await db.execute(
        select(ExternalImport)
        .where(ExternalImport.user_id == current_user.id)
        .order_by(ExternalImport.created_at.desc())
        .offset(page * per_page)
        .limit(per_page)
    )
    imports = result.scalars().all()

    return ImportListResponse(
        data=[_build_detail_response(imp) for imp in imports],
        total_count=total_count,
        has_next=(page + 1) * per_page < total_count,
    )


@router.delete("/{import_id}", status_code=204)
async def delete_import(
    import_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    """Delete an import and its associated RunRecord."""
    result = await db.execute(
        select(ExternalImport).where(
            ExternalImport.id == import_id,
            ExternalImport.user_id == current_user.id,
        )
    )
    ext_import = result.scalar_one_or_none()
    if ext_import is None:
        raise HTTPException(status_code=404, detail="Import not found")

    # Delete associated run record if exists
    if ext_import.run_record_id:
        run_result = await db.execute(
            select(RunRecord).where(RunRecord.id == ext_import.run_record_id)
        )
        run_record = run_result.scalar_one_or_none()
        if run_record:
            await db.delete(run_record)

    # Delete the file from disk
    if ext_import.file_path:
        import aiofiles.os

        try:
            await aiofiles.os.remove(ext_import.file_path)
        except OSError:
            pass

    await db.delete(ext_import)
    await db.commit()
