"""Upload endpoints: avatar image upload."""

import os
import uuid
from pathlib import Path

import aiofiles
from fastapi import APIRouter, HTTPException, UploadFile, status

from app.core.config import get_settings
from app.core.deps import CurrentUser

router = APIRouter(prefix="/uploads", tags=["uploads"])

settings = get_settings()

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


@router.post("/avatar")
async def upload_avatar(
    file: UploadFile,
    current_user: CurrentUser,
) -> dict:
    """Upload a profile avatar image.

    Accepts JPEG, PNG, and WebP images up to 5MB.
    Returns the public URL of the uploaded image.

    In production, this would upload to S3/GCS. For MVP,
    files are saved to local storage.
    """
    # Validate content type
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "VALIDATION_ERROR",
                "message": f"Invalid file type: {file.content_type}. Allowed: {', '.join(ALLOWED_CONTENT_TYPES)}",
            },
        )

    # Validate file extension
    if file.filename:
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "VALIDATION_ERROR",
                    "message": f"Invalid file extension: {ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
                },
            )
    else:
        ext = ".jpg"

    # Read and validate size
    contents = await file.read()
    max_size = settings.max_upload_size_bytes
    if len(contents) > max_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                "code": "UPLOAD_TOO_LARGE",
                "message": f"File too large. Maximum size: {settings.MAX_UPLOAD_SIZE_MB}MB",
            },
        )

    # Generate unique filename
    file_id = uuid.uuid4().hex
    filename = f"{file_id}{ext}"

    # Ensure upload directory exists
    upload_dir = Path(settings.UPLOAD_DIR) / "avatars"
    upload_dir.mkdir(parents=True, exist_ok=True)

    file_path = upload_dir / filename

    # Write file
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(contents)

    # In production, this would be an S3 URL
    url = f"/uploads/avatars/{filename}"

    return {"url": url}
