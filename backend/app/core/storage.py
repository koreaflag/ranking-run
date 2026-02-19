"""File storage abstraction: local filesystem or S3 + CDN."""
import logging
import uuid
from pathlib import Path
from typing import Protocol

import aiofiles

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class FileStorage(Protocol):
    """Storage interface for file uploads."""
    async def upload(self, data: bytes, folder: str, extension: str) -> str:
        """Upload file and return public URL."""
        ...

    async def delete(self, url: str) -> None:
        """Delete a file by its URL."""
        ...


class LocalStorage:
    """Local filesystem storage for development."""

    def __init__(self, upload_dir: str = "./uploads"):
        self._upload_dir = Path(upload_dir)

    async def upload(self, data: bytes, folder: str, extension: str) -> str:
        target_dir = self._upload_dir / folder
        target_dir.mkdir(parents=True, exist_ok=True)

        filename = f"{uuid.uuid4().hex}{extension}"
        file_path = target_dir / filename

        async with aiofiles.open(file_path, "wb") as f:
            await f.write(data)

        return f"/uploads/{folder}/{filename}"

    async def delete(self, url: str) -> None:
        # Extract relative path from URL
        if url.startswith("/uploads/"):
            file_path = self._upload_dir / url[len("/uploads/"):]
            if file_path.exists():
                file_path.unlink()


class S3Storage:
    """AWS S3 storage with optional CDN URL rewriting."""

    def __init__(
        self,
        bucket: str,
        region: str,
        access_key: str,
        secret_key: str,
        cdn_base_url: str = "",
    ):
        self._bucket = bucket
        self._region = region
        self._cdn_base_url = cdn_base_url.rstrip("/")

        # Lazy import - only needed when S3 is configured
        import boto3
        self._s3 = boto3.client(
            "s3",
            region_name=region,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
        )

    async def upload(self, data: bytes, folder: str, extension: str) -> str:
        import asyncio

        filename = f"{uuid.uuid4().hex}{extension}"
        key = f"{folder}/{filename}"

        content_type_map = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
            ".gpx": "application/gpx+xml",
            ".fit": "application/octet-stream",
        }
        content_type = content_type_map.get(extension.lower(), "application/octet-stream")

        # Run S3 upload in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: self._s3.put_object(
                Bucket=self._bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
            ),
        )

        if self._cdn_base_url:
            return f"{self._cdn_base_url}/{key}"
        return f"https://{self._bucket}.s3.{self._region}.amazonaws.com/{key}"

    async def delete(self, url: str) -> None:
        import asyncio

        # Extract S3 key from URL
        if self._cdn_base_url and url.startswith(self._cdn_base_url):
            key = url[len(self._cdn_base_url) + 1:]
        elif f"{self._bucket}.s3." in url:
            key = url.split(".amazonaws.com/", 1)[-1]
        else:
            logger.warning("Cannot determine S3 key from URL: %s", url)
            return

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: self._s3.delete_object(Bucket=self._bucket, Key=key),
        )


def get_storage() -> LocalStorage | S3Storage:
    """Factory: returns S3Storage if configured, otherwise LocalStorage."""
    settings = get_settings()

    if settings.S3_BUCKET_NAME and settings.AWS_ACCESS_KEY_ID:
        logger.info("Using S3 storage: bucket=%s, region=%s", settings.S3_BUCKET_NAME, settings.S3_REGION)
        return S3Storage(
            bucket=settings.S3_BUCKET_NAME,
            region=settings.S3_REGION,
            access_key=settings.AWS_ACCESS_KEY_ID,
            secret_key=settings.AWS_SECRET_ACCESS_KEY,
            cdn_base_url=settings.CDN_BASE_URL,
        )

    logger.info("Using local file storage: %s", settings.UPLOAD_DIR)
    return LocalStorage(upload_dir=settings.UPLOAD_DIR)
