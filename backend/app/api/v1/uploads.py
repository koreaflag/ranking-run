"""Upload endpoints: avatar image upload."""
import os

from fastapi import APIRouter, HTTPException, UploadFile, status

from app.core.config import get_settings
from app.core.deps import CurrentUser
from app.core.storage import get_storage

router = APIRouter(prefix="/uploads", tags=["uploads"])

settings = get_settings()

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


@router.post("/avatar")
async def upload_avatar(
    file: UploadFile,
    current_user: CurrentUser,
) -> dict:
    """Upload a profile avatar image. Accepts JPEG, PNG, WebP up to 5MB."""
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
    ext = ".jpg"
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

    # Upload via storage abstraction (local or S3)
    storage = get_storage()
    url = await storage.upload(data=contents, folder="avatars", extension=ext)

    return {"url": url}
