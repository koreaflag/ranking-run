"""Announcement service: CRUD for service notices and events."""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.announcement import Announcement


class AnnouncementService:

    async def get_active(
        self,
        db: AsyncSession,
        limit: int = 10,
    ) -> list[dict]:
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(Announcement)
            .where(
                Announcement.is_active.is_(True),
                # Either no date range or within range
                (Announcement.starts_at.is_(None) | (Announcement.starts_at <= now)),
                (Announcement.ends_at.is_(None) | (Announcement.ends_at >= now)),
            )
            .order_by(Announcement.priority.desc(), Announcement.created_at.desc())
            .limit(limit)
        )
        return [self._to_dict(a) for a in result.scalars().all()]

    async def create(
        self,
        db: AsyncSession,
        data: dict,
    ) -> dict:
        ann = Announcement(
            title=data["title"],
            content=data.get("content"),
            image_url=data.get("image_url"),
            link_type=data.get("link_type", "none"),
            link_value=data.get("link_value"),
            priority=data.get("priority", 0),
            starts_at=data.get("starts_at"),
            ends_at=data.get("ends_at"),
        )
        db.add(ann)
        await db.flush()
        await db.refresh(ann)
        return self._to_dict(ann)

    @staticmethod
    def _to_dict(ann: Announcement) -> dict:
        return {
            "id": str(ann.id),
            "title": ann.title,
            "content": ann.content,
            "image_url": ann.image_url,
            "link_type": ann.link_type,
            "link_value": ann.link_value,
            "priority": ann.priority,
            "starts_at": ann.starts_at,
            "ends_at": ann.ends_at,
            "created_at": ann.created_at,
        }
